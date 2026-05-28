// server/models/other.js — Team, News, User, Admin, Tournament
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/* ── Team ───────────────────────────────────── */
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  shortName: { type: String, default: "" },
  flag: { type: String, default: "" },
  logo: { type: String, default: "" },
  teamType: { type: String, enum: ["Teams", "domestic", "Tournament Teams"], default: "Teams" },
  coach: { type: String, default: "" },
  captain: { type: String, default: "" },
  homeGround: { type: String, default: "" },
  founded: { type: Number },
  description: { type: String, default: "" },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: "Player" }],
  rankings: {
    t20Rank: { type: Number, default: 0 },
    RMCRank: { type: Number, default: 0 },
    testRank: { type: Number, default: 0 }
  },
  otherSportRankings: [{
    sport: { type: String, required: true },
    rank: { type: Number, default: 0 }
  }]
}, { timestamps: true });

const Team = mongoose.model("Team", teamSchema);

/* ── News ───────────────────────────────────── */
const newsSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true, sparse: true },
  content: { type: String, required: true },
  summary: { type: String, default: "" },
  image: { type: String, default: "" },
  author: { type: String, default: "Admin" },
  category: { type: String, enum: ["match", "series", "player", "team", "general", "ranking"], default: "general" },
  tags: [String],
  isPublished: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  views: { type: Number, default: 0 }
}, { timestamps: true });

newsSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug = this.title.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      + "-" + Date.now();
  }
  next();
});

newsSchema.index({ createdAt: -1, category: 1, isPublished: 1 });
const News = mongoose.model("News", newsSchema);

/* ── User ───────────────────────────────────── */
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  avatar: { type: String, default: "" },
  favoriteTeam: { type: String, default: "" },
  isActive: { type: Boolean, default: true },
  pollPoints: { type: Number, default: 0 }
}, { timestamps: true });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};
const User = mongoose.model("User", userSchema);

/* ── Admin ──────────────────────────────────── */
const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["superadmin", "editor"], default: "editor" },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
adminSchema.methods.matchPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};
const Admin = mongoose.model("Admin", adminSchema);

/* ── Tournament ─────────────────────────────── */
const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  shortName: { type: String, default: "" },
  logo: { type: String, default: "" },
  type: { type: String, enum: ["series", "bilateral", "tri-series", "league", "cup", "championship"], default: "series" },
  format: { type: String, default: "" },
  rules: { type: String, default: "" },
  startDate: { type: Date },
  endDate: { type: Date },
  host: { type: String, default: "" },
  teams: [String],
  matches: [{ type: mongoose.Schema.Types.ObjectId, ref: "Match" }],
  isActive: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  pointsTable: [{
    team: { type: String, required: true },
    played: { type: Number, default: 0 },
    won: { type: Number, default: 0 },
    lost: { type: Number, default: 0 },
    tied: { type: Number, default: 0 },
    nr: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    nrr: { type: String, default: "0.000" }
  }]
  ,
  playerLeaderboards: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

const Tournament = mongoose.model("Tournament", tournamentSchema);

/* ── Management ─────────────────────────────── */
const managementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  role: { type: String, required: true },
  image: { type: String, default: "" },
  bio: { type: String, default: "" },
  socialLinks: {
    twitter: { type: String, default: "" },
    linkedin: { type: String, default: "" },
    instagram: { type: String, default: "" }
  },
  displayOrder: { type: Number, default: 0 }
}, { timestamps: true });

const Management = mongoose.model("Management", managementSchema);

module.exports = { Team, News, User, Admin, Tournament, Management };
