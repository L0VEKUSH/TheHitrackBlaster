import React, { useMemo } from "react";
import { motion } from "framer-motion";

export const WinProbability = ({ match }) => {
  const probData = useMemo(() => {
    if (!match) return { a: 50, b: 50 };
    
    const teamAName = match.teamAShort || match.teamA || "Team A";
    const teamBName = match.teamBShort || match.teamB || "Team B";

    if (match.status === "completed") {
      const aWon = match.result && match.result.includes(match.teamA);
      return { a: aWon ? 100 : 0, b: aWon ? 0 : 100, teamAName, teamBName };
    }

    const inn1 = match.innings1;
    const inn2 = match.innings2;

    if (!inn1) return { a: 50, b: 50, teamAName, teamBName };

    // Identify which team is batting first
    const teamABattingFirst = inn1.battingTeam === match.teamA;
    let probBattingTeam = 50;

    const totalBalls = (match.overs || 20) * 6;
    
    // Determine standard par score
    let parScore = (match.overs || 20) * 8; 
    if (match.format === 'RMC') parScore = 260;
    else if (match.format === 'T10') parScore = 100;
    else if (match.format === 'Test') parScore = 350;

    if (match.currentInnings === 1) {
      if (inn1.balls > 0) {
        const baseRR = parScore / (match.overs || 20);
        
        // Current Run Rate advantage
        const currentRR = inn1.runs / (inn1.balls / 6);
        const runsAdvantageFromRR = inn1.runs - (baseRR * (inn1.balls / 6)); 
        
        // Wicket advantage
        const expectedWicketsLost = 10 * (inn1.balls / totalBalls);
        const wicketAdvantage = expectedWicketsLost - inn1.wickets; 
        const runsAdvantageFromWickets = wicketAdvantage * (match.overs === 50 ? 15 : 8); 
        
        const totalRunAdvantage = runsAdvantageFromRR + runsAdvantageFromWickets;
        const shiftPerRun = (match.overs === 20 || match.format === 'T20') ? 0.8 : 0.3;
        
        probBattingTeam = 50 + (totalRunAdvantage * shiftPerRun);
      }
    } else {
      // 2nd innings
      if (!inn2 || inn2.balls === 0) {
        // Base probability based on target vs par score
        const targetDiff = (match.target || (inn1.runs + 1)) - parScore;
        const shiftPerRun = (match.overs === 20 || match.format === 'T20') ? 0.8 : 0.3;
        // if target is higher than par, chasing team prob is lower
        probBattingTeam = 50 - (targetDiff * shiftPerRun);
      } else {
        const target = match.target || (inn1.runs + 1);
        const runsLeft = target - inn2.runs;
        const ballsLeft = totalBalls - inn2.balls;
        const wicketsLeft = 10 - inn2.wickets;

        if (runsLeft <= 0) probBattingTeam = 99.9;
        else if (ballsLeft <= 0 || wicketsLeft <= 0) probBattingTeam = 0.1;
        else {
          const initialRRR = target / (match.overs || 20);
          const expectedRunsByNow = initialRRR * (inn2.balls / 6);
          const runsAdvantageFromRR = inn2.runs - expectedRunsByNow;
          
          const expectedWicketsLost = 10 * (inn2.balls / totalBalls);
          const wicketAdvantage = expectedWicketsLost - inn2.wickets;
          const runsAdvantageFromWickets = wicketAdvantage * (match.overs === 50 ? 15 : 8);
          
          let totalRunAdvantage = runsAdvantageFromRR + runsAdvantageFromWickets;
          
          // Late game pressure mRMCfier
          if (ballsLeft < 30) {
            const currentRRR = (runsLeft / ballsLeft) * 6;
            const rrrDiff = initialRRR - currentRRR; // negative if RRR climbed
            const pressureMultiplier = 1 + ((30 - ballsLeft) / 10); 
            totalRunAdvantage += (rrrDiff * 3 * pressureMultiplier);
          }
          
          const shiftPerRun = (match.overs === 20 || match.format === 'T20') ? 0.8 : 0.3;
          probBattingTeam = 50 + (totalRunAdvantage * shiftPerRun);
          
          // Impossible math boundary
          if (runsLeft > ballsLeft * 6) probBattingTeam = 0.1;
        }
      }
    }

    probBattingTeam = Math.max(1, Math.min(99, probBattingTeam));

    // Assign to Team A and Team B properly
    let aProb, bProb;
    if (match.currentInnings === 1) {
      if (teamABattingFirst) {
        aProb = probBattingTeam;
        bProb = 100 - probBattingTeam;
      } else {
        bProb = probBattingTeam;
        aProb = 100 - probBattingTeam;
      }
    } else {
      // In 2nd innings, batting team is chasing
      if (!teamABattingFirst) {
        aProb = probBattingTeam;
        bProb = 100 - probBattingTeam;
      } else {
        bProb = probBattingTeam;
        aProb = 100 - probBattingTeam;
      }
    }

    return { a: Math.round(aProb), b: Math.round(bProb), teamAName, teamBName };
  }, [match]);

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm p-4 rounded-xl border border-white/10 mt-4">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Win Probability</span>
        <div className="flex gap-4">
          <span className="text-[10px] font-bold text-blue-400">{probData.teamAName}: {probData.a}%</span>
          <span className="text-[10px] font-bold text-red-400">{probData.teamBName}: {probData.b}%</span>
        </div>
      </div>
      <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden flex">
        <motion.div 
          className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          animate={{ width: `${probData.a}%` }}
          transition={{ type: "spring", stiffness: 30 }}
        />
        <motion.div 
          className="h-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"
          animate={{ width: `${probData.b}%` }}
          transition={{ type: "spring", stiffness: 30 }}
        />
      </div>
    </div>
  );
};
