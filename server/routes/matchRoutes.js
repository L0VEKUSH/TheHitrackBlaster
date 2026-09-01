// server/routes/matchRoutes.js
const express          = require("express");
const r                = express.Router();
const {
  getMatches, getLiveMatches, getMatch,
  createMatch, updateMatch, deleteMatch,
} = require("../controllers/matchController");
const liveScoring = require("../controllers/liveScoringController");
const { protectAdmin } = require("../middleware/auth");
const { preventConcurrentUpdates } = require("../middleware/validation");

// Public
r.get("/",                          getMatches);
r.get("/live/all",                  getLiveMatches);
r.get("/:id",                       getMatch);
r.get("/:id/ai-predictions",        require("../controllers/matchController").getMatchPredictions);

// Admin
r.post("/",                         protectAdmin, createMatch);
r.put("/:id",                       protectAdmin, preventConcurrentUpdates, updateMatch);
r.delete("/:id",                    protectAdmin, preventConcurrentUpdates, deleteMatch);
r.post("/:id/toss",                 protectAdmin, preventConcurrentUpdates, liveScoring.setToss);
r.post("/:id/score",                protectAdmin, preventConcurrentUpdates, liveScoring.updateScore);
r.post("/:id/undo",                  protectAdmin, preventConcurrentUpdates, liveScoring.undoLastAction);
r.post("/:id/redo",                  protectAdmin, preventConcurrentUpdates, liveScoring.redoLastAction);
r.post("/:id/innings/:num/batsman", protectAdmin, preventConcurrentUpdates, liveScoring.addBatsman);
r.post("/:id/innings/:num/bowler",  protectAdmin, preventConcurrentUpdates, liveScoring.addBowler);
r.post("/:id/commentary",           protectAdmin, preventConcurrentUpdates, liveScoring.addCommentary);
r.post("/:id/declare",              protectAdmin, preventConcurrentUpdates, liveScoring.declareInnings);
r.post("/:id/super-over",           protectAdmin, preventConcurrentUpdates, liveScoring.startSuperOver);
r.put("/:id/status",                protectAdmin, preventConcurrentUpdates, liveScoring.setMatchStatus);
r.put("/:id/man-of-match",          protectAdmin, preventConcurrentUpdates, liveScoring.setManOfTheMatch);

module.exports = r;
