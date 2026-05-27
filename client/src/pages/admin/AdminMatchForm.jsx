// src/pages/admin/AdminMatchForm.jsx
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { matchAPI, tournamentAPI, playerAPI } from "../../services/api";
import AutocompleteInput from "../../components/common/AutocompleteInput";
import dayjs from "dayjs";

const FORMATS = ["T20","T20I","RMC","Test","IPL","WPL","T10","T8"];
const ROLE_COLORS = {
  "Batsman":       "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Bowler":        "bg-green-500/20 text-green-300 border-green-500/30",
  "All-Rounder":   "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "Wicket-Keeper": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

/* ─── Small Reusables ─────────────────────────────────── */
function Section({ title, icon, children, accent = "brand" }) {
  return (
    <div className="bg-gray-900/70 border border-white/8 rounded-2xl overflow-hidden">
      <div className={`px-6 py-4 border-b border-white/5 flex items-center gap-3 bg-${accent}-500/5`}>
        {icon && <span className="text-lg">{icon}</span>}
        <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.3em]">{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "", className = "" }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">{label}</label>
      <input
        type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                   placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-all"
      />
    </div>
  );
}

/* ─── Main Form ───────────────────────────────────────── */
export default function AdminMatchForm() {
  const { id }    = useParams();
  const isEdit    = !!id;
  const navigate  = useNavigate();

  const [form, setForm] = useState({
    teamA:"", teamB:"", teamAShort:"", teamBShort:"",
    teamAFlag:"", teamBFlag:"",
    format:"T20", overs:20,
    venue:"", city:"", matchDate:"",
    series:"", matchTitle:"", matchNumber:"",
    tournament:"", status:"upcoming", videoUrl:"",
  });
  const [tournaments, setTournaments] = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState("");

  useEffect(() => {
    tournamentAPI.getAll().then(({ data }) => setTournaments(data.tournaments || []));
    if (isEdit) {
      setLoading(true);
      matchAPI.getById(id).then(({ data }) => {
        const m = data.match;
        setForm({
          teamA: m.teamA||"", teamB: m.teamB||"",
          teamAShort: m.teamAShort||"", teamBShort: m.teamBShort||"",
          teamAFlag: m.teamAFlag||"", teamBFlag: m.teamBFlag||"",
          format: m.format||"T20", overs: m.overs||20,
          venue: m.venue||"", city: m.city||"",
          matchDate: m.matchDate ? dayjs(m.matchDate).format("YYYY-MM-DDTHH:mm") : "",
          series: m.series||"", matchTitle: m.matchTitle||"",
          matchNumber: m.matchNumber||"",
          tournament: m.tournament?._id||m.tournament||"",
          status: m.status||"upcoming",
          videoUrl: m.videoUrl||"",
        });
      }).finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.teamA || !form.teamB) { setError("Both team names are required"); return; }
    setSaving(true); setError("");
    try {
      const payload = { ...form, overs: Number(form.overs)||20 };
      if (!payload.tournament) delete payload.tournament;
      if (isEdit) await matchAPI.update(id, payload);
      else        await matchAPI.create(payload);
      navigate("/admin/matches");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save match");
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate("/admin/matches")}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/5
                     hover:bg-white/10 text-gray-400 transition-all text-lg">
          ←
        </button>
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">
            {isEdit ? "Edit Match" : "New Match"}
          </h1>
          <p className="text-[11px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
            {isEdit ? "Update match details & squads" : "Configure match & select playing squads"}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {error && (
          <div className="bg-red-950/50 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl font-bold">
            ⚠️ {error}
          </div>
        )}

        {/* ── Teams ── */}
        <Section title="Teams" icon="🏏">
          <div className="grid grid-cols-2 gap-4">
            {/* Team A name with autocomplete */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Team A Name *</label>
              <AutocompleteInput
                value={form.teamA}
                onChange={v => set("teamA", v)}
                onSelect={t => setForm(p => ({
                  ...p,
                  teamA: t.name,
                  teamAShort: p.teamAShort || t.shortName || "",
                  teamAFlag:  p.teamAFlag  || t.flag || t.logo || "",
                }))}
                fetchFn={async q => {
                  const { data } = await api.get("/teams", { params: { search: q, limit: 8 } });
                  return data.teams || [];
                }}
                placeholder="India, Australia..."
                minChars={2}
              />
            </div>

            {/* Team B name with autocomplete */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Team B Name *</label>
              <AutocompleteInput
                value={form.teamB}
                onChange={v => set("teamB", v)}
                onSelect={t => setForm(p => ({
                  ...p,
                  teamB: t.name,
                  teamBShort: p.teamBShort || t.shortName || "",
                  teamBFlag:  p.teamBFlag  || t.flag || t.logo || "",
                }))}
                fetchFn={async q => {
                  const { data } = await api.get("/teams", { params: { search: q, limit: 8 } });
                  return data.teams || [];
                }}
                placeholder="Pakistan, England..."
                minChars={2}
              />
            </div>

            <Field label="Team A Short"    value={form.teamAShort} onChange={v => set("teamAShort",v)} placeholder="IND" />
            <Field label="Team B Short"    value={form.teamBShort} onChange={v => set("teamBShort",v)} placeholder="AUS" />
            <Field label="Team A Flag URL" value={form.teamAFlag}  onChange={v => set("teamAFlag",v)}  placeholder="https://..." />
            <Field label="Team B Flag URL" value={form.teamBFlag}  onChange={v => set("teamBFlag",v)}  placeholder="https://..." />
          </div>
        </Section>

        {/* ── Match Details ── */}
        <Section title="Match Details" icon="📋">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Format</label>
              <select value={form.format} onChange={e => {
                const f = e.target.value;
                let o = form.overs;
                if (["T20","T20I","IPL","WPL"].includes(f)) o = 20;
                else if (f === "RMC") o = 50;
                else if (f === "T10") o = 10;
                else if (f === "T8")  o = 8;
                setForm(p => ({ ...p, format: f, overs: o }));
              }} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-brand-500 transition-all">
                {FORMATS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <Field label="Overs" type="number" value={form.overs} onChange={v => set("overs",v)} placeholder="20" />
            <Field label="Match Title"  value={form.matchTitle}  onChange={v => set("matchTitle",v)}  placeholder="1st T20I" />
            <Field label="Match Number" value={form.matchNumber} onChange={v => set("matchNumber",v)} placeholder="Match 1" />
            <Field label="Series Name" className="col-span-2" value={form.series} onChange={v => set("series",v)} placeholder="India tour of Australia 2025" />
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Tournament</label>
              <select value={form.tournament} onChange={e => set("tournament",e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-brand-500 transition-all">
                <option value="">— None —</option>
                {tournaments.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-2">Match Status</label>
              <select value={form.status} onChange={e => set("status",e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           focus:outline-none focus:border-brand-500 transition-all">
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </Section>

        {/* ── Venue & Schedule ── */}
        <Section title="Venue & Schedule" icon="📍">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Venue" value={form.venue} onChange={v => set("venue",v)} placeholder="Wankhede Stadium" />
            <Field label="City"  value={form.city}  onChange={v => set("city",v)}  placeholder="Mumbai" />
            <Field label="Match Date & Time" type="datetime-local" value={form.matchDate} onChange={v => set("matchDate",v)} />
            <Field label="Stream / Video URL" value={form.videoUrl} onChange={v => set("videoUrl",v)} placeholder="https://youtube.com/..." />
          </div>
        </Section>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={saving}
            className="flex-1 sm:flex-none py-4 px-10 rounded-2xl bg-brand-500 hover:bg-brand-400
                       text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-brand-900/40
                       transition-all transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-40">
            {saving ? "Saving…" : isEdit ? "Update Match" : "Create Match"}
          </button>
          <button type="button" onClick={() => navigate("/admin/matches")}
            className="py-4 px-8 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400
                       font-black uppercase tracking-widest text-sm border border-white/8 transition-all">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
