// server/routes/matchRoutes.js
const express          = require("express");
const r                = express.Router();
const {
  getMatches, getLiveMatches, getMatch,
  createMatch, updateMatch, deleteMatch,
  setToss, updateScore, addBatsman, addBowler,
  addCommentary, undoLastBall, setMatchStatus, startSuperOver
} = require("../controllers/matchController");
const { protectAdmin } = require("../middleware/auth");
const { preventConcurrentUpdates, validateScoreUpdate } = require("../middleware/validation");

// Public
r.get("/",                          getMatches);
r.get("/live/all",                  getLiveMatches);
r.get("/:id",                       getMatch);
r.get("/:id/ai-predictions",        require("../controllers/matchController").getMatchPredictions);

// Admin
r.post("/",                         protectAdmin, createMatch);
r.put("/:id",                       protectAdmin, updateMatch);
r.delete("/:id",                    protectAdmin, deleteMatch);
r.post("/:id/toss",                 protectAdmin, preventConcurrentUpdates, setToss);
r.post("/:id/score",                protectAdmin, preventConcurrentUpdates, validateScoreUpdate, updateScore);
r.post("/:id/undo",                  protectAdmin, preventConcurrentUpdates, undoLastBall);
r.post("/:id/innings/:num/batsman", protectAdmin, preventConcurrentUpdates, addBatsman);
r.post("/:id/innings/:num/bowler",  protectAdmin, preventConcurrentUpdates, addBowler);
r.post("/:id/commentary",           protectAdmin, preventConcurrentUpdates, addCommentary);
r.post("/:id/declare",              protectAdmin, preventConcurrentUpdates, require("../controllers/matchController").declareInnings);
r.post("/:id/super-over",           protectAdmin, preventConcurrentUpdates, startSuperOver);
r.put("/:id/status",                protectAdmin, preventConcurrentUpdates, setMatchStatus);
r.put("/:id/man-of-match",          protectAdmin, preventConcurrentUpdates, require("../controllers/matchController").setManOfTheMatch);

module.exports = r;
