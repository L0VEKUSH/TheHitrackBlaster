// server/models/Player.js
const mongoose = require("mongoose");

const playerSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  fullName:      { type: String, default: "" },
  team:          { type: String, default: "" },
  photo:         { type: String, default: "" },
  dateOfBirth:   { type: Date },
  role:          { type: String, enum: ["Batsman","Bowler","All-Rounder","Wicket-Keeper"], required: true },
  battingStyle:  { type: String, default: "" },
  bowlingStyle:  { type: String, default: "" },
  bio:           { type: String, default: "" },
  isFeatured:    { type: Boolean, default: false },
  isCaptain:     { type: Boolean, default: false },
  isViceCaptain: { type: Boolean, default: false },

  batting: {
    matches:      { type: Number, default: 0 },
    innings:      { type: Number, default: 0 },
    notOuts:      { type: Number, default: 0 },
    runs:         { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    average:      { type: Number, default: 0 },
    strikeRate:   { type: Number, default: 0 },
    hundreds:     { type: Number, default: 0 },
    fifties:      { type: Number, default: 0 },
    fours:        { type: Number, default: 0 },
    sixes:        { type: Number, default: 0 }
  },
  bowling: {
    matches:     { type: Number, default: 0 },
    innings:     { type: Number, default: 0 },
    wickets:     { type: Number, default: 0 },
    runs:        { type: Number, default: 0 },
    balls:       { type: Number, default: 0 },
    bestFigures: { type: String, default: "0/0" },
    average:     { type: Number, default: 0 },
    economy:     { type: Number, default: 0 },
    strikeRate:  { type: Number, default: 0 },
    fiveWickets: { type: Number, default: 0 },
    maidens:     { type: Number, default: 0 }
  },

  baseBatting: {
    matches:      { type: Number, default: 0 },
    innings:      { type: Number, default: 0 },
    notOuts:      { type: Number, default: 0 },
    runs:         { type: Number, default: 0 },
    highestScore: { type: Number, default: 0 },
    average:      { type: Number, default: 0 },
    strikeRate:   { type: Number, default: 0 },
    hundreds:     { type: Number, default: 0 },
    fifties:      { type: Number, default: 0 },
    fours:        { type: Number, default: 0 },
    sixes:        { type: Number, default: 0 }
  },
  baseBowling: {
    matches:     { type: Number, default: 0 },
    innings:     { type: Number, default: 0 },
    wickets:     { type: Number, default: 0 },
    runs:        { type: Number, default: 0 },
    balls:       { type: Number, default: 0 },
    bestFigures: { type: String, default: "0/0" },
    average:     { type: Number, default: 0 },
    economy:     { type: Number, default: 0 },
    strikeRate:  { type: Number, default: 0 },
    fiveWickets: { type: Number, default: 0 },
    maidens:     { type: Number, default: 0 }
  },

  battingByFormat: {
    type: Map,
    of: {
      matches:      { type: Number, default: 0 },
      innings:      { type: Number, default: 0 },
      notOuts:      { type: Number, default: 0 },
      runs:         { type: Number, default: 0 },
      highestScore: { type: Number, default: 0 },
      average:      { type: Number, default: 0 },
      strikeRate:   { type: Number, default: 0 },
      hundreds:     { type: Number, default: 0 },
      fifties:      { type: Number, default: 0 },
      fours:        { type: Number, default: 0 },
      sixes:        { type: Number, default: 0 }
    },
    default: {}
  },
  bowlingByFormat: {
    type: Map,
    of: {
      matches:     { type: Number, default: 0 },
      innings:     { type: Number, default: 0 },
      wickets:     { type: Number, default: 0 },
      runs:        { type: Number, default: 0 },
      balls:       { type: Number, default: 0 },
      bestFigures: { type: String, default: "0/0" },
      average:     { type: Number, default: 0 },
      economy:     { type: Number, default: 0 },
      strikeRate:  { type: Number, default: 0 },
      fiveWickets: { type: Number, default: 0 },
      maidens:     { type: Number, default: 0 }
    },
    default: {}
  },

  rankings: {
    t20Batting:  { type: Number, default: 0 },
    odiBatting:  { type: Number, default: 0 },
    testBatting: { type: Number, default: 0 },
    t20Bowling:  { type: Number, default: 0 },
    odiBowling:  { type: Number, default: 0 },
    testBowling: { type: Number, default: 0 },
    t20AllRounder:  { type: Number, default: 0 },
    odiAllRounder:  { type: Number, default: 0 },
    testAllRounder: { type: Number, default: 0 }
  }
}, { timestamps: true });

playerSchema.index({ name: 1 });
const Player = mongoose.model("Player", playerSchema);
module.exports = Player;
