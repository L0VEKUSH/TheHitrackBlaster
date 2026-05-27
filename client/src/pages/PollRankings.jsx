import { useEffect, useState } from "react";
import { pollAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { motion } from "framer-motion";

export default function PollRankings() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const { data } = await pollAPI.getLeaderboard();
        setUsers(data.data);
      } catch (err) {
        setError("Failed to load fan rankings");
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) return <Spinner size="lg" />;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-6xl font-black text-white italic uppercase tracking-tighter mb-4">
          Fan <span className="text-brand-500">Rankings</span>
        </h1>
        <p className="text-gray-400 text-sm md:text-base font-bold uppercase tracking-widest">
          Top poll predictors of the season
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-center font-bold mb-8">
          {error}
        </div>
      )}

      {users.length === 0 && !error ? (
        <div className="text-center text-gray-500 italic py-10">No users have earned points yet. Vote in match polls to be the first!</div>
      ) : (
        <div className="space-y-4">
          {users.map((u, i) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              key={u._id} 
              className={`flex items-center p-4 md:p-6 rounded-[2rem] border ${
                i === 0 ? "bg-gradient-to-r from-yellow-500/20 to-brand-500/10 border-yellow-500/30" : 
                i === 1 ? "bg-white/5 border-gray-400/20" :
                i === 2 ? "bg-orange-900/10 border-orange-500/20" :
                "bg-white/5 border-white/5"
              }`}
            >
              <div className="w-12 text-center text-2xl font-black text-white/50 italic mr-4">#{i + 1}</div>
              
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-800 border-2 border-white/10 shrink-0">
                {u.avatar ? (
                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-black text-gray-400">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>

              <div className="ml-4 flex-1">
                <div className="text-lg font-black text-white uppercase">{u.name}</div>
                {u.favoriteTeam && <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{u.favoriteTeam} Fan</div>}
              </div>

              <div className="text-right">
                <div className="text-2xl font-black text-brand-400">{u.pollPoints}</div>
                <div className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Points</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
