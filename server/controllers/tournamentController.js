// server/controllers/tournamentController.js
const { Tournament } = require("../models/other");
const matchController = require("./matchController");
const { serializeMatch } = require("../services/matchSerializer");
const { pick, validationStatus } = require("../utils/input");

const WRITABLE_FIELDS = [
  "name", "shortName", "logo", "type", "format", "rules", "startDate", "endDate",
  "host", "teams", "isActive", "isFeatured",
];
const POINT_FIELDS = ["team", "played", "won", "lost", "tied", "nr", "points", "nrr"];

exports.getTournaments = async (req, res) => {
  try {
    const { active, featured } = req.query;
    const query = {};
    if (active   !== undefined) query.isActive   = active   === "true";
    if (featured !== undefined) query.isFeatured = featured === "true";
    const tournaments = await Tournament.find(query).sort({ startDate: -1 }).lean();
    res.json({ success: true, tournaments });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getTournament = async (req, res) => {
  try {
    const t = await Tournament.findById(req.params.id)
      .populate({
        path: "matches",
        select: "teamA teamB teamAShort teamBShort teamAFlag teamBFlag status phase innings1.battingTeam innings1.runs innings1.wickets innings1.balls innings1.isDone innings2.battingTeam innings2.runs innings2.wickets innings2.balls innings2.isDone matchDate format result matchTitle target requiredRuns requiredRunRate currentInnings eventSequence",
      })
      .lean();
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    t.matches = Array.isArray(t.matches) ? t.matches.map(serializeMatch) : [];
    res.json({ success: true, tournament: t });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createTournament = async (req, res) => {
  try {
    const t = await Tournament.create(pick(req.body, WRITABLE_FIELDS));
    res.status(201).json({ success: true, tournament: t });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to create tournament" : err.message });
  }
};

exports.updateTournament = async (req, res) => {
  try {
    const t = await Tournament.findByIdAndUpdate(
      req.params.id,
      pick(req.body, WRITABLE_FIELDS),
      { new: true, runValidators: true, context: "query" },
    );
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, tournament: t });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to update tournament" : err.message });
  }
};

exports.deleteTournament = async (req, res) => {
  try {
    const tournament = await Tournament.findByIdAndDelete(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updatePointsTable = async (req, res) => {
  try {
    if (!Array.isArray(req.body.pointsTable) || req.body.pointsTable.length > 100) {
      return res.status(400).json({ success: false, message: "pointsTable must contain at most 100 rows" });
    }
    const pointsTable = req.body.pointsTable.map((row) => pick(row, POINT_FIELDS));
    const t = await Tournament.findByIdAndUpdate(
      req.params.id,
      { pointsTable },
      { new: true, runValidators: true, context: "query" }
    );
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, tournament: t });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getLeaderboards = async (req, res) => {
  try {
    const t = await Tournament.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    if (!t.playerLeaderboards || Object.keys(t.playerLeaderboards || {}).length === 0) {
      // Attempt a rebuild
      await matchController.rebuildPlayerLeaderboards(req.params.id);
      const refreshed = await Tournament.findById(req.params.id).lean();
      return res.json({ success: true, leaderboards: refreshed.playerLeaderboards || {} });
    }
    res.json({ success: true, leaderboards: t.playerLeaderboards });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.rebuildLeaderboards = async (req, res) => {
  try {
    const leaderboards = await matchController.rebuildPlayerLeaderboards(req.params.id);
    if (!leaderboards) return res.status(404).json({ success: false, message: "Tournament not found or no completed matches" });
    res.json({ success: true, leaderboards });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
