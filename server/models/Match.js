// server/models/Match.js
const mongoose = require("mongoose");

const commentarySchema = new mongoose.Schema({
  over:     String,
  text:     { type: String, required: true },
  runs:     { type: Number, default: 0 },
  isWicket: { type: Boolean, default: false },
  extraType:String,
  batterName:String,
  bowlerName:String,
  addedAt:  { type: Date, default: Date.now }
}, { _id: false });

const batsmanSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  runs:      { type: Number, default: 0 },
  balls:     { type: Number, default: 0 },
  fours:     { type: Number, default: 0 },
  sixes:     { type: Number, default: 0 },
  isOut:     { type: Boolean, default: false },
  dismissal: { type: String, default: "" },
  isStriker: { type: Boolean, default: false }
}, { _id: false });

const bowlerSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  balls:   { type: Number, default: 0 },
  maidens: { type: Number, default: 0 },
  runs:    { type: Number, default: 0 },
  wickets: { type: Number, default: 0 }
}, { _id: false });

const inningsSchema = new mongoose.Schema({
  battingTeam: String,
  runs:        { type: Number, default: 0 },
  wickets:     { type: Number, default: 0 },
  balls:       { type: Number, default: 0 },
  extras:      { type: Number, default: 0 },
  batsmen:     [batsmanSchema],
  bowlers:     [bowlerSchema],
  commentary:  [commentarySchema],
  fallOfWickets: [{
    score: String,
    over:  String,
    player:String,
    wicketNum: Number
  }],
  partnerships: [{
    players: [String],
    runs:    { type: Number, default: 0 },
    balls:   { type: Number, default: 0 }
  }],
  lastOverBowler: { type: String, default: "" },
  overHistory: [{
    over: Number,
    runs: Number,
    wickets: Number
  }],
  milestones: [{
    player: String,
    type: String, // '50', '100', '3W', '5W'
    over: String,
    score: String
  }],
  isDone:      { type: Boolean, default: false }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  teamA:          { type: String, required: true },
  teamB:          { type: String, required: true },
  teamAShort:     { type: String, default: "" },
  teamBShort:     { type: String, default: "" },
  teamAFlag:      { type: String, default: "" },
  teamBFlag:      { type: String, default: "" },

  matchTitle:     { type: String, default: "" },
  series:         { type: String, default: "" },
  format:         { type: String, enum: ["T20","T20I","RMC","Test","IPL","WPL","T10","T8"], default: "T20" },
  venue:          { type: String, default: "" },
  city:           { type: String, default: "" },
  matchDate:      { type: Date },
  matchNumber:    { type: String, default: "" },
  overs:          { type: Number, default: 20 },

  status:         { type: String, enum: ["upcoming","live","completed"], default: "upcoming" },
  result:         { type: String, default: "" },
  tossWinner:     { type: String, default: "" },
  tossDecision:   { type: String, enum: ["bat","bowl",""], default: "" },
  currentInnings: { type: Number, default: 1 },

  innings1:       inningsSchema,
  innings2:       inningsSchema,
  superOverInnings1: inningsSchema,
  superOverInnings2: inningsSchema,
  isSuperOver:    { type: Boolean, default: false },

  recentBalls:    [String],
  currentBatsmen: [String],
  currentBowler:  { type: String, default: "" },

  squadA:         [String],   // selected player names for teamA
  squadB:         [String],   // selected player names for teamB

  tournament:     { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
  videoUrl:       { type: String, default: "" },
  isFeatured:     { type: Boolean, default: false }
  ,
  statistics:     { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

matchSchema.virtual("currentRunRate").get(function () {
  const inn = this.currentInnings === 1 ? this.innings1 : this.innings2;
  if (!inn || !inn.balls || inn.balls === 0) return 0;
  return parseFloat((inn.runs / (inn.balls / 6)).toFixed(2));
});

matchSchema.set("toJSON", { virtuals: true });
matchSchema.index({ status: 1, matchDate: -1 });

module.exports = mongoose.model("Match", matchSchema);
