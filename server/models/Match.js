// server/models/Match.js
const mongoose = require("mongoose");

const nonNegativeIntegerField = (options = {}) => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: "{PATH} must be a whole number" },
  ...options,
});

const commentarySchema = new mongoose.Schema({
  eventId:  { type: String, default: "" },
  sequence: nonNegativeIntegerField({ default: 0 }),
  over:     String,
  text:     { type: String, required: true },
  runs:     nonNegativeIntegerField({ default: 0 }),
  batsmanRuns: nonNegativeIntegerField({ default: 0 }),
  extraRuns: nonNegativeIntegerField({ default: 0 }),
  isWicket: { type: Boolean, default: false },
  extraType:String,
  wicketType:String,
  outPlayerName:String,
  fielderName:String,
  batterName:String,
  bowlerName:String,
  addedAt:  { type: Date, default: Date.now }
}, { _id: false });

const batsmanSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  playerId:  { type: String, default: "" },
  runs:      nonNegativeIntegerField({ default: 0 }),
  balls:     nonNegativeIntegerField({ default: 0 }),
  fours:     nonNegativeIntegerField({ default: 0 }),
  sixes:     nonNegativeIntegerField({ default: 0 }),
  isOut:     { type: Boolean, default: false },
  isActive:  { type: Boolean, default: true },
  dismissal: { type: String, default: "" },
  isStriker: { type: Boolean, default: false }
}, { _id: false });

const bowlerSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  playerId:{ type: String, default: "" },
  balls:   nonNegativeIntegerField({ default: 0 }),
  maidens: nonNegativeIntegerField({ default: 0 }),
  runs:    nonNegativeIntegerField({ default: 0 }),
  wickets: nonNegativeIntegerField({ max: 10, default: 0 }),
  wides:   nonNegativeIntegerField({ default: 0 }),
  noBalls: nonNegativeIntegerField({ default: 0 })
}, { _id: false });

const scoringEventSchema = new mongoose.Schema({
  type: { type: String, enum: ["BALL", "ADD_BATTER", "ADD_BOWLER", "END_INNINGS", "COMMENTARY"], required: true },
  actionId: { type: String, required: true, maxlength: 128 },
  sequence: nonNegativeIntegerField({ min: 1, required: true }),
  inningsNumber: { type: Number, enum: [1, 2], required: true },
  playerName: { type: String, default: "" },
  playerId: { type: String, default: "" },
  isStriker: Boolean,
  batterName: { type: String, default: "" },
  batterId: { type: String, default: "" },
  nonStrikerName: { type: String, default: "" },
  nonStrikerId: { type: String, default: "" },
  bowlerName: { type: String, default: "" },
  bowlerId: { type: String, default: "" },
  batsmanRuns: nonNegativeIntegerField({ default: 0 }),
  extraRuns: nonNegativeIntegerField({ default: 0 }),
  extraType: { type: String, enum: ["", "wide", "noBall", "bye", "legBye", "penalty", "bonus"], default: "" },
  secondaryExtraType: { type: String, enum: ["", "bye", "legBye"], default: "" },
  completedRuns: nonNegativeIntegerField({ default: 0 }),
  legalDelivery: { type: Boolean, default: true },
  nonDelivery: { type: Boolean, default: false },
  isWicket: { type: Boolean, default: false },
  wicketType: { type: String, default: "" },
  outPlayerName: { type: String, default: "" },
  outPlayerId: { type: String, default: "" },
  fielderName: { type: String, default: "" },
  fielderId: { type: String, default: "" },
  commentary: { type: String, maxlength: 1000, default: "" },
  symbol: { type: String, maxlength: 16, default: "" },
  reason: { type: String, maxlength: 100, default: "" },
  over: { type: String, default: "" },
  rulesVersion: nonNegativeIntegerField({ min: 1, default: 1 }),
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const extrasBreakdownSchema = new mongoose.Schema({
  wides: nonNegativeIntegerField({ default: 0 }),
  noBalls: nonNegativeIntegerField({ default: 0 }),
  byes: nonNegativeIntegerField({ default: 0 }),
  legByes: nonNegativeIntegerField({ default: 0 }),
  penalties: nonNegativeIntegerField({ default: 0 }),
  other: nonNegativeIntegerField({ default: 0 })
}, { _id: false });

const inningsSchema = new mongoose.Schema({
  battingTeam: String,
  bowlingTeam: String,
  runs:        nonNegativeIntegerField({ default: 0 }),
  wickets:     nonNegativeIntegerField({ max: 10, default: 0 }),
  balls:       nonNegativeIntegerField({ default: 0 }),
  extras:      nonNegativeIntegerField({ default: 0 }),
  extrasBreakdown: { type: extrasBreakdownSchema, default: () => ({}) },
  batsmen:     [batsmanSchema],
  bowlers:     [bowlerSchema],
  commentary:  [commentarySchema],
  fallOfWickets: [{
    score: String,
    over:  String,
    player:String,
    wicketNum: nonNegativeIntegerField(),
    eventId: { type: String, default: "" }
  }],
  partnerships: [{
    players: [String],
    runs:    nonNegativeIntegerField({ default: 0 }),
    balls:   nonNegativeIntegerField({ default: 0 }),
    isClosed:{ type: Boolean, default: false }
  }],
  lastOverBowler: { type: String, default: "" },
  currentBowler: { type: String, default: "" },
  currentOverStarted: { type: Boolean, default: false },
  overHistory: [{
    over: nonNegativeIntegerField(),
    runs: nonNegativeIntegerField({ default: 0 }),
    wickets: nonNegativeIntegerField({ default: 0 }),
    extras: nonNegativeIntegerField({ default: 0 }),
    bowlerName: { type: String, default: "" }
  }],
  milestones: [{
    player: { type: String, required: true },
    type: { type: String, required: true }, // '50', '100', '3W', '5W'
    over: { type: String, required: true },
    score: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  recentBalls: [String],
  events: { type: [scoringEventSchema], default: [] },
  // A one-time immutable projection for legacy matches that pre-date event history.
  // Replay can safely undo back to this boundary without rewriting old score data.
  historyBase: { type: mongoose.Schema.Types.Mixed, default: null },
  historyBoundaryReason: { type: String, default: "" },
  eventHistoryInitialized: { type: Boolean, default: false },
  redoStack: { type: [mongoose.Schema.Types.Mixed], default: [] },
  rulesVersion: nonNegativeIntegerField({ min: 1, default: 1 }),
  isDone:      { type: Boolean, default: false },
  endReason:   { type: String, default: "" }
}, { _id: false });

const matchSchema = new mongoose.Schema({
  teamA:          { type: String, required: true, trim: true, maxlength: 120 },
  teamB:          { type: String, required: true, trim: true, maxlength: 120 },
  teamAShort:     { type: String, default: "" },
  teamBShort:     { type: String, default: "" },
  teamAFlag:      { type: String, default: "" },
  teamBFlag:      { type: String, default: "" },

  matchTitle:     { type: String, default: "" },
  series:         { type: String, default: "" },
  format:         { type: String, enum: ["T20","T20I","RMC","Test","IPL","WPL","T10","T8","Championship","ODI","HBC","WBC"], default: "T20" },
  venue:          { type: String, default: "" },
  city:           { type: String, default: "" },
  matchDate:      { type: Date },
  matchNumber:    { type: String, default: "" },
  overs:          { type: Number, min: 1, max: 450, default: 20, validate: Number.isInteger },

  status:         { type: String, enum: ["upcoming","live","completed"], default: "upcoming" },
  phase:          { type: String, enum: ["upcoming", "firstInnings", "inningsBreak", "secondInnings", "finished", "noResult"], default: "upcoming" },
  result:         { type: String, default: "" },
  tossWinner:     { type: String, default: "" },
  tossDecision:   { type: String, enum: ["bat","bowl",""], default: "" },
  currentInnings: { type: Number, enum: [1, 2], default: 1 },
  target:         nonNegativeIntegerField({ default: 0 }),
  requiredRuns:   nonNegativeIntegerField({ default: 0 }),
  requiredRunRate:{ type: Number, min: 0, default: 0 },

  innings1:       inningsSchema,
  innings2:       inningsSchema,
  superOverInnings1: inningsSchema,
  superOverInnings2: inningsSchema,
  isSuperOver:    { type: Boolean, default: false },

  recentBalls:    [String],
  currentBatsmen: [String],
  currentBowler:  { type: String, default: "" },

  eventSequence:  nonNegativeIntegerField({ default: 0 }),
  processedActions: [{
    actionId: { type: String, required: true, maxlength: 128 },
    operation: { type: String, required: true, maxlength: 64 },
    fingerprint: { type: String, maxlength: 64, default: "" },
    eventSequence: nonNegativeIntegerField({ default: 0 }),
    processedAt: { type: Date, default: Date.now }
  }],
  redoStack: { type: [mongoose.Schema.Types.Mixed], default: [] },
  schemaVersion: nonNegativeIntegerField({ min: 1, default: 2 }),

  squadA:         [String],   // selected player names for teamA
  squadB:         [String],   // selected player names for teamB

  tournament:     { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
  videoUrl:       { type: String, default: "" },
  isFeatured:     { type: Boolean, default: false }
  ,
  statistics: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      players: [],
      manOfTheMatch: null,
      sixerKing: null,
      fourKing: null,
      highestScore: null,
      bestBowling: null,
      bestEconomy: null,
      highestStrikeRate: null,
      bestStrikeRate: null,
      bestBowlingAverage: null,
      bestBattingAverage: null
    })
  }
}, { timestamps: true, optimisticConcurrency: true });

matchSchema.virtual("currentRunRate").get(function () {
  const inn = this.isSuperOver
    ? (this.currentInnings === 1 ? this.superOverInnings1 : this.superOverInnings2)
    : (this.currentInnings === 1 ? this.innings1 : this.innings2);
  if (!inn || !inn.balls || inn.balls === 0) return 0;
  return parseFloat((inn.runs / (inn.balls / 6)).toFixed(2));
});

matchSchema.pre("validate", function (next) {
  if (this.teamA && this.teamB && this.teamA === this.teamB) {
    this.invalidate("teamB", "Teams must be different");
  }
  next();
});

matchSchema.virtual("teamScores").get(function () {
  const innings = [this.innings1, this.innings2].filter(Boolean);
  const scoreFor = (team) => {
    const inn = innings.find((candidate) => candidate && candidate.battingTeam === team);
    if (!inn) return null;
    return {
      battingTeam: inn.battingTeam,
      runs: inn.runs || 0,
      wickets: inn.wickets || 0,
      legalBalls: inn.balls || 0,
      overs: `${Math.floor((inn.balls || 0) / 6)}.${(inn.balls || 0) % 6}`,
      isDone: Boolean(inn.isDone)
    };
  };
  return {
    teamA: { team: this.teamA, score: scoreFor(this.teamA) },
    teamB: { team: this.teamB, score: scoreFor(this.teamB) }
  };
});

matchSchema.set("toJSON", { virtuals: true });
matchSchema.index({ status: 1, matchDate: -1 });

module.exports = mongoose.model("Match", matchSchema);
