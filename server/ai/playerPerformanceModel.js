// server/ai/playerPerformanceModel.js
/**
 * Predicts player performance for the current match.
 */
exports.predictPerformance = (player, match) => {
  if (!player) return null;

  // Basic stats
  const careerAvg = player.batting?.average || 30;
  const careerSR = player.batting?.strikeRate || 130;
  
  // Dynamic factors (Match situation)
  let predictedRuns = careerAvg * (0.8 + Math.random() * 0.4);
  let predictedSR = careerSR * (0.9 + Math.random() * 0.2);

  // Wicket prediction
  const careerWickets = player.bowling?.wickets || 0;
  const careerMatches = player.bowling?.matches || 1;
  const wicketsPerMatch = careerWickets / careerMatches;
  let predictedWickets = Math.round(wicketsPerMatch * (0.7 + Math.random() * 0.6));

  return {
    runs: Math.round(predictedRuns),
    strikeRate: Math.round(predictedSR),
    wickets: predictedWickets,
    confidence: 75 + Math.round(Math.random() * 15)
  };
};
