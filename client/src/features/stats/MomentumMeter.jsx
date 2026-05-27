import React, { useMemo } from "react";
import { motion } from "framer-motion";

export const MomentumMeter = ({ recentBalls = [] }) => {
  const momentum = useMemo(() => {
    if (!recentBalls.length) return 50;
    
    // Last 12 balls
    const window = recentBalls.slice(-12);
    let score = 50; // Neutral
    
    window.forEach(ball => {
      if (ball === "W") score -= 15;
      else if (ball === "6") score += 10;
      else if (ball === "4") score += 5;
      else if (ball === "0" || ball === "•") score -= 2;
      else {
        const runs = parseInt(ball);
        if (!isNaN(runs)) {
          if (runs > 1) score += runs;
          else score -= 1;
        }
      }
    });
    
    return Math.min(Math.max(score, 10), 90);
  }, [recentBalls]);

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-4 rounded-xl border border-white/10">
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-gray-400 mb-2 font-bold">
        <span>Bowling Pressure</span>
        <span>Batting Momentum</span>
      </div>
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden flex">
        <motion.div 
          className="h-full bg-gradient-to-r from-red-500 to-red-400"
          animate={{ width: `${100 - momentum}%` }}
          transition={{ type: "spring", stiffness: 50 }}
        />
        <motion.div 
          className="h-full bg-gradient-to-r from-green-400 to-green-500"
          animate={{ width: `${momentum}%` }}
          transition={{ type: "spring", stiffness: 50 }}
        />
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/20 -translate-x-1/2" />
      </div>
      <div className="mt-2 text-center">
        <span className="text-[10px] text-gray-500 font-medium">
          {momentum > 60 ? "Batting team dominating 🔥" : momentum < 40 ? "Bowling team in control 🎯" : "Balanced game ⚖️"}
        </span>
      </div>
    </div>
  );
};
