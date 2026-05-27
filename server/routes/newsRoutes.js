// server/routes/newsRoutes.js
const express = require("express");
const { protectAdmin } = require("../middleware/auth");
const {
  getNews, getNewsItem, createNews, updateNews, deleteNews
} = require("../controllers/newsController");

const r = express.Router();
r.get("/",       getNews);
r.get("/:id",    getNewsItem);
r.post("/",      protectAdmin, createNews);
r.put("/:id",    protectAdmin, updateNews);
r.delete("/:id", protectAdmin, deleteNews);
module.exports = r;
