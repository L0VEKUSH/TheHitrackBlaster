// server/models/Poll.js
const mongoose = require("mongoose");

const pollSchema = new mongoose.Schema({
  matchId:    { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
  question:   { type: String, required: true },
  options:    [{ 
    text:  { type: String, required: true },
    votes: { type: Number, default: 0 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  totalVotes: { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true },
  type:       { type: String, enum: ["auto", "manual"], default: "manual" },
  overNumber: { type: Number },
  isResolved: { type: Boolean, default: false },
  correctOptionId: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

const Poll = mongoose.model("Poll", pollSchema);
module.exports = Poll;
