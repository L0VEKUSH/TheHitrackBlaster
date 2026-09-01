// server/controllers/newsController.js
const { News } = require("../models/other");
const mongoose = require("mongoose");
const { escapeRegExp, pagination, pick, validationStatus } = require("../utils/input");

const WRITABLE_FIELDS = [
  "title", "slug", "content", "summary", "image", "category", "tags",
  "isPublished", "isFeatured",
];

exports.getNews = async (req, res) => {
  try {
    const { category, featured, search } = req.query;
    const { page, limit, skip } = pagination(req.query, { defaultLimit: 10, maxLimit: 100 });
    const query = { isPublished: true };
    if (category) query.category   = category;
    if (featured !== undefined) query.isFeatured = featured === "true";
    if (search) query.title = new RegExp(escapeRegExp(String(search).slice(0, 100)), "i");
    const total = await News.countDocuments(query);
    const news  = await News.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .select("-content")
      .lean();
    res.json({ success: true, total, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getNewsItem = async (req, res) => {
  try {
    const identifier = String(req.params.id);
    const identifiers = [{ slug: identifier }];
    if (mongoose.Types.ObjectId.isValid(identifier)) identifiers.push({ _id: identifier });
    const news = await News.findOneAndUpdate(
      { $or: identifiers, isPublished: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!news) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createNews = async (req, res) => {
  try {
    const news = await News.create({
      ...pick(req.body, WRITABLE_FIELDS),
      author: req.admin?.name || "Admin",
      views: 0,
    });
    res.status(201).json({ success: true, news });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to create news" : err.message });
  }
};

exports.updateNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(
      req.params.id,
      pick(req.body, WRITABLE_FIELDS),
      { new: true, runValidators: true, context: "query" },
    );
    if (!news) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, news });
  } catch (err) {
    const status = validationStatus(err);
    res.status(status).json({ success: false, message: status === 500 ? "Unable to update news" : err.message });
  }
};

exports.deleteNews = async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);
    if (!news) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
