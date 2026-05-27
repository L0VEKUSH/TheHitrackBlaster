import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiPlus, FiEdit2, FiTrash2, FiPlay } from "react-icons/fi";

export default function AdminMultiSport() {
  const [matches, setMatches] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("multi_sport_matches");
    if (saved) setMatches(JSON.parse(saved));
  }, []);

  const deleteMatch = (id) => {
    const filtered = matches.filter(m => m.id !== id);
    setMatches(filtered);
    localStorage.setItem("multi_sport_matches", JSON.stringify(filtered));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter">Multi-Sport <span className="text-brand-500">Events</span></h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">Manage Kabaddi, Athletics, and Field Events</p>
        </div>
        <Link to="/admin/multi-sport/new" className="btn-primary flex items-center gap-2">
          <FiPlus /> New Event
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {matches.length === 0 ? (
          <div className="card p-20 text-center border-dashed border-2 border-white/5 bg-transparent">
             <div className="text-4xl mb-4">🏆</div>
             <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No multi-sport events found. Start by creating one.</p>
          </div>
        ) : (
          matches.map(m => (
            <div key={m.id} className="card p-6 flex items-center justify-between group hover:border-brand-500/50 transition-all">
              <div className="flex items-center gap-6">
                 <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center text-2xl border border-brand-500/20">
                    {m.sport === 'kabaddi' ? '🤼' : m.sport === 'race' ? '🏃' : m.sport === 'high-jump' ? '🪜' : '🏜️'}
                 </div>
                 <div>
                    <div className="flex items-center gap-3 mb-1">
                       <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">{m.sport}</span>
                       <span className="w-1 h-1 rounded-full bg-gray-700" />
                       <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{m.status}</span>
                    </div>
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">{m.title}</h3>
                    <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">{m.venue} • {m.date}</p>
                 </div>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <Link to={`/admin/multi-sport/${m.id}/live`} className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-glow-orange">
                    <FiPlay />
                 </Link>
                 <Link to={`/admin/multi-sport/${m.id}/edit`} className="w-10 h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center hover:bg-white/10 hover:text-white transition-all">
                    <FiEdit2 />
                 </Link>
                 <button onClick={() => deleteMatch(m.id)} className="w-10 h-10 rounded-xl bg-white/5 text-gray-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                    <FiTrash2 />
                 </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
