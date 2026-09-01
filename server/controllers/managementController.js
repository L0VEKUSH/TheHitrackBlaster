// server/controllers/managementController.js
const { Management } = require("../models/other");
const { pick } = require("../utils/input");

const WRITABLE_FIELDS = ["name", "role", "image", "bio", "socialLinks", "displayOrder"];

exports.getManagementTeam = async (req, res) => {
  try {
    const team = await Management.find().sort({ displayOrder: 1, createdAt: 1 });
    res.json({ success: true, data: team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getManagementMember = async (req, res) => {
  try {
    const member = await Management.findById(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });
    res.json({ success: true, data: member });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createManagementMember = async (req, res) => {
  try {
    const member = await Management.create(pick(req.body, WRITABLE_FIELDS));
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateManagementMember = async (req, res) => {
  try {
    const member = await Management.findByIdAndUpdate(
      req.params.id,
      pick(req.body, WRITABLE_FIELDS),
      { new: true, runValidators: true, context: "query" },
    );
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });
    res.json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteManagementMember = async (req, res) => {
  try {
    const member = await Management.findByIdAndDelete(req.params.id);
    if (!member) return res.status(404).json({ success: false, message: "Member not found" });
    res.json({ success: true, message: "Member removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
