import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiSave } from "react-icons/fi";

const SPORTS = [
  { id: 'kabaddi', name: 'Kabaddi', icon: '🤼' },
  { id: 'race', name: 'Sprint Race', icon: '🏃' },
  { id: 'high-jump', name: 'High Jump', icon: '🪜' },
  { id: 'long-jump', name: 'Long Jump', icon: '🏜️' },
];

export default function AdminMultiSportForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [form, setForm] = useState({
    title: "",
    sport: "kabaddi",
    venue: "",
    date: "",
    status: "upcoming",
    participants: "", // Comma separated names
  });

  useEffect(() => {
    if (isEdit) {
      const saved = localStorage.getItem("multi_sport_matches");
      if (saved) {
        const match = JSON.parse(saved).find(m => m.id === id);
        if (match) setForm(match);
      }
    }
  }, [id, isEdit]);

  const save = (e) => {
    e.preventDefault();
    const saved = JSON.parse(localStorage.getItem("multi_sport_matches") || "[]");
    
    if (isEdit) {
      const idx = saved.findIndex(m => m.id === id);
      saved[idx] = { ...form, id };
    } else {
      saved.push({ ...form, id: Date.now().toString() });
    }
    
    localStorage.setItem("multi_sport_matches", JSON.stringify(saved));
    navigate("/admin/multi-sport");
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-10">
        <button onClick={() => navigate("/admin/multi-sport")} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10">
          <FiChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">{isEdit ? 'Edit Event' : 'New Event'}</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Configure Multi-Sport Rules and Setup</p>
        </div>
      </div>

      <form onSubmit={save} className="space-y-6">
        <div className="card p-8 bg-gray-900/50 border-white/5 space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-3">Select Sport Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {SPORTS.map(s => (
                <button 
                  key={s.id} type="button"
                  onClick={() => setForm(p => ({ ...p, sport: s.id }))}
                  className={`p-4 rounded-2xl border transition-all text-center ${form.sport === s.id ? 'bg-brand-500 border-brand-500 text-white shadow-glow-orange scale-105' : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/10'}`}
                >
                  <div className="text-2xl mb-2">{s.icon}</div>
                  <div className="text-[10px] font-black uppercase tracking-widest">{s.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
             <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Event Title</label>
                <input required value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:border-brand-500 outline-none" placeholder="e.g. Pro Kabaddi Season 10 - Match 1" />
             </div>
             <div className="grid grid-cols-2 gap-4">
                <div>
                   <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Venue</label>
                   <input required value={form.venue} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:border-brand-500 outline-none" placeholder="Stadium Name" />
                </div>
                <div>
                   <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Date & Time</label>
                   <input required type="datetime-local" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:border-brand-500 outline-none" />
                </div>
             </div>
             <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Participants (Use comma or 'vs')</label>
                <textarea rows={3} value={form.participants} onChange={e => setForm(p => ({ ...p, participants: e.target.value }))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:border-brand-500 outline-none" placeholder={form.sport === 'kabaddi' ? "India vs Pakistan" : "Usain Bolt, Tyson Gay, Yohan Blake"} />
             </div>
          </div>
        </div>

        <button type="submit" className="w-full py-5 bg-brand-500 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-glow-orange hover:bg-brand-400 transition-all flex items-center justify-center gap-3">
          <FiSave /> {isEdit ? 'Update Event' : 'Initialize Event'}
        </button>
      </form>
    </div>
  );
}
