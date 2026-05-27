// server/middleware/auth.js
const jwt = require("jsonwebtoken");
const { Admin, User } = require("../models/other");

// Protect admin routes
exports.protectAdmin = async (req, res, next) => {
  let token;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.type !== "admin") return res.status(403).json({ success: false, message: "Not an admin" });
    req.admin = await Admin.findById(decoded.id).select("-password");
    if (!req.admin || !req.admin.isActive) return res.status(401).json({ success: false, message: "Admin not found" });
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Protect user routes
exports.protectUser = async (req, res, next) => {
  let token;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) token = auth.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded.type !== "user") return res.status(403).json({ success: false, message: "Not an authorized user" });
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ success: false, message: "User not found" });
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Superadmin only
exports.superAdminOnly = (req, res, next) => {
  if (req.admin?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Superadmin only" });
  }
  next();
};
