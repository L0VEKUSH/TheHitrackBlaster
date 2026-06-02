// Script: populatePlayersFromMatches.js
// Scans existing Match documents and upserts basic Player documents.

require("dotenv").config();
const connectDB = require("../config/db");
const Match = require("../models/Match");
const Player = require("../models/Player");

const DEFAULT_ROLE = "Batsman"; // used when inserting minimal player records

async function extractNamesFromMatch(m) {
  const names = new Set();

  (m.squadA || []).forEach(n => n && names.add(n));
  (m.squadB || []).forEach(n => n && names.add(n));

  const collectFromInnings = (inn) => {
    if (!inn) return;
    (inn.batsmen || []).forEach(b => b && b.name && names.add(b.name));
    (inn.bowlers || []).forEach(b => b && b.name && names.add(b.name));
    (inn.commentary || []).forEach(c => c && c.batterName && names.add(c.batterName));
  };

  collectFromInnings(m.innings1);
  collectFromInnings(m.innings2);
  collectFromInnings(m.superOverInnings1);
  collectFromInnings(m.superOverInnings2);

  (m.currentBatsmen || []).forEach(n => n && names.add(n));
  if (m.currentBowler) names.add(m.currentBowler);

  return Array.from(names).map(s => s.trim()).filter(Boolean);
}

async function main() {
  try {
    await connectDB();

    const matches = await Match.find({}).lean();
    console.log(`Found ${matches.length} matches`);

    const allNames = new Set();
    const nameToTeam = new Map();

    for (const m of matches) {
      const names = await extractNamesFromMatch(m);
      names.forEach(n => allNames.add(n));

      // map known squad membership to team name
      (m.squadA || []).forEach(n => n && nameToTeam.set(n, m.teamA || ""));
      (m.squadB || []).forEach(n => n && nameToTeam.set(n, m.teamB || ""));
    }

    console.log(`Unique player names discovered: ${allNames.size}`);

    let inserted = 0, already = 0;
    for (const name of allNames) {
      const existing = await Player.findOne({ name }).exec();
      if (existing) {
        already++;
        continue;
      }

      const team = nameToTeam.get(name) || "";
      const doc = {
        name,
        fullName: name,
        team,
        role: DEFAULT_ROLE
      };

      await Player.create(doc);
      inserted++;
    }

    console.log(`Inserted: ${inserted}, Already existed: ${already}`);
    process.exit(0);
  } catch (err) {
    console.error("Error populating players:", err);
    process.exit(1);
  }
}

main();
