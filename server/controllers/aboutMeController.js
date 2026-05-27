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
    let about = await AboutMe.findOne();
    if (!about) {
      about = await AboutMe.create(defaultContent);
    }
    res.json({ success: true, data: about });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Unable to load About Me content" });
  }
};

exports.updateAboutMe = async (req, res) => {
  try {
    const payload = req.body;
    const about = await AboutMe.findOneAndUpdate({}, payload, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    });
    res.json({ success: true, data: about });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Unable to save About Me content" });
  }
};
