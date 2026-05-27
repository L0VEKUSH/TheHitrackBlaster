// server/routes/pollRoutes.js
const express = require("express");
const { getMatchPolls, createPoll, votePoll, resolvePoll, getPollLeaderboard } = require("../controllers/pollController");
const { protectAdmin } = require("../middleware/auth");

const r = express.Router();

r.get("/leaderboard",    getPollLeaderboard);
r.get("/match/:matchId", getMatchPolls);
r.post("/",              protectAdmin, createPoll);
r.post("/vote",         votePoll);
r.post("/:id/resolve",   protectAdmin, resolvePoll);

module.exports = r;
