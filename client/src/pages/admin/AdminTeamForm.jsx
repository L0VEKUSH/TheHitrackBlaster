import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { teamAPI, playerAPI } from "../../services/api";
import axios from "axios";
import { FiImage, FiX } from "react-icons/fi";

const TYPES = ["Teams", "domestic", "Tournament Teams"];

function Section({ title, children }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-white font-bold text-sm mb-4 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function F({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

export default function AdminTeamForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [allPlayers, setAllPlayers] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: "", shortName: "", flag: "", logo: "",
    teamType: "Teams", coach: "", captain: "", homeGround: "",
    founded: "", description: "",
    players: [],
    rankings: { t20Rank: 0, RMCRank: 0, testRank: 0 },
    otherSportRankings: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch all players to allow selection
    playerAPI.getAll({ limit: 1000 }).then(({ data }) => {
      setAllPlayers(data.players || []);
    });

    if (isEdit) {
      teamAPI.getById(id).then(({ data }) => {
        const t = data.team;
        setForm({
          name: t.name || "", shortName: t.shortName || "",
          flag: t.flag || "", logo: t.logo || "", teamType: t.teamType || "Teams",
          coach: t.coach || "", captain: t.captain || "", homeGround: t.homeGround || "",
          founded: t.founded || "", description: t.description || "",
          players: t.players?.map(p => p._id) || [],
          rankings: { t20Rank: t.rankings?.t20Rank || 0, RMCRank: t.rankings?.RMCRank || 0, testRank: t.rankings?.testRank || 0 },
          otherSportRankings: t.otherSportRankings || [],
        });
      });
    }
  }, [id]);

  const handleImageUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("image", file);
    setUploading(true);
    try {
      const token = localStorage.getItem("cs_token");
      const { data } = await axios.post("/api/upload/image", formData, {
        headers: { "Content-Type": "multipart/form-data", "Authorization": `Bearer ${token}` }
      });
      if (data.success) set(type, data.imageUrl);
    } catch (err) { alert("Upload failed"); }
    finally { setUploading(false); }
  };

  const togglePlayer = (pId) => {
    const current = form.players || [];
    if (current.includes(pId)) {
      set("players", current.filter(id => id !== pId));
    } else {
      set("players", [...current, pId]);
    }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setRnk = (k, v) => setForm(p => ({ ...p, rankings: { ...p.rankings, [k]: Number(v) } }));
  const setOtherSportRanking = (index, key, value) => {
    setForm(prev => {
      const otherSportRankings = [...(prev.otherSportRankings || [])];
      otherSportRankings[index] = { ...otherSportRankings[index], [key]: key === "rank" ? Number(value) : value };
      return { ...prev, otherSportRankings };
    });
  };
  const addOtherSportRanking = () => {
    setForm(prev => ({
      ...prev,
      otherSportRankings: [...(prev.otherSportRankings || []), { sport: "", rank: 0 }]
    }));
  };
  const removeOtherSportRanking = (index) => {
    setForm(prev => ({
      ...prev,
      otherSportRankings: prev.otherSportRankings.filter((_, i) => i !== index)
    }));
  };

  const filteredPlayers = allPlayers.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPlayers = allPlayers.filter(p => (form.players || []).includes(p._id));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Team name required"); return; }
    setSaving(true); setError("");
    try {
      if (isEdit) await teamAPI.update(id, form);
      else await teamAPI.create(form);
      navigate("/admin/teams");
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/teams")} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-extrabold text-white">{isEdit ? "Edit Team" : "Add Team"}</h1>
      </div>
      <form onSubmit={submit} className="space-y-5 pb-10">
        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-5">
            <Section title="Team Info">
              <div className="space-y-4">
                <F label="Team Name *" value={form.name} onChange={v => set("name", v)} placeholder="India" />
                <div className="grid grid-cols-2 gap-4">
                  <F label="Short Name" value={form.shortName} onChange={v => set("shortName", v)} placeholder="IND" />
                  <div>
                    <label className="label">Team Type</label>
                    <select value={form.teamType} onChange={e => set("teamType", e.target.value)} className="input">
                      {TYPES.map(t => <option key={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <F label="Commanding Officer" value={form.captain} onChange={v => set("captain", v)} placeholder="Name of commanding officer" />
                  <div>
                    <label className="label">Logo</label>
                    <div className="flex gap-2">
                      <input value={form.logo} onChange={e => set("logo", e.target.value)} className="flex-1 input text-xs" placeholder="Logo URL" />
                      <label className="btn-ghost px-2 flex items-center justify-center cursor-pointer border border-gray-800 rounded-lg">
                        <input type="file" className="hidden" onChange={e => handleImageUpload(e, "logo")} accept="image/*" />
                        <FiImage size={14} />
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label">Flag</label>
                  <div className="flex gap-2">
                    <input value={form.flag} onChange={e => set("flag", e.target.value)} className="flex-1 input text-xs" placeholder="Flag URL" />
                    <label className="btn-ghost px-2 flex items-center justify-center cursor-pointer border border-gray-800 rounded-lg">
                      <input type="file" className="hidden" onChange={e => handleImageUpload(e, "flag")} accept="image/*" />
                      <FiImage size={14} />
                    </label>
                  </div>
                </div>
              </div>
            </Section>

            <Section title="Rankings">
              <div className="grid grid-cols-3 gap-3">
                {[["T20I", "t20Rank"], ["RMC", "RMCRank"], ["Test", "testRank"]].map(([l, k]) => (
                  <div key={k}>
                    <label className="label text-[10px] uppercase">{l}</label>
                    <input type="number" value={form.rankings[k]} onChange={e => setRnk(k, e.target.value)}
                      className="input" placeholder="0" />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Other Sport Rankings">
              <div className="space-y-3">
                {(form.otherSportRankings || []).map((entry, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-5">
                      <label className="label text-[10px] uppercase">Sport</label>
                      <input type="text" value={entry.sport} onChange={e => setOtherSportRanking(idx, "sport", e.target.value)}
                        className="input" placeholder="e.g. Football" />
                    </div>
                    <div className="col-span-5">
                      <label className="label text-[10px] uppercase">Rank</label>
                      <input type="number" value={entry.rank} onChange={e => setOtherSportRanking(idx, "rank", e.target.value)}
                        className="input" placeholder="0" />
                    </div>
                    <div className="col-span-2">
                      <button type="button" onClick={() => removeOtherSportRanking(idx)}
                        className="w-full h-11 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all text-sm font-semibold">
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addOtherSportRanking}
                  className="px-4 py-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm transition-all">
                  + Add Other Sport Ranking
                </button>
              </div>
            </Section>
          </div>

          <div className="space-y-5">
            <Section title="Squad Management (Link Players)">
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Search player to add..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="input w-full"
                />

                {searchTerm && (
                  <div className="max-h-40 overflow-y-auto bg-gray-800 rounded-lg border border-gray-700 divide-y divide-gray-700">
                    {filteredPlayers.length > 0 ? (
                      filteredPlayers.slice(0, 10).map(p => (
                        <div
                          key={p._id}
                          className="flex items-center justify-between p-2 hover:bg-gray-700 cursor-pointer"
                          onClick={() => togglePlayer(p._id)}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-gray-600 flex items-center justify-center text-[10px]">🧑</div>
                            <span className="text-sm text-white">{p.name}</span>
                          </div>
                          <button type="button" className={`text-xs px-2 py-1 rounded ${(form.players || []).includes(p._id) ? "bg-red-900/50 text-red-400" : "bg-brand-600 text-white"}`}>
                            {(form.players || []).includes(p._id) ? "Remove" : "Add"}
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-center text-gray-500 text-sm">No players found</div>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  <div className="text-xs text-gray-500 font-bold mb-2 uppercase">Current Squad ({selectedPlayers.length})</div>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {selectedPlayers.map(p => (
                      <div key={p._id} className="flex items-center justify-between bg-gray-800/50 p-2 rounded-lg border border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white font-medium">{p.name}</span>
                          <span className="text-[10px] text-gray-500">{p.role}</span>
                        </div>
                        <button type="button" onClick={() => togglePlayer(p._id)} className="text-gray-500 hover:text-red-400">
                          <FiX size={14} />
                        </button>
                      </div>
                    ))}
                    {selectedPlayers.length === 0 && (
                      <div className="text-center py-4 text-gray-600 text-xs italic">No players linked yet</div>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : isEdit ? "Update Team" : "Add Team"}
          </button>
          <button type="button" onClick={() => navigate("/admin/teams")} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
