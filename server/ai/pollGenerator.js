// server/ai/pollGenerator.js
const Poll = require("../models/Poll");
const Player = require("../models/Player");

const normalizeName = (name) => {
  return String(name || "").trim().toLowerCase();
};

const escapeRegExp = (string) => {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const findPlayerByName = async (name) => {
  if (!name) return null;
  const normalized = normalizeName(name);
  const matcher = new RegExp(`^${escapeRegExp(normalized)}$`, "i");
  return Player.findOne({
    $or: [
      { name: matcher },
      { fullName: matcher }
    ]
  })
    .lean()
    .exec();
};

const calculateCurrentPoints = (stats = {}) => {
  const runs = stats.runs || 0;
  const balls = stats.balls || 0;
  const fours = stats.fours || 0;
  const sixes = stats.sixes || 0;
  const wickets = stats.wickets || 0;
  const ballsBowled = stats.ballsBowled || 0;
  const runsConceded = stats.runsConceded || 0;

  let points = 0;
  points += runs;
  points += fours;
  points += sixes * 2;
  if (runs >= 50) points += 10;
  if (runs >= 100) points += 20;
  points += wickets * 25;
  if (wickets >= 3) points += 10;
  if (balls >= 10) {
    const strikeRate = (runs / balls) * 100;
    if (strikeRate >= 150) points += 10;
    else if (strikeRate >= 130) points += 5;
  }
  if (ballsBowled > 0) {
    const economy = runsConceded / (ballsBowled / 6);
    if (economy < 6) points += 10;
    else if (economy < 8) points += 5;
  }

  return points;
};

const getActiveContestants = (inn, bowlerName, bowlerStats) => {
  const players = [];
  if (inn && Array.isArray(inn.batsmen)) {
    inn.batsmen.filter(b => !b.isOut).forEach((b) => {
      players.push({
        name: b.name,
        role: "batsman",
        stats: { runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes }
      });
    });
  }
  if (bowlerName) {
    players.push({
      name: bowlerName,
      role: "bowler",
      stats: { wickets: bowlerStats?.wickets || 0, ballsBowled: bowlerStats?.balls || 0, runsConceded: bowlerStats?.runs || 0 }
    });
  }
  return players.map((player) => ({
    ...player,
    points: calculateCurrentPoints(player.stats)
  }));
};

const buildBatsmanOptions = (player, currentRuns) => {
  const average = player?.batting?.average || 20;
  const strikeRate = player?.batting?.strikeRate || 90;
  const expected = Math.max(10, Math.round(average * Math.min(1.2, strikeRate / 100)));

  if (expected >= 45) {
    return [
      { text: "0-29" },
      { text: "30-49" },
      { text: "50+" }
    ];
  }

  if (expected >= 30) {
    return [
      { text: "0-19" },
      { text: "20-39" },
      { text: "40+" }
    ];
  }

  return [
    { text: "0-9" },
    { text: "10-19" },
    { text: "20+" }
  ];
};

const buildBowlerOptions = (player, currentWickets) => {
  const average = player?.bowling?.average || 35;
  const wicketsSoFar = currentWickets || 0;

  if (average <= 25 || wicketsSoFar >= 2) {
    return [
      { text: "0" },
      { text: "1" },
      { text: "2+" }
    ];
  }

  return [
    { text: "0" },
    { text: "1" },
    { text: "3+" }
  ];
};

exports.generateOverPoll = async (match) => {
  try {
    const innNum = match.currentInnings || 1;
    const key = match.isSuperOver
      ? (innNum === 1 ? "superOverInnings1" : "superOverInnings2")
      : (innNum === 1 ? "innings1" : "innings2");

    const inn = match[key];
    if (!inn) return;

    const overNumber = Math.floor(inn.balls / 6);
    if (overNumber === 0) return; // Wait until at least 1 over is bowled

    const bowlerName = match.currentBowler;
    const bowlerStats = inn.bowlers.find(b => b.name === bowlerName);
    const activePlayers = getActiveContestants(inn, bowlerName, bowlerStats);
    const mainPlayer = activePlayers.slice().sort((a, b) => b.points - a.points || b.stats.runs - a.stats.runs || b.stats.wickets - a.stats.wickets)[0];

    let question = "";
    let options = [];

    if (mainPlayer) {
      if (mainPlayer.role === "batsman") {
        question = `${mainPlayer.name} will score how many more runs this innings?`;
        options = [
          { text: "0-29" },
          { text: "30-49" },
          { text: "50+" }
        ];
      } else {
        question = `${mainPlayer.name} will take how many wickets?`;
        options = [
          { text: "0" },
          { text: "1" },
          { text: "2+" }
        ];
      }
    } else {
      question = `Which outcome will happen next?`;
      options = [
        { text: "Strong finish" },
        { text: "Middle order drift" },
        { text: "Late collapse" }
      ];
    }

    await Poll.updateMany({ matchId: match._id, isActive: true }, { isActive: false });

    await Poll.create({
      matchId: match._id,
      question,
      options,
      isActive: true,
      type: "auto",
      overNumber
    });
  } catch (err) {
    console.error("Error generating auto poll:", err);
  }
};
