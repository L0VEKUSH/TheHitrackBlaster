// server/routes/managementRoutes.js
const express = require("express");
const { protectAdmin } = require("../middleware/auth");
const {
  getManagementTeam, getManagementMember, createManagementMember, updateManagementMember, deleteManagementMember
} = require("../controllers/managementController");

const r = express.Router();

r.get("/",       getManagementTeam);
r.get("/:id",    getManagementMember);
r.post("/",      protectAdmin, createManagementMember);
r.put("/:id",    protectAdmin, updateManagementMember);
r.delete("/:id", protectAdmin, deleteManagementMember);

module.exports = r;
