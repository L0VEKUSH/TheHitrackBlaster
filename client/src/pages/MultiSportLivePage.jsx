import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

export default function MultiSportLivePage() {
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem("multi_sport_matches");
    if (saved) setMatches(JSON.parse(saved));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 pb-20">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-12">
           <div className="w-3 h-8 bg-brand-500 rounded-full" />
           <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Live <span className="text-brand-500">Arena</span></h1>
        </div>

        {matches.length === 0 ? (
          <div className="card p-20 text-center border-white/5 bg-gray-900/40">
             <div className="text-6xl mb-6">📡</div>
             <h2 className="text-2xl font-black text-white uppercase mb-2">No active events</h2>
             <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Stay tuned for the next multi-sport clash.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {matches.map(m => (
              <div key={m.id} className="card p-8 bg-gray-900 border-white/5 relative overflow-hidden group hover:border-brand-500/50 transition-all">
                <div className="absolute top-0 right-0 p-6">
                   <span className="text-[9px] font-black uppercase tracking-widest bg-red-500 text-white px-3 py-1 rounded-full animate-pulse">{m.status}</span>
                </div>
                
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center text-2xl border border-brand-500/20">
                      {m.sport === 'kabaddi' ? '🤼' : m.sport === 'race' ? '🏃' : m.sport === 'high-jump' ? '🪜' : '🏜️'}
                   </div>
                   <div>
                      <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{m.sport}</div>
                      <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">{m.date}</div>
                   </div>
                </div>

                <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4">{m.title}</h3>
                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-8">{m.venue}</p>

                <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                   <div className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Participants</div>
                   <div className="text-xs font-black text-white uppercase">{m.participants.split(',').length} Teams/Athletes</div>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-brand-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
