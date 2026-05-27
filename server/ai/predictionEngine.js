// server/ai/predictionEngine.js
const { calculateWinProbability } = require("./winProbabilityModel");
const { predictPerformance } = require("./playerPerformanceModel");
const { analyzeOverMomentum } = require("./overAnalyzer");
const { buildCommentaryPrompt } = require("./promptBuilder");

/**
 * Main AI Engine Entry Point
 */
exports.getLivePredictions = async (match) => {
  if (!match) return null;

  const winProb = calculateWinProbability(match);
  const teamAName = match.teamA || match.teamAShort || "Team A";
  const teamBName = match.teamB || match.teamBShort || "Team B";
  const innNum = match.currentInnings || 1;
  const inn = innNum === 1 ? match.innings1 : match.innings2;
  const battingTeamName = (inn?.battingTeam && inn.battingTeam.trim()) || (innNum === 2 ? teamBName : teamAName);
  const bowlingTeamName = battingTeamName === teamAName ? teamBName : teamAName;
  
  if (!inn) return {
    winProbability: { ...winProb, battingTeamName, bowlingTeamName },
    momentum: null,
    commentary: "Preparing for the match...",
    timestamp: new Date()
  };

  const currentStriker = (inn.batsmen || []).find(b => b.isStriker)?.name || "The batsman";
  const currentBowler = match.currentBowler || "the bowler";
  const scoreStr = `${inn.runs}/${inn.wickets} (${Math.floor(inn.balls / 6)}.${inn.balls % 6} ov)`;

  const lastBalls = (inn.commentary || []).slice(0, 6);
  const overAnalysis = analyzeOverMomentum({ balls: lastBalls });

  const targetValue = match.isSuperOver && innNum === 2 ? (match.superOverInnings1.runs + 1) : match.target;
  const remainingBalls = Math.max(0, (match.overs || 20) * 6 - inn.balls);
  const requiredRate = innNum === 2 && targetValue && remainingBalls > 0
    ? (targetValue - inn.runs) / (remainingBalls / 6)
    : null;

  const lastBall = lastBalls[0] ? `${lastBalls[0].bowlerName || currentBowler} to ${lastBalls[0].batterName || currentStriker}, ${lastBalls[0].text}` : null;

  return {
    winProbability: { ...winProb, battingTeamName, bowlingTeamName },
    momentum: overAnalysis,
    commentary: buildCommentaryPrompt({
      batsman: currentStriker,
      bowler: currentBowler,
      score: scoreStr,
      situation: overAnalysis,
      lastBall,
      runRate: match.currentRunRate,
      requiredRate
    }),
    timestamp: new Date()
  };
};
