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

const emptyRoster = () => ({
  playingXI: [],
  substitutes: [],
  captainId: "",
  wicketKeeperId: "",
});

const playerIdOf = (player) => String(player?.playerId?._id || player?.playerId || player?._id || "").trim();
const playerNameOf = (player) => String(
  player?.nameSnapshot || player?.name || player?.fullName || "",
).trim();

const normalizeRosterEntry = (entry) => typeof entry === "string"
  ? { playerId: "", nameSnapshot: entry.trim(), legacyInput: true }
  : {
      ...entry,
      playerId: playerIdOf(entry),
      nameSnapshot: playerNameOf(entry),
    };

const normalizeRoster = (roster) => ({
  playingXI: (roster?.playingXI || []).map(normalizeRosterEntry),
  substitutes: (roster?.substitutes || []).map(normalizeRosterEntry),
  captainId: String(roster?.captainId || ""),
  wicketKeeperId: String(roster?.wicketKeeperId || ""),
});

const serializeRoster = (roster) => ({
  playingXI: roster.playingXI.map((player) => playerIdOf(player)
    ? { playerId: playerIdOf(player), nameSnapshot: playerNameOf(player) }
    : playerNameOf(player)),
  substitutes: roster.substitutes.map((player) => playerIdOf(player)
    ? { playerId: playerIdOf(player), nameSnapshot: playerNameOf(player) }
    : playerNameOf(player)),
  captainId: roster.captainId || "",
  wicketKeeperId: roster.wicketKeeperId || "",
});

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

function PlayingXIEditor({ label, team, value, onChange, disabled }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const addPlayer = (list) => {
    const playerId = playerIdOf(selected);
    if (!playerId) return;
    const alreadySelected = [...value.playingXI, ...value.substitutes]
      .some((player) => playerIdOf(player) === playerId);
    if (alreadySelected) return;
    onChange({ ...value, [list]: [...value[list], normalizeRosterEntry(selected)] });
    setQuery("");
    setSelected(null);
  };

  const removePlayer = (list, index) => {
    const removedId = playerIdOf(value[list][index]);
    const next = value[list].filter((_, itemIndex) => itemIndex !== index);
    onChange({
      ...value,
      [list]: next,
      captainId: value.captainId === removedId ? "" : value.captainId,
      wicketKeeperId: value.wicketKeeperId === removedId ? "" : value.wicketKeeperId,
    });
  };

  const renderList = (list, title) => (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{title}</span>
        <span className="text-[10px] font-mono text-gray-600">{value[list].length}</span>
      </div>
      <div className="space-y-2 min-h-10">
        {value[list].map((player, index) => {
          const playerId = playerIdOf(player);
          return (
            <div key={playerId || `${playerNameOf(player)}-${index}`}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                playerId ? "bg-white/5 border-white/5" : "bg-orange-500/10 border-orange-500/30"
              }`}>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-black text-white truncate">{playerNameOf(player) || "Unknown player"}</div>
                <div className="text-[9px] text-gray-500 truncate">
                  {playerId ? [player.team, player.role, playerId.slice(-6)].filter(Boolean).join(" · ") : "Needs identity confirmation"}
                </div>
              </div>
              <button type="button" disabled={disabled} onClick={() => removePlayer(list, index)}
                className="text-gray-600 hover:text-red-400 disabled:opacity-30">×</button>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-4">
      <div>
        <div className="text-sm font-black text-white">{label}</div>
        <div className="text-[10px] text-gray-500 mt-0.5">{team || "Choose the team first"}</div>
      </div>

      <AutocompleteInput
        value={query}
        disabled={disabled || !team}
        onChange={(next) => { setQuery(next); setSelected(null); }}
        onSelect={(player) => { setSelected(player); setQuery(playerNameOf(player)); }}
        fetchFn={async (search) => {
          const { data } = await playerAPI.getAll({ search, team, limit: 20 });
          return data.players || [];
        }}
        renderItem={(player, highlighted) => {
          const playerId = playerIdOf(player);
          return (
            <div className={`px-4 py-3 ${highlighted ? "bg-brand-600/30" : "hover:bg-white/5"}`}>
              <div className="text-xs font-black text-white">{playerNameOf(player)}</div>
              <div className="text-[10px] text-gray-500">
                {[player.team, player.role, playerId && `ID …${playerId.slice(-6)}`].filter(Boolean).join(" · ")}
              </div>
            </div>
          );
        }}
        placeholder="Search and confirm a player…"
        minChars={1}
      />

      <div className="flex gap-2">
        <button type="button" disabled={disabled || !playerIdOf(selected) || value.playingXI.length >= 11}
          onClick={() => addPlayer("playingXI")}
          className="flex-1 rounded-xl bg-brand-500/15 border border-brand-500/25 px-3 py-2 text-[10px] font-black uppercase text-brand-300 disabled:opacity-30">
          Add to XI
        </button>
        <button type="button" disabled={disabled || !playerIdOf(selected)} onClick={() => addPlayer("substitutes")}
          className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-gray-400 disabled:opacity-30">
          Add substitute
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {renderList("playingXI", "Playing XI")}
        {renderList("substitutes", "Substitutes")}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          ["captainId", "Captain"],
          ["wicketKeeperId", "Wicket keeper"],
        ].map(([field, fieldLabel]) => (
          <div key={field}>
            <label className="block text-[9px] font-black uppercase tracking-widest text-gray-600 mb-1.5">{fieldLabel}</label>
            <select value={value[field]} disabled={disabled} onChange={(event) => onChange({ ...value, [field]: event.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-30">
              <option value="">— Not selected —</option>
              {value.playingXI.filter((player) => playerIdOf(player)).map((player) => (
                <option key={playerIdOf(player)} value={playerIdOf(player)}>{playerNameOf(player)}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
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
  const [rosters, setRosters] = useState({
    teamAPlayingXI: emptyRoster(),
    teamBPlayingXI: emptyRoster(),
  });
  const [rosterLocked, setRosterLocked] = useState(false);
  const [resolutionIssues, setResolutionIssues] = useState([]);
  const [persistedMatchId, setPersistedMatchId] = useState("");

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
        setRosters({
          teamAPlayingXI: normalizeRoster(m.teamAPlayingXI),
          teamBPlayingXI: normalizeRoster(m.teamBPlayingXI),
        });
        setRosterLocked(m.status !== "upcoming" || Boolean(m.innings1));
      }).finally(() => setLoading(false));
    }
  }, [id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.teamA || !form.teamB) { setError("Both team names are required"); return; }
    const rosterConfigured = [rosters.teamAPlayingXI, rosters.teamBPlayingXI]
      .some((roster) => roster.playingXI.length > 0 || roster.substitutes.length > 0);
    if (rosterConfigured && !rosterLocked) {
      for (const [teamLabel, roster] of [
        [form.teamA || "Team A", rosters.teamAPlayingXI],
        [form.teamB || "Team B", rosters.teamBPlayingXI],
      ]) {
        if (roster.playingXI.length < 2 || roster.playingXI.length > 11) {
          setError(`${teamLabel} must have between 2 and 11 Playing XI members`);
          return;
        }
      }
    }
    setSaving(true); setError("");
    try {
      const payload = { ...form, overs: Number(form.overs)||20 };
      if (!payload.tournament) delete payload.tournament;
      let targetMatchId = id || persistedMatchId;
      if (targetMatchId) {
        await matchAPI.update(targetMatchId, payload);
      } else {
        const { data } = await matchAPI.create(payload);
        targetMatchId = data.match?._id || data.match?.id;
        setPersistedMatchId(targetMatchId || "");
      }
      if (rosterConfigured && !rosterLocked) {
        await matchAPI.updatePlayingXI(targetMatchId, {
          teamAPlayingXI: serializeRoster(rosters.teamAPlayingXI),
          teamBPlayingXI: serializeRoster(rosters.teamBPlayingXI),
        });
      }
      setResolutionIssues([]);
      navigate("/admin/matches");
    } catch (err) {
      const response = err.response?.data;
      if (response?.code === "PLAYER_RESOLUTION_REQUIRED" && Array.isArray(response.resolutionIssues)) {
        setResolutionIssues(response.resolutionIssues);
        setError("Confirm each ambiguous or fuzzy player below, then save again.");
      } else {
        const details = Array.isArray(response?.validationIssues)
          ? response.validationIssues.map((issue) => issue.message).filter(Boolean).join("; ")
          : "";
        setError(details || response?.message || "Failed to save match");
      }
    } finally { setSaving(false); }
  };

  const applyResolution = (issue, candidate) => {
    if (!issue?.side || !issue?.list || !Number.isInteger(issue.index)) return;
    setRosters((current) => {
      const side = current[issue.side];
      if (!side || !Array.isArray(side[issue.list])) return current;
      const list = [...side[issue.list]];
      list[issue.index] = normalizeRosterEntry(candidate);
      return { ...current, [issue.side]: { ...side, [issue.list]: list } };
    });
    setResolutionIssues((current) => current.filter((item) => !(
      item.side === issue.side && item.list === issue.list && item.index === issue.index
    )));
  };

  if (loading) return (
    <div className="flex justify-center items-center py-20">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-6xl">
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
        <Section title="Playing XI & Match Roster" icon="👥">
          <div className="space-y-5">
            {rosterLocked && (
              <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 px-4 py-3 text-xs text-orange-300">
                Playing XIs are locked because scoring has started. Existing selections remain visible but cannot be changed.
              </div>
            )}

            {resolutionIssues.length > 0 && (
              <div className="rounded-2xl border border-orange-500/30 bg-orange-950/30 p-4 space-y-4">
                <div>
                  <div className="text-xs font-black text-orange-300 uppercase tracking-widest">Player confirmation required</div>
                  <div className="text-[10px] text-orange-200/60 mt-1">
                    Fuzzy matches are suggestions only. Choose the exact player ID for every legacy name.
                  </div>
                </div>
                {resolutionIssues.map((issue) => (
                  <div key={`${issue.side}-${issue.list}-${issue.index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-black text-white">{issue.input || "Unknown legacy player"}</div>
                    <div className="text-[9px] text-gray-500 mb-2">
                      {issue.side === "teamAPlayingXI" ? form.teamA : form.teamB} · {issue.list} · {issue.code}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2">
                      {(issue.candidates || []).map((candidate) => (
                        <button type="button" key={candidate.playerId} onClick={() => applyResolution(issue, candidate)}
                          className="rounded-xl border border-white/10 bg-white/5 p-3 text-left hover:border-brand-500/50 hover:bg-brand-500/10 transition-all">
                          <div className="text-xs font-black text-white">{candidate.nameSnapshot}</div>
                          <div className="text-[9px] text-gray-500">
                            {[candidate.team, candidate.role, `ID …${candidate.playerId.slice(-6)}`, `match ${Math.round((candidate.score || 0) * 100)}%`]
                              .filter(Boolean).join(" · ")}
                          </div>
                        </button>
                      ))}
                      {(issue.candidates || []).length === 0 && (
                        <div className="text-[10px] text-red-300">No candidate found. Remove this legacy entry and select a player above.</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-4">
              <PlayingXIEditor
                label="Team A"
                team={form.teamA}
                value={rosters.teamAPlayingXI}
                disabled={saving || rosterLocked}
                onChange={(roster) => {
                  setResolutionIssues([]);
                  setRosters((current) => ({ ...current, teamAPlayingXI: roster }));
                }}
              />
              <PlayingXIEditor
                label="Team B"
                team={form.teamB}
                value={rosters.teamBPlayingXI}
                disabled={saving || rosterLocked}
                onChange={(roster) => {
                  setResolutionIssues([]);
                  setRosters((current) => ({ ...current, teamBPlayingXI: roster }));
                }}
              />
            </div>
            <p className="text-[10px] text-gray-600">
              Only Playing XI members can bat or bowl. Substitutes remain visible but are not eligible for scoring.
            </p>
          </div>
        </Section>

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
