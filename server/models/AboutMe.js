const mongoose = require("mongoose");

const aboutMeSchema = new mongoose.Schema({
  heroTitle: { type: String, default: "I AM" },
  heroName: { type: String, default: "LOVEKUSH" },
  heroSubtitle: { type: String, default: "Developer • Visionary • Sports Enthusiast" },
  photo: { type: String, default: "" },
  socialLinks: {
    github: { type: String, default: "" },
    instagram: { type: String, default: "" },
    linkedin: { type: String, default: "" }
  },
  storyHeading: { type: String, default: "Building the Future of Sports Tracking" },
  storyParagraphs: {
    type: [String],
    default: [
      "Hi, I'm Lovekush, the mind behind The Hitrack. My journey started with a simple passion for sports and a drive to create something that brings fans closer to the game. I believe that technology should be as exciting as the sport itself.",
      "When I'm not crafting cinematic web interfaces or building real-time scoring engines, you can find me analyzing match tactics, exploring new tech stacks, or pushing the boundaries of what's possible in web development."
    ]
  },
  stats: {
    type: [
      {
        label: { type: String, default: "" },
        value: { type: String, default: "" }
      }
    ],
    default: [
      { label: "Code Commits", value: "500+" },
      { label: "Projects Built", value: "12+" },
      { label: "Matches Scored", value: "100+" }
    ]
  },
  lifestyle: {
    type: [
      {
        title: { type: String, default: "" },
        desc: { type: String, default: "" }
      }
    ],
    default: [
      { title: "Pure Innovation", desc: "Always looking for the next big thing in UI/UX and real-time data." },
      { title: "Sports DNA", desc: "A lifelong fan of high-intensity sports, from Cricket to Kabaddi." },
      { title: "Creative Flow", desc: "Believing that code is an art form that should wow the user." },
      { title: "Lish", desc: "The inspiration and anime love that drives my creative journey and pursuit of excellence." }
    ]
  },
  quoteText: {
    type: String,
    default: "Building technology is like playing a match—you need precision, team spirit, and the hunger to win."
  },
  quoteAuthor: { type: String, default: "— Lovekush" }
}, { timestamps: true });

module.exports = mongoose.model("AboutMe", aboutMeSchema);
