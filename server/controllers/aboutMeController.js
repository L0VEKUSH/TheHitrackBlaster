const AboutMe = require("../models/AboutMe");

const defaultContent = {
  heroTitle: "I AM",
  heroName: "LOVEKUSH",
  heroSubtitle: "Developer • Visionary • Sports Enthusiast",
  storyHeading: "Building the Future of Sports Tracking",
  photo: "",
  socialLinks: {
    github: "",
    instagram: "",
    linkedin: ""
  },
  storyParagraphs: [
    "Hi, I'm Lovekush, the mind behind The Hitrack. My journey started with a simple passion for sports and a drive to create something that brings fans closer to the game. I believe that technology should be as exciting as the sport itself.",
    "When I'm not crafting cinematic web interfaces or building real-time scoring engines, you can find me analyzing match tactics, exploring new tech stacks, or pushing the boundaries of what's possible in web development."
  ],
  stats: [
    { label: "Code Commits", value: "500+" },
    { label: "Projects Built", value: "12+" },
    { label: "Matches Scored", value: "100+" }
  ],
  lifestyle: [
    { title: "Pure Innovation", desc: "Always looking for the next big thing in UI/UX and real-time data." },
    { title: "Sports DNA", desc: "A lifelong fan of high-intensity sports, from Cricket to Kabaddi." },
    { title: "Creative Flow", desc: "Believing that code is an art form that should wow the user." },
    { title: "Lish", desc: "The inspiration and anime love that drives my creative journey and pursuit of excellence." }
  ],
  quoteText: "Building technology is like playing a match—you need precision, team spirit, and the hunger to win.",
  quoteAuthor: "— Lovekush"
};

exports.getAboutMe = async (req, res) => {
  try {
    const about = await AboutMe.findOne();
    // Public GET remains read-only. The first authenticated edit performs the
    // upsert, avoiding duplicate defaults when several viewers arrive at once.
    res.json({ success: true, data: about || defaultContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Unable to load About Me content" });
  }
};

exports.updateAboutMe = async (req, res) => {
  try {
    const body = req.body || {};
    const payload = {};
    const textFields = ["heroTitle", "heroName", "heroSubtitle", "storyHeading", "quoteText", "quoteAuthor"];
    for (const field of textFields) {
      if (body[field] !== undefined) payload[field] = String(body[field]);
    }

    const validateUrl = (value, { allowUploadPath = false } = {}) => {
      if (value === "" || value === null || value === undefined) return "";
      const url = String(value);
      if (allowUploadPath && url.startsWith("/uploads/")) return url;
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        const error = new Error("Links must be valid http(s) URLs");
        error.statusCode = 400;
        throw error;
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        const error = new Error("Only http(s) links are allowed");
        error.statusCode = 400;
        throw error;
      }
      return parsed.toString();
    };

    if (body.photo !== undefined) {
      payload.photo = validateUrl(body.photo, { allowUploadPath: true });
    }
    if (body.socialLinks !== undefined) {
      const links = body.socialLinks && typeof body.socialLinks === "object" ? body.socialLinks : {};
      payload.socialLinks = {};
      for (const field of ["github", "instagram", "linkedin"]) {
        if (links[field] !== undefined) payload.socialLinks[field] = validateUrl(links[field]);
      }
    }
    if (body.storyParagraphs !== undefined) {
      if (!Array.isArray(body.storyParagraphs)) return res.status(400).json({ success: false, message: "storyParagraphs must be an array" });
      payload.storyParagraphs = body.storyParagraphs.slice(0, 20).map(String);
    }
    if (body.stats !== undefined) {
      if (!Array.isArray(body.stats)) return res.status(400).json({ success: false, message: "stats must be an array" });
      payload.stats = body.stats.slice(0, 20).map((item) => ({
        label: String(item?.label || ""),
        value: String(item?.value || "")
      }));
    }
    if (body.lifestyle !== undefined) {
      if (!Array.isArray(body.lifestyle)) return res.status(400).json({ success: false, message: "lifestyle must be an array" });
      payload.lifestyle = body.lifestyle.slice(0, 20).map((item) => ({
        title: String(item?.title || ""),
        desc: String(item?.desc || "")
      }));
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ success: false, message: "No supported fields supplied" });
    }
    const about = await AboutMe.findOneAndUpdate({}, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    });
    res.json({ success: true, data: about });
  } catch (error) {
    console.error(error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.statusCode === 400 ? error.message : "Unable to save About Me content"
    });
  }
};
