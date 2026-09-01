// server/models/Poll.js
const mongoose = require("mongoose");

const pollSchema = new mongoose.Schema({
  matchId:    { type: mongoose.Schema.Types.ObjectId, ref: "Match", required: true },
  question:   { type: String, required: true, trim: true, maxlength: 300 },
  options:    [{ 
    text:  { type: String, required: true, trim: true, maxlength: 200 },
    votes: { type: Number, min: 0, default: 0 },
    voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }],
  totalVotes: { type: Number, min: 0, default: 0 },
  isActive:   { type: Boolean, default: true },
  type:       { type: String, enum: ["auto", "manual"], default: "manual" },
  overNumber: { type: Number, min: 0 },
  isResolved: { type: Boolean, default: false },
  correctOptionId: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

pollSchema.path("options").validate(
  (options) => Array.isArray(options) && options.length >= 2 && options.length <= 10,
  "A poll requires 2 to 10 options",
);

const Poll = mongoose.model("Poll", pollSchema);
module.exports = Poll;
