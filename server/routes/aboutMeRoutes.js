const express = require("express");
const router = express.Router();
const { getAboutMe, updateAboutMe } = require("../controllers/aboutMeController");
const { protectAdmin } = require("../middleware/auth");

router.get("/", getAboutMe);
router.put("/", protectAdmin, updateAboutMe);

module.exports = router;
