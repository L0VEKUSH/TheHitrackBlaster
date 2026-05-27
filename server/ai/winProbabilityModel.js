// server/ai/winProbabilityModel.js
/**
 * Advanced Win Probability Engine
 * Uses current runs, wickets, balls, and match format heuristics.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundProbability = (value) => Math.round(clamp(value, 1, 99));

const baselineRPO = (overs) => {
  if (overs >= 40) return 6.5;
  if (overs >= 30) return 7.5;
  if (overs >= 20) return 8.5;
  return 9.5;
};

const firstInningsProbability = ({ runs, wickets, ballsBowled, overs }) => {
  const totalBalls = overs * 6;
  if (ballsBowled <= 0) return 50;

  const currentRR = runs * 6 / ballsBowled;
  const projectedScore = currentRR * overs;
  const parScore = baselineRPO(overs) * overs;
  const scoreDelta = (projectedScore - parScore) / Math.max(parScore, 1);

  let probability = 50 + scoreDelta * 34;

  const wicketPressure = (wickets / 10) * 18;
  probability -= wicketPressure;

  if (ballsBowled <= 18) {
    probability += Math.min(12, Math.max(-12, (currentRR - baselineRPO(overs)) * 5));
  }

  if (ballsBowled >= totalBalls * 0.75) {
    probability += (projectedScore - parScore) / Math.max(parScore, 1) * 18;
    probability -= wickets * 2;
  }

  if (wickets <= 2) probability += 8;
  if (wickets >= 8) probability -= 10;

  return roundProbability(probability);
};

const secondInningsProbability = ({ runs, wickets, ballsBowled, overs, target }) => {
  const totalBalls = overs * 6;
  const ballsRemaining = totalBalls - ballsBowled;
  const runsRequired = target - runs;

  if (runsRequired <= 0) return 99;
  if (ballsRemaining <= 0 || wickets >= 10) return 1;

  const currentRR = ballsBowled > 0 ? runs * 6 / ballsBowled : 0;
  const requiredRR = runsRequired * 6 / ballsRemaining;
  const wicketsRemaining = Math.max(0, 10 - wickets);

  let probability = 50;
  probability += (currentRR - requiredRR) * 8;
  probability += (wicketsRemaining - 4) * 3;
  probability += (ballsRemaining / totalBalls - 0.5) * 14;

  if (requiredRR <= baselineRPO(overs)) probability += 16;
  if (requiredRR <= baselineRPO(overs) * 1.1 && wicketsRemaining >= 5) probability += 12;
  if (requiredRR >= baselineRPO(overs) * 1.2) probability -= 14;
  if (requiredRR >= baselineRPO(overs) * 1.5) probability -= 22;
  if (requiredRR >= baselineRPO(overs) * 2) probability -= 28;

  if (ballsRemaining <= 12) {
    if (runsRequired <= 6 && wicketsRemaining >= 1) probability += 18;
    if (runsRequired > 18 && wicketsRemaining <= 3) probability -= 18;
  }

  if (runsRequired <= 10 && wicketsRemaining >= 4) probability += 12;
  if (runsRequired >= 30 && wicketsRemaining <= 2) probability -= 18;

  return roundProbability(probability);
};

exports.calculateWinProbability = (match) => {
  if (!match || (match.status !== "live" && match.status !== "upcoming")) {
    if (match.status === "completed") {
      const i1 = match.innings1?.runs || 0;
      const i2 = match.innings2?.runs || 0;
      if (i2 > i1) return { battingTeam: 99, bowlingTeam: 1 };
      if (i1 > i2) return { battingTeam: 1, bowlingTeam: 99 };
      return { battingTeam: 50, bowlingTeam: 50 };
    }
    return { battingTeam: 50, bowlingTeam: 50 };
  }

  const inningsNum = match.currentInnings || 1;
  const inn = inningsNum === 1 ? match.innings1 : match.innings2;
  if (!inn) return { battingTeam: 50, bowlingTeam: 50 };

  const overs = match.overs || 20;
  const target = match.target || 0;
  const isSecondInnings = inningsNum === 2;
  const runs = inn.runs || 0;
  const wickets = inn.wickets || 0;
  const ballsBowled = inn.balls || 0;

  const battingTeam = isSecondInnings
    ? secondInningsProbability({ runs, wickets, ballsBowled, overs, target })
    : firstInningsProbability({ runs, wickets, ballsBowled, overs });

  return {
    battingTeam,
    bowlingTeam: 100 - battingTeam
  };
};
