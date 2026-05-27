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

// Public
r.get("/",                          getMatches);
r.get("/live/all",                  getLiveMatches);
r.get("/:id",                       getMatch);
r.get("/:id/ai-predictions",        require("../controllers/matchController").getMatchPredictions);

// Admin
r.post("/",                         protectAdmin, createMatch);
r.put("/:id",                       protectAdmin, updateMatch);
r.delete("/:id",                    protectAdmin, deleteMatch);
r.post("/:id/toss",                 protectAdmin, setToss);
r.post("/:id/score",                protectAdmin, updateScore);
r.post("/:id/undo",                  protectAdmin, undoLastBall);
r.post("/:id/innings/:num/batsman", protectAdmin, addBatsman);
r.post("/:id/innings/:num/bowler",  protectAdmin, addBowler);
r.post("/:id/commentary",           protectAdmin, addCommentary);
r.post("/:id/declare",              protectAdmin, require("../controllers/matchController").declareInnings);
r.post("/:id/super-over",           protectAdmin, startSuperOver);
r.put("/:id/status",                protectAdmin, setMatchStatus);
r.put("/:id/man-of-match",          protectAdmin, require("../controllers/matchController").setManOfTheMatch);

module.exports = r;
