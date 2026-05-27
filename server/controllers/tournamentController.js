// server/controllers/tournamentController.js
const { Tournament } = require("../models/other");
const matchController = require("./matchController");

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
      .populate({ path: "matches", select: "teamA teamB teamAShort teamBShort status innings1 innings2 matchDate format result matchTitle" })
      .lean();
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, tournament: t });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createTournament = async (req, res) => {
  try {
    const t = await Tournament.create(req.body);
    res.status(201).json({ success: true, tournament: t });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateTournament = async (req, res) => {
  try {
    const t = await Tournament.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!t) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, tournament: t });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteTournament = async (req, res) => {
  try {
    await Tournament.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updatePointsTable = async (req, res) => {
  try {
    const t = await Tournament.findByIdAndUpdate(
      req.params.id,
      { pointsTable: req.body.pointsTable },
      { new: true }
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
