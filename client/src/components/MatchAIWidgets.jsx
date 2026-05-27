// client/src/components/MatchAIWidgets.jsx
import { useState, useEffect } from "react";
import { matchAPI, pollAPI } from "../services/api";
import { motion, AnimatePresence } from "framer-motion";

export default function MatchAIWidgets({ matchId }) {
  const [predictions, setPredictions] = useState(null);
  const [polls, setPolls] = useState([]);
  const [voted, setVoted] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [aiRes, pollRes, lbRes] = await Promise.all([
          matchAPI.getAIPredictions(matchId),
          pollAPI.getMatchPolls(matchId),
          pollAPI.getLeaderboard()
        ]);
        setPredictions(aiRes.data.data);
        setPolls(pollRes.data.data);
        setLeaderboard(lbRes.data.data.slice(0, 5));
      } catch (err) { console.error("AI Error:", err); }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [matchId]);

  const handleVote = async (pollId, optionId) => {
    if (voted.has(pollId)) return;
    try {
      await pollAPI.vote({ pollId, optionId });
      setVoted(prev => new Set(prev).add(pollId));
      // Refresh polls
      const { data } = await pollAPI.getMatchPolls(matchId);
      setPolls(data.data);
    } catch (err) { alert("Vote failed"); }
  };

  return (
    <div className="space-y-6">
      {/*  Win Probability */}
      {predictions && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/80 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <span className="text-6xl">🔮</span>
          </div>

          <h3 className="text-sm font-black text-brand-400 uppercase tracking-widest mb-6"> Probability</h3>

          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs font-bold text-gray-400 mb-2 uppercase">
                <span>{predictions.winProbability.battingTeamName || "Batting Team"}</span>
                <span>{predictions.winProbability.bowlingTeamName || "Bowling Team"}</span>
              </div>
              <div className="h-4 bg-gray-800 rounded-full overflow-hidden flex">
                <motion.div
                  initial={{ width: "50%" }}
                  animate={{ width: `${Math.max(1, Math.min(99, Number(predictions.winProbability.battingTeam) || 50))}%` }}
                  className="bg-gradient-to-r from-brand-600 to-brand-400 h-full shadow-[0_0_20px_rgba(var(--brand-primary),0.5)]"
                />
                <div className="flex-1 bg-gray-700" />
              </div>
              <div className="flex justify-between mt-3">
                <span className="text-2xl font-black text-white">{Math.max(1, Math.min(99, Number(predictions.winProbability.battingTeam) || 50))}%</span>
                <span className="text-2xl font-black text-white">{100 - Math.max(1, Math.min(99, Number(predictions.winProbability.battingTeam) || 50))}%</span>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-brand-500/5 border border-brand-500/10 rounded-2xl p-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="text-[10px] font-black text-brand-500 uppercase mb-2 tracking-tighter">Typing....</div>
                <p className="text-sm text-gray-300 leading-relaxed italic">{"\"" + predictions.commentary + "\""}</p>
              </div>
              {predictions.momentum && (
                <div className="rounded-2xl bg-gray-900/60 p-3 text-right">
                  <div className="text-[10px] uppercase tracking-widest text-gray-400">Momentum</div>
                  <div className="text-sm font-black text-white">{predictions.momentum.momentum}</div>
                  <div className="text-xs text-gray-400">{predictions.momentum.trend}</div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Live Polls */}
      {polls.length > 0 && (
        <div className="flex items-center justify-between mb-4 gap-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-brand-400">
            {polls.every(poll => poll.type === "auto") ? "Live Auto Polls" : "Live Polls"}
          </h2>
          {polls.some(poll => poll.type === "auto") && !polls.every(poll => poll.type === "auto") && (
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/30">
              Auto Polls Included
            </span>
          )}
        </div>
      )}
      <AnimatePresence>
        {polls.map(poll => {
          const questionMatch = poll.question.match(/^(.+?) will/);
          const pollTitle = questionMatch ? questionMatch[1] : poll.question;
          const isVoted = voted.has(poll._id);

          return (
            <motion.div
              key={poll._id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-900 border border-brand-500/20 rounded-3xl p-6 shadow-xl"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">{pollTitle}</h3>
                  {poll.type === "auto" && (
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">Auto Poll</div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {poll.options.map(opt => {
                  const percent = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;

                  return (
                    <button
                      key={opt._id}
                      onClick={() => handleVote(poll._id, opt._id)}
                      disabled={isVoted}
                      className="relative w-full text-left bg-gray-800/50 hover:bg-gray-800 rounded-2xl p-4 transition-all group overflow-hidden border border-white/5"
                    >
                      {isVoted && (
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${percent}%` }}
                          className="absolute inset-y-0 left-0 bg-brand-500/20 border-r-2 border-brand-500"
                        />
                      )}
                      <div className="relative flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-200">{opt.text}</span>
                        {isVoted && <span className="text-xs font-black text-brand-400">{percent}%</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-[10px] font-bold text-gray-500 uppercase text-center tracking-widest">
                {poll.totalVotes} People Voted
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/80 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl overflow-hidden relative mt-6"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <span className="text-6xl">🏆</span>
          </div>
          <h3 className="text-sm font-black text-brand-400 uppercase tracking-widest mb-6">Top Fans</h3>
          <div className="space-y-3 relative z-10">
            {leaderboard.map((user, idx) => (
              <div key={user._id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-xs font-black text-white shrink-0 overflow-hidden border border-white/10">
                    {user.avatar ? <img src={user.avatar} alt="avatar" className="w-full h-full object-cover"/> : user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-xs font-bold text-gray-300 truncate max-w-[120px]">{user.name}</div>
                </div>
                <div className="text-xs font-black text-brand-400">{user.pollPoints} <span className="text-[10px] text-gray-500 uppercase">pts</span></div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
