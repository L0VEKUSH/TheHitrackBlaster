// server/controllers/newsController.js
const { News } = require("../models/other");

exports.getNews = async (req, res) => {
  try {
    const { category, featured, page = 1, limit = 10, search } = req.query;
    const query = { isPublished: true };
    if (category) query.category   = category;
    if (featured) query.isFeatured = true;
    if (search)   query.title      = new RegExp(search, "i");
    const total = await News.countDocuments(query);
    const news  = await News.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .select("-content")
      .lean();
    res.json({ success: true, total, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getNewsItem = async (req, res) => {
  try {
    const news = await News.findOneAndUpdate(
      { $or: [{ _id: req.params.id }, { slug: req.params.id }], isPublished: true },
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!news) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createNews = async (req, res) => {
  try {
    const news = await News.create({ ...req.body, author: req.admin?.name || "Admin" });
    res.status(201).json({ success: true, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateNews = async (req, res) => {
  try {
    const news = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!news) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, news });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteNews = async (req, res) => {
  try {
    await News.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
