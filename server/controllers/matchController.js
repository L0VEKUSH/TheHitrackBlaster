// server/controllers/matchController.js
const Match      = require("../models/Match");
const { getLivePredictions } = require("../ai/predictionEngine");
const { generateOverPoll } = require("../ai/pollGenerator");
const { Tournament } = require("../models/other");
const { rebuildAllPlayerStats } = require("./playerController");

let _io;
exports.setSocket = (io) => { _io = io; };

const emit = (matchId, match) => {
  if (_io) _io.to(String(matchId)).emit("scoreUpdate", match);
};

/* ── PUBLIC ─────────────────────────────────────────── */

exports.getMatches = async (req, res) => {
  try {
    const { status, limit = 20, page = 1, tournament, series } = req.query;
    const query = {};
    if (status)     query.status     = status;
    if (tournament) query.tournament = tournament;
    if (series)     query.series     = series;

    const total   = await Match.countDocuments(query);
    const matches = await Match.find(query)
      .sort({ matchDate: status === "upcoming" ? 1 : -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate("tournament", "name shortName")
      .lean();

    res.json({ success: true, total, page: Number(page), matches });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getMatch = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid Match ID" });
    }
    const match = await Match.findById(req.params.id).populate("tournament", "name shortName logo").lean();
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    if (match.status === "completed" && (!match.statistics || !match.statistics.highestScore || !match.statistics.bestBowling || !match.statistics.bestEconomy)) {
      try {
        if (typeof computeMatchStatistics === "function") {
          computeMatchStatistics(match);
          if (match.statistics && Object.keys(match.statistics).length > 0) {
            await Match.findByIdAndUpdate(match._id, { statistics: match.statistics });
          }
        }
      } catch (e) {
        console.error("Failed to recompute match statistics", e);
      }
    }

    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getLiveMatches = async (req, res) => {
  try {
    const matches = await Match.find({ status: "live" })
      .select("teamA teamB teamAShort teamBShort innings1 innings2 currentInnings recentBalls currentBatsmen currentBowler isFeatured matchTitle format videoUrl")
      .lean();
    res.json({ success: true, matches });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── ADMIN CRUD ─────────────────────────────────────── */

exports.createMatch = async (req, res) => {
  try {
    const match = await Match.create(req.body);
    if (req.body.tournament) await Tournament.findByIdAndUpdate(req.body.tournament, { $addToSet: { matches: match._id } });
    res.status(201).json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateMatch = async (req, res) => {
  try {
    // Whitelist allowed fields for update
    const allowed = [
      "teamA", "teamB", "teamAShort", "teamBShort", "matchTitle", "series", 
      "format", "venue", "city", "matchDate", "overs", "status", "result",
      "videoUrl", "isFeatured", "tournament", "squadA", "squadB"
    ];
    const updateData = {};
    Object.keys(req.body).forEach(key => { if (allowed.includes(key)) updateData[key] = req.body[key]; });

    const existingMatch = await Match.findById(req.params.id);
    if (!existingMatch) return res.status(404).json({ success: false, message: "Match not found" });

    if (req.body.tournament && String(req.body.tournament) !== String(existingMatch.tournament)) {
      await Tournament.findByIdAndUpdate(existingMatch.tournament, { $pull: { matches: existingMatch._id } });
      await Tournament.findByIdAndUpdate(req.body.tournament, { $addToSet: { matches: existingMatch._id } });
    } else if (req.body.tournament === null && existingMatch.tournament) {
      await Tournament.findByIdAndUpdate(existingMatch.tournament, { $pull: { matches: existingMatch._id } });
    }

    const match = await Match.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    emit(match._id, match);
    if (match.status === "completed") {
      try { await rebuildAllPlayerStats(); } catch (e) { console.error("Failed to rebuild player stats", e); }
    }
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteMatch = async (req, res) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    
    // Remove the deleted match from the tournament roster and rebuild standings
    if (match.tournament) {
      try {
        await Tournament.findByIdAndUpdate(match.tournament, { $pull: { matches: match._id } });
        await rebuildPointsTable(match.tournament);
      } catch (e) {
        console.error("Failed to update tournament after match deletion", e);
      }
    }
    
    // Rebuild player stats if match was completed
    if (match.status === "completed") {
      try {
        await rebuildAllPlayerStats();
      } catch (e) {
        console.error("Failed to rebuild player stats after match deletion", e);
      }
    }
    
    res.json({ success: true, message: "Match deleted and points table updated" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── ADMIN TOSS ─────────────────────────────────────── */

exports.setToss = async (req, res) => {
  try {
    const { winner, decision } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Not found" });
    match.tossWinner = winner;
    match.tossDecision = decision;
    const battingFirst = decision === "bat" ? winner : (winner === match.teamA ? match.teamB : match.teamA);
    match.innings1 = { battingTeam: battingFirst, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
    match.status = "live";
    await match.save();
    emit(match._id, match);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── ADMIN LIVE SCORE UPDATE (CRICKET RULES ENGINE) ─── */

exports.updateScore = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    if (match.status === "completed") {
      return res.status(400).json({ success: false, message: "Match is already completed. Please use Undo if you need to correct the final ball." });
    }

    const { 
      inningsNum, runs = 0, isWicket = false, extraType = null, 
      batterName, bowlerName, commentary, recentBalls, 
      outPlayerName, wicketType, fielderName 
    } = req.body;

    const key = match.isSuperOver 
      ? (inningsNum === 1 ? "superOverInnings1" : "superOverInnings2")
      : (inningsNum === 1 ? "innings1" : "innings2");
    const inn = match[key];
    if (!inn) return res.status(400).json({ success: false, message: "Innings not initialized" });

    const isWide = extraType === "wide";
    const isNoBall = extraType === "noBall";
    const isBye = extraType === "bye";
    const isLegBye = extraType === "legBye";
    const isLegal = !isWide && !isNoBall;
    const currentBallOverStr = `${Math.floor(inn.balls / 6)}.${(inn.balls % 6) + 1}`;

    // Sync the striker based on the frontend's manual selection
    if (batterName) {
      inn.batsmen.forEach(b => {
        if (!b.isOut) {
          b.isStriker = (b.name === batterName);
        }
      });
    }

    // Consecutive-over and quota checks only apply at the START of a new legal over
    // (must be a legal delivery — wides/no-balls don't complete an over)
    const isNewLegalOver = inn.balls > 0 && inn.balls % 6 === 0 && !isWide && !isNoBall;
    if (isNewLegalOver) {
      if (inn.lastOverBowler === bowlerName) {
        return res.status(400).json({ success: false, message: "A bowler cannot bowl consecutive overs. Please change the bowler." });
      }

      if (match.format !== "Test") {
        const bwl = inn.bowlers.find(b => b.name === bowlerName);
        if (bwl) {
          let maxOversPerBowler = Math.ceil((match.overs || 20) / 5);

          // Track Blaster Championship Rules
          if (match.series && match.series.toLowerCase().includes("track blaster")) {
            if (match.format === "T8") maxOversPerBowler = 3;
            if (match.format === "T10") maxOversPerBowler = 3;

            // Check if bowler is starting their 3rd over (they have 12 balls)
            if (bwl.balls >= 12) {
              const otherBowlersWith3 = inn.bowlers.filter(b => b.name !== bowlerName && b.balls >= 12).length;
              if (match.format === "T8" && otherBowlersWith3 >= 1) {
                return res.status(400).json({ success: false, message: "Track Blaster Rule: Only 1 bowler can bowl 3 overs in T-8." });
              }
              if (match.format === "T10" && otherBowlersWith3 >= 2) {
                return res.status(400).json({ success: false, message: "Track Blaster Rule: Only 2 bowlers can bowl 3 overs in T-10." });
              }
            }
          }

          if (bwl.balls >= maxOversPerBowler * 6) {
            return res.status(400).json({ success: false, message: `Bowler limit reached! A bowler can bowl maximum ${maxOversPerBowler} overs.` });
          }
        }
      }
    }

    let r = Number(runs);
    const wicketBall = isWicket && !["runOut", "retired-hurt", "retired-out"].includes(wicketType);
    if (wicketBall) r = 0;

    // 1. Update Team Score & Extras
    if (extraType === "penalty") {
      inn.runs = Math.max(0, inn.runs - r);
      inn.extras -= r;
    } else {
      inn.runs += r;
      const isAdjustment = extraType === "bonus" || extraType === "penalty";
      if (isLegal && !isAdjustment) inn.balls++;

      if (isWide || isNoBall) {
        inn.extras += 1; // Standard 1 run for wide/no-ball
        inn.runs += 1;   // The penalty run
        if (isWide) inn.extras += r; // All runs on a wide are Wides
        if (isNoBall && (isBye || isLegBye)) inn.extras += r; // Byes on No-Ball are Extras
      } else if (isBye || isLegBye || extraType === "bonus") {
        inn.extras += r; 
      }
    }

    // NOTE: inn.wickets is incremented AFTER fallOfWickets push (below in section 3)
    // to keep the score string accurate (BUG 3 fix)

    // 2. Batsman Stats (Striker)
    let rotateStrike = (r % 2 !== 0) && (extraType !== "bonus" && extraType !== "penalty");
    if (batterName) {
      const bat = inn.batsmen.find(b => b.name === batterName);
      if (bat) {
        // Runs off bat = total runs minus extras (if byes/legbyes/wides/bonus/penalty)
        const runsOffBat = (isBye || isLegBye || isWide || extraType === "bonus" || extraType === "penalty") ? 0 : r;
        bat.runs += runsOffBat;
        if (!isWide) bat.balls++; // Wide doesn't count for batsman balls
        if (runsOffBat === 4) bat.fours++;
        if (runsOffBat === 6) bat.sixes++;

        // Milestone check (50, 100)
        if (bat.runs === 50 || bat.runs === 100) {
           const mType = String(bat.runs);
           inn.milestones ||= [];
           if (!inn.milestones.some(m => m.player === bat.name && m.type === mType)) {
              inn.milestones.push({ player: bat.name, type: mType, over: currentBallOverStr, score: `${inn.runs}/${inn.wickets}` });
              inn.commentary.unshift({ over: "", text: `🏏 MILESTONE: ${bat.name} reaches ${bat.runs}!`, runs: 0, isWicket: false });
           }
        }
      }
    }

    // 3. Handle Wickets & Fall of Wickets
    if (isWicket) {
      const dismissedPlayerName = outPlayerName || batterName;
      const bat = inn.batsmen.find(b => b.name === dismissedPlayerName);
      if (bat) {
        bat.isOut = true;
        bat.isStriker = false;

        // Generate dismissal string
        let dis = "";
        const f = fielderName || "Fielder";
        const b = bowlerName || "Bowler";
        if (wicketType === "caught") dis = `c ${f} b ${b}`;
        else if (wicketType === "bowled") dis = `b ${b}`;
        else if (wicketType === "lbw") dis = `lbw b ${b}`;
        else if (wicketType === "runOut") dis = `run out (${f})`;
        else if (wicketType === "stumped") dis = `st. ${f} b ${b}`;
        else if (wicketType === "hit-wicket") dis = `hit wicket b ${b}`;
        else if (wicketType === "retired-hurt") dis = `retired hurt`;
        else if (wicketType === "retired-out") dis = `retired out`;
        else dis = `out b ${b}`;
        
        bat.dismissal = dis;

        const bowlerWicket = isWicket && !["runOut", "retired-hurt", "retired-out", "timed-out"].includes(wicketType);

        // BUG 3 FIX: push fallOfWickets BEFORE incrementing inn.wickets so score is correct
        inn.wickets++;
        inn.fallOfWickets.push({
          score: `${inn.runs}/${inn.wickets}`,
          over: currentBallOverStr,
          player: dismissedPlayerName,
          wicketNum: inn.wickets
        });

        // Milestone check on wicket (3W, 5W)
        const bwl = inn.bowlers.find(b => b.name === bowlerName);
        if (bwl) {
          const w = bwl.wickets + (bowlerWicket ? 1 : 0);
          if (w === 3 || w === 5) {
            const mType = `${w}W`;
            inn.milestones ||= [];
            if (!inn.milestones.some(m => m.player === bwl.name && m.type === mType)) {
              inn.milestones.push({ player: bwl.name, type: mType, over: currentBallOverStr, score: `${inn.runs}/${inn.wickets}` });
              inn.commentary.unshift({ over: "", text: `⭐ MILESTONE: ${bwl.name} has taken ${w} wickets!`, runs: 0, isWicket: false });
            }
          }
        }
      }
      rotateStrike = false; // New batsman takes strike (Modern Rule)
    }

    // 4. Bowler Stats
    if (bowlerName) {
      const bwl = inn.bowlers.find(b => b.name === bowlerName);
      if (bwl) {
        // Bowler concedes: runs off bat + wides + no-balls
        let conceded = 0;
        if (isWide) {
          conceded = r + 1; // 1 for wide + runs taken (wides)
        } else if (isNoBall) {
          // If no-ball, bowler always concedes at least 1. 
          // If byes/legbyes occur, they don't count for bowler. 
          // If runs off bat occur, they DO count.
          const runsOffBat = (isBye || isLegBye) ? 0 : r;
          conceded = runsOffBat + 1;
        } else {
          // Legal ball
          conceded = (isBye || isLegBye || extraType === "bonus" || extraType === "penalty") ? 0 : r;
        }
        bwl.runs += conceded;
        if (!isWide && !isNoBall) bwl.balls++;
        const bowlerWicket = isWicket && !["runOut", "retired-hurt", "retired-out", "timed-out"].includes(wicketType);
        if (bowlerWicket) bwl.wickets++;
      }
    }

    // 5. Partnership Tracking
    if (!inn.partnerships || inn.partnerships.length === 0) {
      const active = inn.batsmen.filter(b => !b.isOut).map(b => b.name);
      if (active.length === 2) {
        inn.partnerships.push({ players: active, runs: 0, balls: 0 });
      }
    }
    if (inn.partnerships && inn.partnerships.length > 0) {
      const ps = inn.partnerships[inn.partnerships.length - 1];
      const runsOffBat = (isBye || isLegBye || isWide || extraType === "bonus" || extraType === "penalty") ? 0 : r;
      ps.runs += runsOffBat + (isWide || isNoBall ? 1 : 0);
      if (!isWide && !isNoBall) ps.balls++;
      
      if (isWicket) {
        const active = inn.batsmen.filter(b => !b.isOut).map(b => b.name);
        if (active.length === 2) {
          inn.partnerships.push({ players: active, runs: 0, balls: 0 });
        }
      }
    }

    // 6. Commentary (Always push to maintain the undo stack)
    const autoText = commentary || `${r} run${r !== 1 ? 's' : ''}${isWicket ? ' OUT' : ''}${extraType ? ` (${extraType})` : ''}`;
    inn.commentary.unshift({
      over: currentBallOverStr,
      text: autoText, runs: r, isWicket: !!isWicket, extraType,
      batterName, bowlerName
    });

    // 7. Strike Rotation at End of Over & Maiden Calculation
    const isOverComplete = isLegal && (inn.balls % 6 === 0) && (extraType !== "bonus" && extraType !== "penalty");
    if (isOverComplete) {
      rotateStrike = !rotateStrike;
      inn.lastOverBowler = bowlerName;

      // BUG 7 FIX: capture over balls BEFORE prepending END OF OVER commentary
      const lastOverNum = Math.floor((inn.balls - 1) / 6);
      // Use the front of commentary (newest first) — ball entries for current over
      // are at the top since we haven't prepended the summary yet
      const thisOverBalls = inn.commentary.filter(c => c.over && c.over.split('.')[0] === String(lastOverNum));
      const runsInOver = thisOverBalls.reduce((acc, curr) => acc + (curr.runs || 0), 0);
      const wktsInOver = thisOverBalls.filter(c => c.isWicket).length;

      // BUG 7 FIX: check maiden BEFORE unshifting END OF OVER entry
      const bwl = inn.bowlers.find(b => b.name === bowlerName);
      if (bwl) {
        const extrasInOver = thisOverBalls.filter(c => c.extraType === "wide" || c.extraType === "noBall").length;
        if (runsInOver === 0 && extrasInOver === 0) {
          bwl.maidens++;
        }
      }

      inn.overHistory ||= [];
      inn.overHistory.push({
        over: lastOverNum + 1,
        runs: runsInOver,
        wickets: wktsInOver
      });

      // Smart Commentary: Summary of the Over (prepended AFTER maiden check)
      inn.commentary.unshift({
        over: `${lastOverNum + 1}.0`,
        text: `🔚 END OF OVER ${lastOverNum + 1}: ${runsInOver} runs | ${wktsInOver} wickets. Score: ${inn.runs}/${inn.wickets}`,
        runs: 0,
        isWicket: false
      });
    }

    if (rotateStrike) {
      const active = inn.batsmen.filter(b => !b.isOut);
      if (active.length === 2) {
        active[0].isStriker = !active[0].isStriker;
        active[1].isStriker = !active[1].isStriker;
      }
    }

    // 7. Automatic Completion Logic
    const maxWickets = match.isSuperOver ? 2 : 10;
    const maxOvers = match.isSuperOver ? 1 : (match.overs || 20);
    const targetValue = match.isSuperOver && inningsNum === 2 ? (match.superOverInnings1.runs + 1) : match.target;

    const allOut = inn.wickets >= maxWickets;
    const maxOversReached = inn.balls >= maxOvers * 6;
    const isTargetReached = inningsNum === 2 && inn.runs >= targetValue;

    if (allOut || maxOversReached || isTargetReached) {
      if (inningsNum === 1) {
        if (!match.isSuperOver) {
          match.currentInnings = 2;
          match.target = inn.runs + 1;
          const bowlingTeam = match.innings1.battingTeam === match.teamA ? match.teamB : match.teamA;
          match.innings2 = { battingTeam: bowlingTeam, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
        } else {
          // Super Over 1st Innings done
          match.currentInnings = 2;
          const bowlingTeam = match.superOverInnings1.battingTeam === match.teamA ? match.teamB : match.teamA;
          match.superOverInnings2 = { battingTeam: bowlingTeam, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
        }
      } else {
        // Match or Super Over Finished
        match.status = "completed";
        const r1 = match.isSuperOver ? match.superOverInnings1.runs : match.innings1.runs;
        const r2 = match.isSuperOver ? match.superOverInnings2.runs : match.innings2.runs;
        const w1 = match.isSuperOver ? match.superOverInnings1.wickets : match.innings1.wickets;
        const w2 = match.isSuperOver ? match.superOverInnings2.wickets : match.innings2.wickets;
        const bt1 = match.isSuperOver ? match.superOverInnings1.battingTeam : match.innings1.battingTeam;
        const bt2 = match.isSuperOver ? match.superOverInnings2.battingTeam : match.innings2.battingTeam;

        if (r2 > r1) {
          match.result = `${bt2} won by ${maxWickets - w2} wickets${match.isSuperOver ? " (Super Over)" : ""}`;
        } else if (r1 > r2) {
          match.result = `${bt1} won by ${r1 - r2} runs${match.isSuperOver ? " (Super Over)" : ""}`;
        } else {
          match.result = "Match Tied";
        }
        // Compute match-level statistics (Man of the Match, top performers)
        try {
          if (typeof computeMatchStatistics === 'function') computeMatchStatistics(match);
        } catch (e) { console.error("Failed to compute match statistics", e); }
      }
    }

    if (recentBalls) match.recentBalls = recentBalls;
    if (bowlerName) match.currentBowler = bowlerName;
    // BUG 6 FIX: always refresh currentBatsmen from live innings state
    match.currentBatsmen = inn.batsmen.filter(b => !b.isOut).map(b => b.name);
    match.markModified(key); await match.save();

    if (match.status === "completed") {
      try { await rebuildAllPlayerStats(); } catch (e) { console.error("Failed to rebuild player stats", e); }
    }

    // Poll generation is handled asynchronously below (non-blocking) to reduce
    // latency and avoid score-response failures during over-completion.

    emit(match._id, match);
    if (match.tournament) await rebuildPointsTable(match.tournament);
    
    // Asynchronously generate a poll if the over is complete (non-blocking for performance)
    if (isOverComplete) {
      setTimeout(() => {
        generateOverPoll(match).catch(err => console.error("Poll generation error:", err));
      }, 0);
    }

    res.json({ success: true, match, isOverComplete });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── ADMIN MANAGE PLAYERS ───────────────────────────── */

exports.addBatsman = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });
    const key = req.params.num === "1" ? "innings1" : "innings2";
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Not found" });
    if (match.status === "completed") return res.status(400).json({ success: false, message: "Match completed" });
    
    const inn = match[key];
    if (!inn) return res.status(400).json({ success: false, message: "Innings not initialized. Please perform toss first." });

    const active = inn.batsmen.filter(b => !b.isOut);
    if (active.length >= 2) return res.status(400).json({ success: false, message: "Two batsmen already on field" });
    
    inn.batsmen.push({ name, isStriker: active.length === 0 });
    match.currentBatsmen = inn.batsmen.filter(b => !b.isOut).map(b => b.name);
    
    match.markModified(key); await match.save();
    emit(match._id, match);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.addBowler = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name is required" });
    const key = req.params.num === "1" ? "innings1" : "innings2";
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Not found" });
    if (match.status === "completed") return res.status(400).json({ success: false, message: "Match completed" });
    
    const inn = match[key];
    if (!inn) return res.status(400).json({ success: false, message: "Innings not initialized. Please perform toss first." });

    const exists = inn.bowlers.find(b => b.name === name);
    if (!exists) inn.bowlers.push({ name, balls: 0, wickets: 0, runs: 0 });
    match.currentBowler = name;
    
    match.markModified(key); await match.save();
    emit(match._id, match);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.addCommentary = async (req, res) => {
  try {
    const { inningsNum, over, text, runs, isWicket, extraType } = req.body;
    const key = inningsNum === 1 ? "innings1" : "innings2";
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Not found" });
    match[key].commentary.unshift({ over, text, runs: runs || 0, isWicket: !!isWicket, extraType });
    match.markModified(key); await match.save();
    emit(match._id, match);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.undoLastBall = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    // BUG 5 FIX: use correct innings key for Super Over
    const buildKey = (innNum) => {
      if (match.isSuperOver) return innNum === 1 ? "superOverInnings1" : "superOverInnings2";
      return innNum === 1 ? "innings1" : "innings2";
    };

    let key = buildKey(match.currentInnings || 1);
    let inn = match[key];

    // BUG 4 FIX: if innings 2 has no commentary, undo means we need to reverse the innings switch
    if ((match.currentInnings === 2) && (!inn || !inn.commentary || inn.commentary.length === 0)) {
      match.currentInnings = 1;
      match.status = "live";
      key = buildKey(1);
      inn = match[key];

      // Reverse the auto-created innings 2 and target
      if (!match.isSuperOver) {
        match.innings2 = undefined;
        match.target = 0;
      } else {
        match.superOverInnings2 = undefined;
      }
    }

    if (!inn || !inn.commentary || inn.commentary.length === 0) {
       return res.status(400).json({ success: false, message: "Nothing to undo" });
    }

    const lastAction = inn.commentary.shift();
    const r = lastAction.runs || 0;
    const isWicket = !!lastAction.isWicket;
    const extraType = lastAction.extraType;
    const isLegal = !extraType || !["wide", "noBall"].includes(extraType);

    if (extraType === "penalty") {
      inn.runs += r;
      inn.extras += r;
    } else {
      inn.runs = Math.max(0, inn.runs - r);
      if (extraType === "wide" || extraType === "noBall") {
        inn.runs = Math.max(0, inn.runs - 1); // Remove the penalty run
        inn.extras = Math.max(0, (inn.extras || 0) - 1);
        if (extraType === "wide") inn.extras = Math.max(0, inn.extras - r);
      } else if (extraType === "bye" || extraType === "legBye" || extraType === "bonus") {
        inn.extras = Math.max(0, inn.extras - r);
      }
      const isAdjustment = extraType === "bonus" || extraType === "penalty";
      if (isLegal && !isAdjustment) inn.balls = Math.max(0, inn.balls - 1);
    }

    // --- REVERSE PLAYER STATS ---
    const bName = lastAction.batterName;
    const bwName = lastAction.bowlerName;

    if (bName) {
      const bat = inn.batsmen.find(b => b.name === bName);
      if (bat) {
        const runsOffBat = (extraType === "bye" || extraType === "legBye" || extraType === "wide" || extraType === "bonus" || extraType === "penalty") ? 0 : r;
        bat.runs = Math.max(0, bat.runs - runsOffBat);
        if (extraType !== "wide") bat.balls = Math.max(0, bat.balls - 1);
        if (runsOffBat === 4) bat.fours = Math.max(0, bat.fours - 1);
        if (runsOffBat === 6) bat.sixes = Math.max(0, bat.sixes - 1);
      }
    }

    if (bwName) {
      const bwl = inn.bowlers.find(b => b.name === bwName);
      if (bwl) {
        const isWide = extraType === "wide";
        const isNoBall = extraType === "noBall";
        const isBye = extraType === "bye";
        const isLegBye = extraType === "legBye";
        const conceded = (isBye || isLegBye || extraType === "bonus" || extraType === "penalty") ? 0 : (r + (isWide || isNoBall ? 1 : 0));
        bwl.runs = Math.max(0, bwl.runs - conceded);
        if (!isWide && !isNoBall) bwl.balls = Math.max(0, bwl.balls - 1);
        
        const wType = lastAction.wicketType;
        const bowlerWicket = isWicket && !["runOut", "retired-hurt", "retired-out", "timed-out"].includes(wType);
        if (bowlerWicket) bwl.wickets = Math.max(0, bwl.wickets - 1);

        // Reverse Maiden: if we are undoing the 6th ball (isOverCompleteBeforeUndo), 
        // we check if the over WAS a maiden.
        if (isLegal && (inn.balls + 1) % 6 === 0) {
           const thisOverBalls = [lastAction, ...inn.commentary.slice(0, 7)].filter(c => c.over.split('.')[0] === String(Math.floor(inn.balls/6)));
           const runsInOver = thisOverBalls.reduce((acc, curr) => acc + (curr.runs || 0), 0);
           const extrasInOver = thisOverBalls.filter(c => c.extraType === "wide" || c.extraType === "noBall").length;
           if (runsInOver === 0 && extrasInOver === 0) {
             bwl.maidens = Math.max(0, bwl.maidens - 1);
           }
        }
      }
    }

    // --- REVERSE PARTNERSHIPS ---
    if (inn.partnerships && inn.partnerships.length > 0) {
      if (isWicket && inn.partnerships.length > 1) {
        inn.partnerships.pop(); // Remove the new partnership started after wicket
      }
      const ps = inn.partnerships[inn.partnerships.length - 1];
      if (ps) {
        const runsOffBat = (extraType === "bye" || extraType === "legBye" || extraType === "wide" || extraType === "bonus" || extraType === "penalty") ? 0 : r;
        ps.runs = Math.max(0, ps.runs - (runsOffBat + (extraType === "wide" || extraType === "noBall" ? 1 : 0)));
        if (!["wide", "noBall"].includes(extraType)) ps.balls = Math.max(0, ps.balls - 1);
      }
    }

    if (isWicket) {
      inn.wickets = Math.max(0, inn.wickets - 1);
      inn.fallOfWickets.pop();
      // Find the last out player and mark them NOT out safely
      let lastOut = null;
      for (let i = inn.batsmen.length - 1; i >= 0; i--) {
        if (inn.batsmen[i].isOut) {
          lastOut = inn.batsmen[i];
          break;
        }
      }
      if (lastOut) {
        lastOut.isOut = false;
        // Clean up any extra batsman added after the wicket who hasn't faced a ball
        const active = inn.batsmen.filter(b => !b.isOut);
        if (active.length > 2) {
          const lastAdded = active[active.length - 1];
          if (lastAdded && lastAdded.balls === 0 && lastAdded.runs === 0) {
            inn.batsmen = inn.batsmen.filter(b => b.name !== lastAdded.name);
          }
        }
      }
    }

    const isAdjustment = extraType === "bonus" || extraType === "penalty";
    let rotateStrike = !isAdjustment && (r % 2 !== 0);
    const isOverCompleteBeforeUndo = !isAdjustment && isLegal && (inn.balls + 1) % 6 === 0;
    if (isOverCompleteBeforeUndo) {
      rotateStrike = !rotateStrike;
    }

    if (rotateStrike) {
      const active = inn.batsmen.filter(b => !b.isOut);
      if (active.length === 2) {
        active[0].isStriker = !active[0].isStriker;
        active[1].isStriker = !active[1].isStriker;
      }
    }
    if (match.recentBalls.length > 0) match.recentBalls.pop();

    match.status = "live";
    match.result = "";
    // BUG 6 FIX: refresh currentBatsmen after undo
    match.currentBatsmen = inn.batsmen.filter(b => !b.isOut).map(b => b.name);

    match.markModified(key); await match.save();
    emit(match._id, match);
    if (match.tournament) await rebuildPointsTable(match.tournament);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/* ── MAGIC OVER REMOVED ─────────────────────────────────── */

exports.setMatchStatus = async (req, res) => {
  try {
    const { status, result } = req.body;
    const match = await Match.findByIdAndUpdate(req.params.id, { status, result }, { new: true });
    emit(match._id, match);
    if (match.tournament) await rebuildPointsTable(match.tournament);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.declareInnings = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    if (match.status === "completed") return res.status(400).json({ success: false, message: "Match completed" });

    const innNum = match.currentInnings || 1;
    const key = match.isSuperOver ? (innNum === 1 ? "superOverInnings1" : "superOverInnings2") : (innNum === 1 ? "innings1" : "innings2");
    const inn = match[key];
    
    if (!inn) return res.status(400).json({ success: false, message: "Innings not initialized" });

    inn.commentary.unshift({
      over: `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`,
      text: `📢 INNINGS DECLARED / ALL OUT. Innings closes at ${inn.runs}/${inn.wickets}.`,
      runs: 0, isWicket: false
    });

    if (innNum === 1) {
      match.currentInnings = 2;
      if (!match.isSuperOver) {
        match.target = inn.runs + 1;
        const bowlingTeam = match.innings1.battingTeam === match.teamA ? match.teamB : match.teamA;
        match.innings2 = { battingTeam: bowlingTeam, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
      } else {
        const bowlingTeam = match.superOverInnings1.battingTeam === match.teamA ? match.teamB : match.teamA;
        match.superOverInnings2 = { battingTeam: bowlingTeam, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
      }
    } else {
      match.status = "completed";
      const r1 = match.isSuperOver ? match.superOverInnings1.runs : match.innings1.runs;
      const r2 = match.isSuperOver ? match.superOverInnings2.runs : match.innings2.runs;
      const bt1 = match.isSuperOver ? match.superOverInnings1.battingTeam : match.innings1.battingTeam;
      const bt2 = match.isSuperOver ? match.superOverInnings2.battingTeam : match.innings2.battingTeam;

      if (r2 > r1) match.result = `${bt2} won`;
      else if (r1 > r2) match.result = `${bt1} won`;
      else match.result = "Match Tied";

      try {
        if (typeof computeMatchStatistics === 'function') computeMatchStatistics(match);
      } catch (e) {}
    }

    match.markModified(key);
    await match.save();
    
    if (match.status === "completed") {
      try { await rebuildAllPlayerStats(); } catch (e) { console.error("Failed to rebuild player stats", e); }
    }

    emit(match._id, match);
    if (match.tournament && match.status === "completed") await rebuildPointsTable(match.tournament);
    
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const inferResultState = (match) => {
  const resStr = (match.result || "").toLowerCase();

  if (resStr.includes("abandon") || resStr.includes("no result")) {
    return { winner: null, isTie: false, isNR: true };
  }

  if (resStr.includes("won")) {
    const teamA = (match.teamA || "").toLowerCase();
    const teamB = (match.teamB || "").toLowerCase();
    const teamAShort = (match.teamAShort || "").toLowerCase();
    const teamBShort = (match.teamBShort || "").toLowerCase();

    if (teamA && (resStr.includes(teamA) || (teamAShort && resStr.includes(teamAShort)))) {
      return { winner: match.teamA, isTie: false, isNR: false };
    }
    if (teamB && (resStr.includes(teamB) || (teamBShort && resStr.includes(teamBShort)))) {
      return { winner: match.teamB, isTie: false, isNR: false };
    }
  }

  if (resStr.includes("tie")) {
    return { winner: null, isTie: true, isNR: false };
  }

  if (match.isSuperOver) {
    const so1 = match.superOverInnings1 || {};
    const so2 = match.superOverInnings2 || {};
    const so1Runs = Number(so1.runs || 0);
    const so2Runs = Number(so2.runs || 0);

    if (so1Runs > so2Runs) return { winner: so1.battingTeam || match.teamA, isTie: false, isNR: false };
    if (so2Runs > so1Runs) return { winner: so2.battingTeam || match.teamB, isTie: false, isNR: false };
    if (so1Runs > 0 || so2Runs > 0) return { winner: null, isTie: true, isNR: false };
  }

  const r1 = Number(match.innings1?.runs || 0);
  const r2 = Number(match.innings2?.runs || 0);

  if (r1 > r2) return { winner: match.innings1?.battingTeam || match.teamA, isTie: false, isNR: false };
  if (r2 > r1) return { winner: match.innings2?.battingTeam || match.teamB, isTie: false, isNR: false };
  if (r1 > 0 || r2 > 0) return { winner: null, isTie: true, isNR: false };

  return { winner: null, isTie: false, isNR: true };
};

const rebuildPointsTable = async (tournamentId) => {
  if (!tournamentId) return;
  try {
    const tourney = await Tournament.findById(tournamentId).populate("matches");
    if (!tourney || !tourney.teams) return;

    const table = {};
    tourney.teams.forEach(t => {
      table[t] = { team: t, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };
    });

    tourney.matches.forEach(m => {
      if (!m || m.status !== "completed") return;
      
      const { winner, isTie, isNR } = inferResultState(m);

      const tA = m.teamA;
      const tB = m.teamB;
      if (!table[tA]) table[tA] = { team: tA, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };
      if (!table[tB]) table[tB] = { team: tB, played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000", totalRuns: 0, totalBalls: 0, totalRunsConceded: 0, totalBallsBowled: 0 };

      table[tA].played++;
      table[tB].played++;

      if (winner === tA) { table[tA].won++; table[tA].points += 2; table[tB].lost++; }
      else if (winner === tB) { table[tB].won++; table[tB].points += 2; table[tA].lost++; }
      else if (isTie) { table[tA].tied++; table[tB].tied++; table[tA].points += 1; table[tB].points += 1; }
      if (isNR) { table[tA].nr++; table[tB].nr++; table[tA].points += 1; table[tB].points += 1; }

      // NRR calculation only applies to matches with a result (not abandoned/NR)
      if (isNR) return;

      const inn1 = m.innings1;
      const inn2 = m.innings2;
      // BUG 10 FIX: use correct max wickets for format (super over = 2, normal = 10)
      const maxWicketsForNRR = m.isSuperOver ? 2 : 10;
      if (inn1 && inn1.balls > 0) {
        const batTeam = inn1.battingTeam === tA ? tA : tB;
        const bowlTeam = batTeam === tA ? tB : tA;
        let b = inn1.balls;
        if (inn1.wickets >= maxWicketsForNRR) b = (m.overs || 20) * 6;
        table[batTeam].totalRuns += inn1.runs;
        table[batTeam].totalBalls += b;
        table[bowlTeam].totalRunsConceded += inn1.runs;
        table[bowlTeam].totalBallsBowled += b;
      }
      if (inn2 && inn2.balls > 0) {
        const batTeam = inn2.battingTeam === tA ? tA : tB;
        const bowlTeam = batTeam === tA ? tB : tA;
        let b = inn2.balls;
        if (inn2.wickets >= maxWicketsForNRR) b = (m.overs || 20) * 6;
        table[batTeam].totalRuns += inn2.runs;
        table[batTeam].totalBalls += b;
        table[bowlTeam].totalRunsConceded += inn2.runs;
        table[bowlTeam].totalBallsBowled += b;
      }
    });

    Object.values(table).forEach(row => {
      const scoredOvers = row.totalBalls / 6;
      const concededOvers = row.totalBallsBowled / 6;
      const scoredRate = scoredOvers > 0 ? row.totalRuns / scoredOvers : 0;
      const concededRate = concededOvers > 0 ? row.totalRunsConceded / concededOvers : 0;
      const nrr = scoredRate - concededRate;
      row.nrr = (nrr > 0 ? "+" : "") + nrr.toFixed(3);
    });

    tourney.pointsTable = Object.values(table).sort((a, b) => 
      b.points - a.points || 
      b.won - a.won || 
      parseFloat(b.nrr) - parseFloat(a.nrr)
    );
    await tourney.save();
  } catch(e) { console.error("Points table rebuild failed", e); }
};

// Rebuild player leaderboards (tournament-level) by aggregating match.statistics
exports.rebuildPlayerLeaderboards = async (tournamentId) => {
  const { Tournament } = require("../models/other");
  if (!tournamentId) return null;
  try {
    const tourney = await Tournament.findById(tournamentId).populate("matches");
    if (!tourney) return null;

    const agg = {}; // player -> aggregated stats

    for (const m of tourney.matches) {
      if (!m || m.status !== "completed") continue;

      // Ensure match statistics exist
      let stats = m.statistics && Object.keys(m.statistics || {}).length > 0 ? m.statistics : null;
      if (!stats) {
        try { computeMatchStatistics(m); stats = m.statistics; } catch(e) { /* ignore */ }
      }
      if (!stats || !Array.isArray(stats.players)) continue;

      stats.players.forEach(p => {
        if (!p || !p.name) return;
        const dest = agg[p.name] = agg[p.name] || { name: p.name, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0, points: 0 };
        dest.runs += p.runs || 0;
        dest.balls += p.balls || 0;
        dest.fours += p.fours || 0;
        dest.sixes += p.sixes || 0;
        dest.wickets += p.wickets || 0;
        dest.ballsBowled += p.ballsBowled || 0;
        dest.runsConceded += p.runsConceded || 0;
        dest.maidens += p.maidens || 0;
        dest.points += p.points || 0;
      });
    }

    const players = Object.values(agg).map(p => {
      const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
      const overs = p.ballsBowled ? (p.ballsBowled / 6) : 0;
      const economy = p.ballsBowled > 0 ? (p.runsConceded / overs) : null;
      const average = p.runs > 0 && p.wickets > 0 ? (p.runs / p.wickets) : (p.runs || 0);
      return Object.assign({}, p, { strikeRate: Math.round(strikeRate), economy: economy === null ? null : parseFloat(economy.toFixed(2)), overs: parseFloat(overs.toFixed(2)), average: parseFloat(average.toFixed(2)) });
    });

    // Derive leaderboards
    const overall = players.slice().sort((a,b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs).slice(0,50);
    const sixes = players.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs).slice(0,20);
    const fours = players.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs).slice(0,20);
    const strike = players.slice().filter(p => p.balls >= 10).sort((a,b) => b.strikeRate - a.strikeRate).slice(0,20);
    const economy = players.slice().filter(p => p.ballsBowled >= 6).sort((a,b) => (a.economy === null ? 999 : a.economy) - (b.economy === null ? 999 : b.economy)).slice(0,20);
    const average = players.slice().filter(p => p.runs >= 20).sort((a,b) => b.average - a.average).slice(0,20);

    const leaderboards = { overall, sixes, fours, strike, economy, average };

    tourney.playerLeaderboards = leaderboards;
    await tourney.save();
    return leaderboards;
  } catch (e) { console.error("rebuildPlayerLeaderboards failed", e); return null; }
};

// Compute per-match statistics and decide Man of the Match
function computeMatchStatistics(match) {
  if (!match) return;
  const players = {}; // name -> aggregated stats

  const ingestInnings = (inn) => {
    if (!inn) return;
    if (Array.isArray(inn.batsmen)) {
      inn.batsmen.forEach(b => {
        if (!b || !b.name) return;
        const p = players[b.name] = players[b.name] || { name: b.name, runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0 };
        p.runs += (b.runs || 0);
        p.balls += (b.balls || 0);
        p.fours += (b.fours || 0);
        p.sixes += (b.sixes || 0);
        if (b.isOut) p.outs += 1;
      });
    }
    if (Array.isArray(inn.bowlers)) {
      inn.bowlers.forEach(b => {
        if (!b || !b.name) return;
        const p = players[b.name] = players[b.name] || { name: b.name, runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, wickets: 0, ballsBowled: 0, runsConceded: 0, maidens: 0 };
        p.wickets += (b.wickets || 0);
        p.ballsBowled += (b.balls || 0);
        p.runsConceded += (b.runs || 0);
        p.maidens += (b.maidens || 0);
      });
    }
  };

  // Use main innings (ignore super over for awards by default)
  ingestInnings(match.innings1);
  ingestInnings(match.innings2);

  // Recent (finisher) stats: collect last N balls faced per player (from commentary)
  const recentMap = {}; // name -> array of recent runs per legal ball (newest first)
  const collectRecentFrom = (inn, maxBalls = 6) => {
    if (!inn || !Array.isArray(inn.commentary)) return;
    for (const c of inn.commentary) {
      if (!c || !c.batterName) continue;
      const name = c.batterName;
      // exclude wides and no-balls for ball count
      if (c.extraType === "wide" || c.extraType === "noBall") continue;
      const runsOffBat = (c.extraType === "bye" || c.extraType === "legBye") ? 0 : (c.runs || 0);
      recentMap[name] = recentMap[name] || [];
      if (recentMap[name].length < maxBalls) recentMap[name].push(runsOffBat);
    }
  };
  collectRecentFrom(match.innings1, 6);
  collectRecentFrom(match.innings2, 6);

  // Calculate derived metrics and points
  const playerList = Object.values(players).map(p => {
    const strikeRate = p.balls > 0 ? (p.runs / p.balls) * 100 : 0;
    const overs = p.ballsBowled ? (p.ballsBowled / 6) : 0;
    const economy = p.ballsBowled > 0 ? (p.runsConceded / overs) : null;
    const average = p.outs > 0 ? (p.runs / p.outs) : (p.runs || 0);

    // Points formula (simple heuristic)
    let points = 0;
    points += (p.runs || 0) * 1;              // 1 pt per run
    points += (p.fours || 0) * 1;             // 1 pt per four
    points += (p.sixes || 0) * 2;             // 2 pt per six
    if ((p.runs || 0) >= 50) points += 10;    // fifty bonus
    if ((p.runs || 0) >= 100) points += 20;   // century bonus
    points += (p.wickets || 0) * 25;         // 25 pt per wicket
    if ((p.wickets || 0) >= 3) points += 10;  // 3+ wicket bonus
    // Strike rate bonus requires a minimum balls faced
    const minBallsForSRBonus = 10;
    if (p.balls >= minBallsForSRBonus) {
      if (strikeRate >= 150) points += 10;
      else if (strikeRate >= 130) points += 5;
    }
    if (economy !== null) {
      if (economy < 6) points += 10;
      else if (economy < 8) points += 5;
    }

    // Finisher bonus: player's recent strike rate in last up-to-6 balls they faced
    const recent = recentMap[p.name] || [];
    if (recent.length >= 3) {
      const recentRuns = recent.reduce((a,b) => a + (b || 0), 0);
      const recentSR = (recentRuns / recent.length) * 100;
      if (recentSR >= 200) points += 8;    // explosive finisher
      else if (recentSR >= 175) points += 5;
    }

    return Object.assign({}, p, { strikeRate: Math.round(strikeRate), economy: economy === null ? null : parseFloat(economy.toFixed(2)), overs: parseFloat(overs.toFixed(2)), average: parseFloat(average.toFixed(2)), points });
  });

  if (playerList.length === 0) {
    match.statistics = {};
    return;
  }

  // Top performers
  const sixerKing = playerList.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs)[0];
  const fourKing = playerList.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs)[0];
  const topScore = playerList.slice().sort((a,b) => b.runs - a.runs || b.strikeRate - a.strikeRate)[0];
  const mostHundreds = playerList.slice().filter(p => p.runs >= 100).sort((a,b) => b.runs - a.runs || b.sixes - a.sixes)[0] || null;
  const mostFifties = playerList.slice().filter(p => p.runs >= 50).sort((a,b) => b.runs - a.runs || b.fours - a.fours)[0] || null;
  const mostThirties = playerList.slice().filter(p => p.runs >= 30 && p.runs < 50).sort((a,b) => b.runs - a.runs || b.fours - a.fours)[0] || null;
  const mostFours = playerList.slice().sort((a,b) => b.fours - a.fours || b.runs - a.runs)[0];
  const mostSixes = playerList.slice().sort((a,b) => b.sixes - a.sixes || b.runs - a.runs)[0];
  const highestStrike = playerList.slice().filter(p => p.balls > 0).sort((a,b) => b.strikeRate - a.strikeRate || b.runs - a.runs)[0];
  const mostWickets = playerList.slice().sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0];
  const bestBowlingAverage = playerList.slice().filter(p => p.wickets > 0).sort((a,b) => (a.runsConceded / a.wickets) - (b.runsConceded / b.wickets) || b.wickets - a.wickets)[0] || null;
  const bestBowling = playerList.slice().filter(p => p.wickets > 0).sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || null;
  const mostFiveWicketsHaul = playerList.slice().filter(p => p.wickets >= 5).sort((a,b) => b.wickets - a.wickets || a.runsConceded - b.runsConceded)[0] || null;
  const bestEconomy = playerList.slice().filter(p => p.ballsBowled >= 6).sort((a,b) => (a.economy === null ? 1 : a.economy) - (b.economy === null ? 1 : b.economy) || b.wickets - a.wickets)[0] || null;
  const bestAverage = playerList.slice().filter(p => p.runs > 0).sort((a,b) => b.average - a.average || b.runs - a.runs)[0];

  // Man of the Match by points, tiebreaker wickets then runs
  const mom = playerList.slice().sort((a,b) => b.points - a.points || b.wickets - a.wickets || b.runs - a.runs)[0];

  match.statistics = {
    manOfTheMatch: mom ? { name: mom.name, points: mom.points, runs: mom.runs, wickets: mom.wickets, reason: mom.points } : null,
    sixerKing: sixerKing ? { name: sixerKing.name, sixes: sixerKing.sixes } : null,
    fourKing: fourKing ? { name: fourKing.name, fours: fourKing.fours } : null,
    highestScore: topScore ? { name: topScore.name, runs: topScore.runs, balls: topScore.balls } : null,
    bestBattingAverage: bestAverage ? { name: bestAverage.name, average: bestAverage.average, runs: bestAverage.runs, outs: bestAverage.outs } : null,
    bestStrikeRate: highestStrike ? { name: highestStrike.name, strikeRate: highestStrike.strikeRate, runs: highestStrike.runs, balls: highestStrike.balls } : null,
    mostHundreds: mostHundreds ? { name: mostHundreds.name, runs: mostHundreds.runs } : null,
    mostFifties: mostFifties ? { name: mostFifties.name, runs: mostFifties.runs } : null,
    mostThirties: mostThirties ? { name: mostThirties.name, runs: mostThirties.runs } : null,
    mostFours: mostFours ? { name: mostFours.name, fours: mostFours.fours } : null,
    mostSixes: mostSixes ? { name: mostSixes.name, sixes: mostSixes.sixes } : null,
    mostWickets: mostWickets ? { name: mostWickets.name, wickets: mostWickets.wickets, runsConceded: mostWickets.runsConceded } : null,
    bestBowlingAverage: bestBowlingAverage ? { name: bestBowlingAverage.name, average: parseFloat((bestBowlingAverage.runsConceded / bestBowlingAverage.wickets).toFixed(2)), wickets: bestBowlingAverage.wickets, runsConceded: bestBowlingAverage.runsConceded } : null,
    bestBowling: bestBowling ? { name: bestBowling.name, wickets: bestBowling.wickets, runsConceded: bestBowling.runsConceded } : null,
    mostFiveWicketsHaul: mostFiveWicketsHaul ? { name: mostFiveWicketsHaul.name, wickets: mostFiveWicketsHaul.wickets, runsConceded: mostFiveWicketsHaul.runsConceded } : null,
    bestEconomy: bestEconomy ? { name: bestEconomy.name, economy: bestEconomy.economy, overs: bestEconomy.overs, runsConceded: bestEconomy.runsConceded, wickets: bestEconomy.wickets } : null,
    players: playerList
  };
};

const predictionsCache = new Map();
const PREDICTIONS_TTL = 30000; // 30 seconds TTL for AI predictions

exports.getMatchPredictions = async (req, res) => {
  try {
    const matchId = req.params.id;
    const now = Date.now();

    if (predictionsCache.has(matchId)) {
      const cached = predictionsCache.get(matchId);
      if (now - cached.timestamp < PREDICTIONS_TTL) {
        return res.json({ success: true, data: cached.data });
      }
    }

    const match = await Match.findById(matchId);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });
    const predictions = await getLivePredictions(match);
    
    predictionsCache.set(matchId, { data: predictions, timestamp: now });

    res.json({ success: true, data: predictions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.startSuperOver = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    match.isSuperOver = true;
    match.currentInnings = 1;
    match.status = "live";
    match.result = "";
    
    // In Super Over, 2nd innings batting team bats first
    const team1 = match.innings2.battingTeam;
    const team2 = match.innings1.battingTeam;

    match.superOverInnings1 = { battingTeam: team1, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };
    match.superOverInnings2 = { battingTeam: team2, runs: 0, wickets: 0, balls: 0, extras: 0, batsmen: [], bowlers: [], commentary: [], fallOfWickets: [], partnerships: [], overHistory: [], milestones: [] };

    await match.save();
    emit(match._id, match);
    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Admin: manually set/override Man of the Match
exports.setManOfTheMatch = async (req, res) => {
  try {
    const { name, reason } = req.body;
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: "Match not found" });

    match.statistics = match.statistics || {};
    match.statistics.manOfTheMatch = { name: name || null, reason: reason || "Selected by admin", selectedByAdmin: true, selectedAt: new Date() };

    await match.save();
    emit(match._id, match);
    // Rebuild tournament leaderboards if applicable
    if (match.tournament) {
      try { await exports.rebuildPlayerLeaderboards(match.tournament); } catch (e) { console.error('leaderboard rebuild failed', e); }
    }

    res.json({ success: true, match });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
