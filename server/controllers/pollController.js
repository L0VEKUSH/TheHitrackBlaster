// server/controllers/pollController.js
const Poll = require("../models/Poll");
const { User } = require("../models/other");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { pick } = require("../utils/input");

// Simple in-memory cache to handle high concurrent user load without crashing the DB
const pollCache = new Map();
const CACHE_TTL_MS = 5000; // 5 seconds TTL

const leaderboardCache = { data: null, timestamp: 0 };
const LEADERBOARD_TTL_MS = 30000; // 30 seconds TTL for leaderboard

const getPollCacheKey = (matchId, all = false) => `${matchId}:${all}`;
const clearPollCache = (matchId) => {
  pollCache.delete(getPollCacheKey(String(matchId), false));
  pollCache.delete(getPollCacheKey(String(matchId), true));
};
const cachePolls = (key, polls, now) => {
  for (const [cacheKey, cached] of pollCache) {
    if (now - cached.timestamp >= CACHE_TTL_MS) pollCache.delete(cacheKey);
  }
  if (pollCache.size >= 1000) pollCache.delete(pollCache.keys().next().value);
  pollCache.set(key, { polls, timestamp: now });
};

exports.getMatchPolls = async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const all = req.query.all === "true";
    const cacheKey = getPollCacheKey(matchId, all);
    const now = Date.now();

    if (pollCache.has(cacheKey)) {
      const cached = pollCache.get(cacheKey);
      if (now - cached.timestamp < CACHE_TTL_MS) {
        return res.json({ success: true, data: cached.polls });
      }
    }

    const query = { matchId };
    if (!all) {
      query.isActive = true;
    }

    const polls = await Poll.find(query).sort({ createdAt: -1 }).limit(100).lean();
    cachePolls(cacheKey, polls, now);

    res.json({ success: true, data: polls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createPoll = async (req, res) => {
  try {
    const data = pick(req.body, ["matchId", "question", "options", "isActive", "type", "overNumber"]);
    if (!Array.isArray(data.options) || data.options.length < 2 || data.options.length > 10) {
      return res.status(400).json({ success: false, message: "A poll requires 2 to 10 options" });
    }
    data.options = data.options.map((option) => ({ text: String(option?.text || "").trim() }));
    const poll = await Poll.create(data);
    clearPollCache(poll.matchId);
    res.status(201).json({ success: true, data: poll });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.votePoll = async (req, res) => {
  try {
    const { pollId, optionId } = req.body;
    let userId = null;

    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.split(" ")[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
        if (decoded.type === "user") userId = decoded.id;
      } catch (_invalidToken) {
        // Voting remains available anonymously; invalid tokens receive no user identity.
      }
    }

    if (!mongoose.Types.ObjectId.isValid(pollId) || !mongoose.Types.ObjectId.isValid(optionId)) {
      return res.status(400).json({ success: false, message: "Invalid poll or option ID" });
    }

    const updateQuery = { 
      $inc: { "options.$.votes": 1, totalVotes: 1 } 
    };

    if (userId) {
      updateQuery.$addToSet = { "options.$.voters": userId };
    }

    const filter = { _id: pollId, "options._id": optionId, isActive: true, isResolved: false };
    if (userId) filter["options.voters"] = { $ne: userId };
    const poll = await Poll.findOneAndUpdate(
      filter,
      updateQuery,
      { new: true, runValidators: true }
    );
    
    if (!poll) {
      return res.status(userId ? 409 : 404).json({
        success: false,
        message: userId ? "Vote already recorded, poll closed, or option invalid" : "Poll is closed or option not found",
      });
    }
    
    clearPollCache(poll.matchId);
    res.json({ success: true, data: poll });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.resolvePoll = async (req, res) => {
  try {
    const { id: pollId } = req.params;
    const { correctOptionId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(pollId) || !mongoose.Types.ObjectId.isValid(correctOptionId)) {
      return res.status(400).json({ success: false, message: "Invalid poll or option ID" });
    }
    const poll = await Poll.findOneAndUpdate(
      { _id: pollId, isResolved: false, "options._id": correctOptionId },
      { $set: { isResolved: true, correctOptionId, isActive: false } },
      { new: true, runValidators: true },
    );
    if (!poll) {
      const exists = await Poll.exists({ _id: pollId });
      return res.status(exists ? 409 : 404).json({
        success: false,
        message: exists ? "Poll is already resolved or option is invalid" : "Poll not found",
      });
    }

    // Award points to users who voted correctly
    const correctOption = poll.options.find(o => o._id.toString() === correctOptionId);
    if (correctOption && correctOption.voters && correctOption.voters.length > 0) {
      await User.updateMany(
        { _id: { $in: correctOption.voters } },
        { $inc: { pollPoints: 10 } }
      );
    }

    clearPollCache(poll.matchId);
    res.json({ success: true, message: "Poll resolved and points awarded", data: poll });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPollLeaderboard = async (req, res) => {
  try {
    const now = Date.now();
    if (leaderboardCache.data && (now - leaderboardCache.timestamp < LEADERBOARD_TTL_MS)) {
      return res.json({ success: true, data: leaderboardCache.data });
    }

    const users = await User.find({ pollPoints: { $gt: 0 } })
      .sort({ pollPoints: -1 })
      .limit(50)
      .select("name avatar favoriteTeam pollPoints")
      .lean();
      
    leaderboardCache.data = users;
    leaderboardCache.timestamp = now;

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
