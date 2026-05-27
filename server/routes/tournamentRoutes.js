// server/routes/tournamentRoutes.js
const express = require("express");
const { protectAdmin } = require("../middleware/auth");
const {
  getTournaments, getTournament,
  createTournament, updateTournament,
  deleteTournament, updatePointsTable,
  getLeaderboards, rebuildLeaderboards
} = require("../controllers/tournamentController");

const r = express.Router();
r.get("/",           getTournaments);
r.get("/:id",        getTournament);
r.get("/:id/leaderboards", getLeaderboards);
r.post("/",          protectAdmin, createTournament);
r.put("/:id",        protectAdmin, updateTournament);
r.put("/:id/leaderboards", protectAdmin, rebuildLeaderboards);
r.delete("/:id",     protectAdmin, deleteTournament);
r.put("/:id/points", protectAdmin, updatePointsTable);
module.exports = r;
