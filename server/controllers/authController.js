// server/controllers/authController.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Admin, User } = require("../models/other");

const secretsEqual = (provided, expected) => {
  const providedBuffer = Buffer.from(String(provided || ""), "utf8");
  const expectedBuffer = Buffer.from(String(expected || ""), "utf8");
  return providedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(providedBuffer, expectedBuffer);
};

const signToken = (id, type) =>
  jwt.sign({ id, type }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || "7d" });

// POST /api/auth/admin/setup  — first run, creates the superadmin
exports.adminSetup = async (req, res) => {
  try {
    const count = await Admin.countDocuments();
    if (count > 0) return res.status(400).json({ success: false, message: "Admin already exists. Use /admin/login." });
    const { name, password, setupSecret } = req.body;
    const email = req.body.email?.trim().toLowerCase();
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "All fields required" });
    const envSecret = process.env.SETUP_SECRET?.trim();
    if (!envSecret) return res.status(503).json({ success: false, message: "Admin setup is disabled until SETUP_SECRET is configured" });
    if (!secretsEqual(setupSecret?.trim(), envSecret)) return res.status(403).json({ success: false, message: "Invalid setup secret" });
    if (String(password).length < 12) return res.status(400).json({ success: false, message: "Password must be at least 12 characters" });
    const admin = await Admin.create({ name, email, password, role: "superadmin", bootstrapKey: "primary" });
    const token = signToken(admin._id, "admin");
    res.status(201).json({ success: true, token, admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Admin setup was already completed" });
    res.status(500).json({ success: false, message: "Unable to complete admin setup" });
  }
};

// POST /api/auth/admin/login
exports.adminLogin = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });
    const admin = await Admin.findOne({ email, isActive: true });
    if (!admin || !(await admin.matchPassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    const token = signToken(admin._id, "admin");
    res.json({ success: true, token, admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (_err) { res.status(500).json({ success: false, message: "Unable to sign in" }); }
};

// POST /api/auth/unlock-secret
exports.unlockSecret = async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) return res.status(400).json({ success: false, message: "Secret key is required" });

    const secret = process.env.ABOUT_ME_SECRET;
    if (!secret) return res.status(500).json({ success: false, message: "About Me secret is not configured" });

    if (!secretsEqual(key, secret)) {
      return res.status(403).json({ success: false, message: "Invalid unlock key" });
    }

    res.json({ success: true, unlocked: true });
  } catch (_err) {
    res.status(500).json({ success: false, message: "Unable to unlock content" });
  }
};

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!name || !normalizedEmail || !password) return res.status(400).json({ success: false, message: "All fields required" });
    if (String(password).length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(400).json({ success: false, message: "Email already registered" });
    const user = await User.create({ name, email: normalizedEmail, password });
    const token = signToken(user._id, "user");
    res.status(201).json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "Email already registered" });
    res.status(500).json({ success: false, message: "Unable to register" });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password required" });
    const user = await User.findOne({ email, isActive: true });
    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    const token = signToken(user._id, "user");
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, favoriteTeam: user.favoriteTeam } });
  } catch (_err) { res.status(500).json({ success: false, message: "Unable to sign in" }); }
};

// GET /api/auth/me
exports.getMe = async (req, res) => res.json({ success: true, user: req.user });

// PUT /api/auth/me
exports.updateMe = async (req, res) => {
  try {
    const { name, favoriteTeam, avatar } = req.body;
    const update = {};
    if (name !== undefined) update.name = name;
    if (favoriteTeam !== undefined) update.favoriteTeam = favoriteTeam;
    if (avatar !== undefined) update.avatar = avatar;
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select("-password");
    res.json({ success: true, user });
  } catch (_err) { res.status(500).json({ success: false, message: "Unable to update profile" }); }
};
