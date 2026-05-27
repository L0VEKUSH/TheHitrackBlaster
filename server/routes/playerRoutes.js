// server/routes/playerRoutes.js
const express          = require("express");
const r                = express.Router();
const pc               = require("../controllers/playerController");
const { protectAdmin } = require("../middleware/auth");

r.get("/",                  pc.getPlayers);
r.get("/by-names",          pc.getPlayersByNames);
r.get("/rankings/batting",  pc.getBattingRankings);
r.get("/rankings/bowling",  pc.getBowlingRankings);
r.get("/rankings/allrounder", pc.getAllRounderRankings);
r.get("/rankings/points",   pc.getPointsRankings);
r.get("/:id",               pc.getPlayer);
r.post("/",                 protectAdmin, pc.createPlayer);
r.put("/:id",               protectAdmin, pc.updatePlayer);
r.delete("/:id",            protectAdmin, pc.deletePlayer);

module.exports = r;
