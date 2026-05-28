const { Admin } = require("../models/other");

const serializeAdmin = (admin) => ({
  id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  isActive: admin.isActive,
  createdAt: admin.createdAt,
  updatedAt: admin.updatedAt
});

exports.getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ role: -1, createdAt: 1 });
    res.json({ success: true, data: admins.map(serializeAdmin) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select("-password");
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
    res.json({ success: true, data: serializeAdmin(admin) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, isActive } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: "Admin with this email already exists" });
    }

    const admin = await Admin.create({
      name,
      email,
      password,
      role: role || "editor",
      isActive: typeof isActive === "boolean" ? isActive : true
    });

    res.status(201).json({ success: true, data: serializeAdmin(admin) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    if (req.body.email && req.body.email !== admin.email) {
      const existing = await Admin.findOne({ email: req.body.email });
      if (existing) {
        return res.status(409).json({ success: false, message: "Another admin already uses that email" });
      }
    }

    if (req.body.name) admin.name = req.body.name;
    if (req.body.email) admin.email = req.body.email;
    if (req.body.password) admin.password = req.body.password;
    if (req.body.role) admin.role = req.body.role;
    if (typeof req.body.isActive === "boolean") admin.isActive = req.body.isActive;

    await admin.save();
    res.json({ success: true, data: serializeAdmin(admin) });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });

    if (req.admin._id.equals(admin._id)) {
      return res.status(400).json({ success: false, message: "Cannot delete your own admin account while logged in" });
    }

    if (admin.role === "superadmin") {
      const activeSuperadmins = await Admin.countDocuments({ role: "superadmin", isActive: true });
      if (activeSuperadmins <= 1) {
        return res.status(400).json({ success: false, message: "At least one active superadmin must remain" });
      }
    }

    await admin.deleteOne();
    res.json({ success: true, message: "Admin removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
