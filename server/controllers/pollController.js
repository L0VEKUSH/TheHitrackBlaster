// server/controllers/pollController.js
const Poll = require("../models/Poll");
const { User } = require("../models/other");
const jwt = require("jsonwebtoken");

// Simple in-memory cache to handle high concurrent user load without crashing the DB
const pollCache = new Map();
const CACHE_TTL_MS = 5000; // 5 seconds TTL

const leaderboardCache = { data: null, timestamp: 0 };
const LEADERBOARD_TTL_MS = 30000; // 30 seconds TTL for leaderboard

const getPollCacheKey = (matchId, all = false) => `${matchId}:${all}`;

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

    const polls = await Poll.find(query).sort({ createdAt: -1 });
    pollCache.set(cacheKey, { polls, timestamp: now });

    res.json({ success: true, data: polls });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createPoll = async (req, res) => {
  try {
    const poll = await Poll.create(req.body);
    pollCache.delete(getPollCacheKey(String(req.body.matchId), false));
    pollCache.delete(getPollCacheKey(String(req.body.matchId), true));
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
      } catch (e) {}
    }

    const updateQuery = { 
      $inc: { "options.$.votes": 1, totalVotes: 1 } 
    };

    if (userId) {
      updateQuery.$addToSet = { "options.$.voters": userId };
    }

    const poll = await Poll.findOneAndUpdate(
      { _id: pollId, "options._id": optionId },
      updateQuery,
      { new: true }
    );
    
    if (!poll) return res.status(404).json({ success: false, message: "Poll or option not found" });
    
    pollCache.delete(getPollCacheKey(String(poll.matchId), false));
    pollCache.delete(getPollCacheKey(String(poll.matchId), true));
    res.json({ success: true, data: poll });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.resolvePoll = async (req, res) => {
  try {
    const { id: pollId } = req.params;
    const { correctOptionId } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ success: false, message: "Poll not found" });
    if (poll.isResolved) return res.status(400).json({ success: false, message: "Poll already resolved" });

    poll.isResolved = true;
    poll.correctOptionId = correctOptionId;
    poll.isActive = false; // Hide from live polls once resolved
    await poll.save();

    // Award points to users who voted correctly
    const correctOption = poll.options.find(o => o._id.toString() === correctOptionId);
    if (correctOption && correctOption.voters && correctOption.voters.length > 0) {
      await User.updateMany(
        { _id: { $in: correctOption.voters } },
        { $inc: { pollPoints: 10 } }
      );
    }

    pollCache.delete(getPollCacheKey(String(poll.matchId), false));
    pollCache.delete(getPollCacheKey(String(poll.matchId), true));
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
      .select("name avatar favoriteTeam pollPoints");
      
    leaderboardCache.data = users;
    leaderboardCache.timestamp = now;

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

