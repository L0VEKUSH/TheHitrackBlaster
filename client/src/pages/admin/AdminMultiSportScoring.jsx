import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiPlus, FiCheck, FiX, FiAward } from "react-icons/fi";

export default function AdminMultiSportScoring() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [match, setMatch] = useState(null);
  const [score, setScore] = useState({});

  useEffect(() => {
    const saved = localStorage.getItem("multi_sport_matches");
    if (saved) {
      const found = JSON.parse(saved).find(m => m.id === id);
      setMatch(found);
      // Initialize scoring state based on sport
      if (found.sport === 'kabaddi') {
        // Support comma, "vs", or "VS" as separators
        const parts = found.participants.split(/,|\s+vs\s+/i).map(t => t.trim()).filter(Boolean);
        const t1 = parts[0] || "Home Team";
        const t2 = parts[1] || "Away Team";
        setScore({ 
          [t1]: { points: 0, raids: 0, tackles: 0 }, 
          [t2]: { points: 0, raids: 0, tackles: 0 } 
        });
      } else if (found.sport === 'race') {
        const runners = found.participants.split(',').map(t => t.trim());
        setScore(runners.map(r => ({ name: r, time: '', rank: '-' })));
      } else { // Jump events
        const athletes = found.participants.split(',').map(t => t.trim());
        setScore(athletes.map(a => ({ name: a, attempts: [], best: 0 })));
      }
    }
  }, [id]);

  if (!match) return null;

  const updateKabaddi = (team, field, delta) => {
    setScore(prev => ({
      ...prev,
      [team]: { ...prev[team], [field]: Math.max(0, prev[team][field] + delta), points: field === 'points' ? Math.max(0, prev[team].points + delta) : prev[team].points }
    }));
  };

  const updateRace = (idx, field, val) => {
    const next = [...score];
    next[idx][field] = val;
    setScore(next);
  };

  const updateJump = (idx, measurement) => {
    const next = [...score];
    next[idx].attempts.push(measurement);
    next[idx].best = Math.max(...next[idx].attempts);
    setScore(next);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/admin/multi-sport")} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10">
            <FiChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">{match.title}</h1>
            <p className="text-[10px] text-brand-500 font-bold uppercase tracking-widest mt-1">Live Scoring Hub • {match.sport}</p>
          </div>
        </div>
        <div className="flex gap-2">
           <span className="bg-red-500/10 text-red-500 text-[10px] font-black px-4 py-2 rounded-full border border-red-500/20 uppercase animate-pulse">Live</span>
        </div>
      </div>

      {/* Sport Specific Rule Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          
          {match.sport === 'kabaddi' && (
            <div className="grid grid-cols-2 gap-6">
              {Object.keys(score).map(team => (
                <div key={team} className="card p-8 bg-gray-900/50 border-white/5 space-y-8">
                  <div className="text-center">
                    <h2 className="text-xl font-black text-white uppercase mb-4">{team}</h2>
                    <div className="text-6xl font-black text-brand-500 mb-6">{score[team].points}</div>
                  </div>
                  
                  <div className="space-y-4">
                    {['points', 'raids', 'tackles'].map(field => (
                      <div key={field} className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{field}</span>
                        <div className="flex items-center gap-4">
                          <button onClick={() => updateKabaddi(team, field, -1)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-gray-400">-</button>
                          <span className="text-lg font-black text-white w-8 text-center">{score[team][field]}</span>
                          <button onClick={() => updateKabaddi(team, field, 1)} className="w-8 h-8 rounded-lg bg-brand-500/20 text-brand-500 flex items-center justify-center">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {match.sport === 'race' && (
            <div className="card p-8 bg-gray-900/50 border-white/5">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Athlete</th>
                    <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Timing (s)</th>
                    <th className="pb-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {score.length > 0 && score.map((r, idx) => (
                    <tr key={idx} className="group">
                      <td className="py-6 font-black text-white uppercase text-sm">{r.name}</td>
                      <td className="py-6">
                        <input 
                          type="text" value={r.time} onChange={(e) => updateRace(idx, 'time', e.target.value)}
                          className="bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-white outline-none focus:border-brand-500 w-32"
                          placeholder="00.00"
                        />
                      </td>
                      <td className="py-6">
                        <select 
                          value={r.rank} onChange={(e) => updateRace(idx, 'rank', e.target.value)}
                          className="bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-white outline-none focus:border-brand-500"
                        >
                          <option>-</option>
                          <option>1st</option>
                          <option>2nd</option>
                          <option>3rd</option>
                          <option>4th+</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(match.sport === 'high-jump' || match.sport === 'long-jump') && (
            <div className="space-y-4">
              {score.length > 0 && score.map((a, idx) => (
                <div key={idx} className="card p-6 bg-gray-900/50 border-white/5 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">{a.name}</h3>
                    <div className="flex gap-2">
                      {a.attempts.map((att, i) => (
                        <span key={i} className="text-[10px] font-bold bg-white/5 px-2 py-1 rounded-md text-gray-400 border border-white/5">{att}m</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                       <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">Best</div>
                       <div className="text-2xl font-black text-brand-500">{a.best}m</div>
                    </div>
                    <div className="flex gap-2">
                       <input 
                         type="number" step="0.01" id={`jump-${idx}`}
                         className="w-20 bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-white outline-none focus:border-brand-500 text-sm"
                         placeholder="0.00"
                       />
                       <button 
                        onClick={() => {
                          const el = document.getElementById(`jump-${idx}`);
                          if(el.value) { updateJump(idx, parseFloat(el.value)); el.value = ''; }
                        }}
                        className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center text-white shadow-glow-orange"
                       >
                         <FiPlus />
                       </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
           <div className="card p-8 bg-brand-500 text-white relative overflow-hidden group shadow-glow-orange border-none">
              <div className="absolute -right-10 -bottom-10 opacity-10 rotate-12 transition-transform group-hover:scale-125">
                 <FiAward size={200} />
              </div>
              <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-4 leading-none">Official <br/>Rules</h3>
              <p className="text-xs font-bold text-white/80 leading-relaxed mb-6">
                {match.sport === 'kabaddi' ? '30-second raids, bonus points for 6+ defenders, and all-out points.' : 
                 match.sport === 'race' ? 'Fastest time across the line. False starts will be penalized.' :
                 '3 attempts per height. Success continues, 3 fails means elimination.'}
              </p>
              <button className="w-full py-4 bg-gray-950 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-white hover:text-black transition-all">Download Rulebook</button>
           </div>
        </div>
      </div>
    </div>
  );
}
