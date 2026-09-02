// server/scripts/migrateResultData.js
// Safely backfill resultData field from existing match.result strings

const mongoose = require("mongoose");
const Match = require("../models/Match");
require("dotenv").config({ path: ".env" });

const inferResultDataFromString = (match) => {
  if (!match || !match.result) return null;

  const resStr = (match.result || "").toLowerCase();

  // Parse no-result / abandoned
  if (resStr.includes("abandon") || resStr.includes("no result")) {
    return {
      type: "no-result",
      winnerTeamId: null,
      winnerTeamNameSnapshot: null,
      marginType: null,
      marginValue: 0,
      method: "normal",
      decidedAt: match.updatedAt || new Date(),
    };
  }

  // Parse tie
  if (resStr.includes("tie")) {
    return {
      type: "tie",
      winnerTeamId: null,
      winnerTeamNameSnapshot: null,
      marginType: null,
      marginValue: 0,
      method: match.isSuperOver ? "super-over" : "normal",
      decidedAt: match.updatedAt || new Date(),
    };
  }

  // Parse win
  if (resStr.includes("won")) {
    const teamA = (match.teamA || "").toLowerCase();
    const teamB = (match.teamB || "").toLowerCase();
    const teamAShort = (match.teamAShort || "").toLowerCase();
    const teamBShort = (match.teamBShort || "").toLowerCase();

    let winner = null;
    if (teamA && (resStr.includes(teamA) || (teamAShort && resStr.includes(teamAShort)))) {
      winner = match.teamA;
    } else if (teamB && (resStr.includes(teamB) || (teamBShort && resStr.includes(teamBShort)))) {
      winner = match.teamB;
    }

    if (winner) {
      // Try to extract margin from result string
      let marginType = null;
      let marginValue = 0;

      if (resStr.includes(" by ")) {
        const parts = resStr.split(" by ");
        if (parts.length > 1) {
          const marginStr = parts[1].toLowerCase();
          if (marginStr.includes("wicket")) {
            marginType = "wickets";
            const match = marginStr.match(/\d+/);
            if (match) marginValue = parseInt(match[0], 10);
          } else if (marginStr.includes("run")) {
            marginType = "runs";
            const match = marginStr.match(/\d+/);
            if (match) marginValue = parseInt(match[0], 10);
          }
        }
      }

      return {
        type: "win",
        winnerTeamId: null, // Would need separate team ID lookup if needed
        winnerTeamNameSnapshot: winner,
        marginType: marginType || "unknown",
        marginValue: marginValue || 0,
        method: match.isSuperOver ? "super-over" : "normal",
        decidedAt: match.updatedAt || new Date(),
      };
    }
  }

  // Default: unknown result
  return {
    type: "unknown",
    winnerTeamId: null,
    winnerTeamNameSnapshot: null,
    marginType: null,
    marginValue: 0,
    method: "normal",
    decidedAt: match.updatedAt || new Date(),
  };
};

const migrate = async () => {
  try {
    const dbUri = process.env.MONGO_URI;
    if (!dbUri) throw new Error("MONGO_URI not configured");

    await mongoose.connect(dbUri);
    console.log("✓ Connected to MongoDB");

    // Find all completed matches without resultData
    const matches = await Match.find({
      status: "completed",
      $or: [{ resultData: null }, { resultData: { $exists: false } }],
    }).lean();

    console.log(`Found ${matches.length} completed matches without resultData\n`);

    if (matches.length === 0) {
      console.log("✓ No migration needed - all completed matches have resultData\n");
      await mongoose.connection.close();
      return;
    }

    // Backfill resultData for each match
    let updated = 0;
    for (const match of matches) {
      const resultData = inferResultDataFromString(match);
      if (resultData) {
        await Match.findByIdAndUpdate(match._id, { resultData }, { new: false });
        updated++;
        console.log(`✓ Updated: ${match.teamA} vs ${match.teamB} (${match.format}) - ${match.result}`);
      }
    }

    console.log(`\n✓ Migration complete: ${updated}/${matches.length} matches backfilled\n`);
    await mongoose.connection.close();
  } catch (error) {
    console.error("✗ Migration failed:", error.message);
    process.exit(1);
  }
};

// Only run if called directly (not imported)
if (require.main === module) {
  migrate();
}

module.exports = { inferResultDataFromString };
