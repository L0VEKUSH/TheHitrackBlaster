import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const SmartAIInsights = ({ match }) => {
  const insight = useMemo(() => {
    if (!match || match.status !== "live") return null;

    const currentInn = match.currentInnings === 2 ? match.innings2 : match.innings1;
    if (!currentInn || currentInn.balls < 6) return "Match just started. Setting the stage... 🏟️";

    // Insight 1: RRR pressure
    if (match.currentInnings === 2 && match.target > 0) {
      const runsLeft = match.target - currentInn.runs;
      const ballsLeft = (match.overs * 6) - currentInn.balls;
      const rrr = (runsLeft / ballsLeft) * 6;
      if (rrr > 12) return "🚨 RRR is over 12! Batting team needs big overs now.";
      if (rrr < 6) return "✅ Cruising. Batting team in total control.";
    }

    // Insight 2: Recent wicket
    const lastBall = match.recentBalls?.[match.recentBalls.length - 1];
    if (lastBall === "W") return "📉 Momentum shift! Wicket falls at a crucial time.";

    // Insight 3: High scoring
    const last12 = match.recentBalls?.slice(-12) || [];
    const runs12 = last12.reduce((acc, b) => acc + (parseInt(b) || 0), 0);
    if (runs12 > 24) return "🔥 Explosive batting! 24+ runs in the last 2 overs.";

    // Insight 4: Dot ball pressure
    const dotCount = last12.filter(b => b === "0" || b === "•").length;
    if (dotCount > 8) return "🤫 Bowler is drying up the runs. Pressure building.";

    return "The game is on a knife-edge. Every ball counts! ⚔️";
  }, [match]);

  return (
    <AnimatePresence mode="wait">
      {insight && (
        <motion.div
          key={insight}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="bg-brand-500/10 border-l-4 border-brand-500 p-3 rounded-r-lg mt-4 flex items-center gap-3"
        >
          <span className="text-lg">🧠</span>
          <p className="text-xs font-medium text-brand-200">{insight}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
