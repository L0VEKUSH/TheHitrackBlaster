// server/routes/authRoutes.js
const express = require("express");
const { protectUser } = require("../middleware/auth");
const {
  register, login, getMe, updateMe,
  adminLogin, adminSetup, unlockSecret
} = require("../controllers/authController");

const r = express.Router();
r.post("/register",     register);
r.post("/login",        login);
r.get("/me",            protectUser, getMe);
r.put("/me",            protectUser, updateMe);
r.post("/admin/login",  adminLogin);
r.post("/admin/setup",  adminSetup);   // first run only — creates superadmin
r.post("/unlock-secret", unlockSecret);
module.exports = r;
