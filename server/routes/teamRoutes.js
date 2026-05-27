// server/routes/teamRoutes.js
const express = require("express");
const { protectAdmin } = require("../middleware/auth");
const {
  getTeams, getTeam, createTeam, updateTeam, deleteTeam, getTeamRankings
} = require("../controllers/teamController");

const r = express.Router();
r.get("/",       getTeams);
r.get("/rankings", getTeamRankings);
r.get("/:id",    getTeam);
r.post("/",      protectAdmin, createTeam);
r.put("/:id",    protectAdmin, updateTeam);
r.delete("/:id", protectAdmin, deleteTeam);
module.exports = r;
