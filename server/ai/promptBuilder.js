// server/ai/promptBuilder.js
/**
 * Builds descriptive strings for AI commentary generation.
 */
exports.buildCommentaryPrompt = (data) => {
  const {
    batsman = "The batsman",
    bowler = "the bowler",
    score = "0/0 (0.0 ov)",
    situation = {},
    lastBall,
    runRate,
    requiredRate
  } = data;

  const { momentum = "Neutral", trend = "Stable", runs, wickets } = situation;
  const textFragments = [];

  if (momentum === "High Batting") {
    textFragments.push(`The batting side is on top at ${score}. ${batsman} is looking dangerous and the fielding side needs to respond quickly.`);
  } else if (momentum === "Major Bowling") {
    textFragments.push(`A breakthrough for the bowlers has shifted the momentum. ${bowler} is firing in and the batting line-up is under real pressure.`);
  } else if (momentum === "Bowling Control") {
    textFragments.push(`The bowlers are keeping it tight. ${bowler} is controlling the pace and the batsmen are being forced to work for every run.`);
  } else {
    textFragments.push(`It remains a balanced contest at ${score}. Both sides are probing for an edge as the match unfolds.`);
  }

  if (runs != null && wickets != null) {
    textFragments.push(`Last over produced ${runs} runs and ${wickets} wicket${wickets === 1 ? "" : "s"}, so the next few deliveries could define the session.`);
  }

  if (requiredRate != null) {
    textFragments.push(`The chase needs ${requiredRate.toFixed(2)} per over from here to stay on track.`);
  } else if (runRate != null) {
    textFragments.push(`The current run rate is ${runRate.toFixed(2)}, setting an interesting tempo for the innings.`);
  }

  if (lastBall) {
    textFragments.push(`Latest ball: ${lastBall}`);
  }

  const commentary = textFragments.join(" ");
  return commentary;
};
