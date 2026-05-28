const express = require("express");
const { protectAdmin, superAdminOnly } = require("../middleware/auth");
const {
  getAdmins,
  getAdmin,
  createAdmin,
  updateAdmin,
  deleteAdmin
} = require("../controllers/adminController");

const r = express.Router();

r.get("/", protectAdmin, superAdminOnly, getAdmins);
r.get("/:id", protectAdmin, superAdminOnly, getAdmin);
r.post("/", protectAdmin, superAdminOnly, createAdmin);
r.put("/:id", protectAdmin, superAdminOnly, updateAdmin);
r.delete("/:id", protectAdmin, superAdminOnly, deleteAdmin);

module.exports = r;
