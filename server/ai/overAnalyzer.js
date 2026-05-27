// server/ai/overAnalyzer.js
/**
 * Analyzes momentum based on the most recent over.
 */
exports.analyzeOverMomentum = (recentOver) => {
  if (!recentOver || !recentOver.balls) return { momentum: "Neutral", trend: "Stable" };

  const balls = recentOver.balls;
  const runs = balls.reduce((acc, b) => acc + (b.runs || 0), 0);
  const wickets = balls.filter(b => b.isWicket).length;

  let momentum = "Neutral";
  let trend = "Stable";

  if (runs > 12) {
    momentum = "High Batting";
    trend = "Aggressive";
  } else if (runs < 4 && wickets === 0) {
    momentum = "Bowling Control";
    trend = "Restrictive";
  }

  if (wickets > 0) {
    momentum = "Major Bowling";
    trend = "Wicket-taking";
  }

  return { runs, wickets, momentum, trend };
};
