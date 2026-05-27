// src/pages/admin/AdminTournamentForm.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { tournamentAPI } from "../../services/api";

const TYPES = ["series", "bilateral", "tri-series", "league", "cup", "championship"];

function F({ label, value, onChange, placeholder = "", type = "text" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

export default function AdminTournamentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "", shortName: "", logo: "", type: "series", format: "",
    rules: "",
    startDate: "", endDate: "", host: "", teams: "",
    isActive: true, isFeatured: false,
  });
  const [pointsRows, setPointsRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("basic");

  useEffect(() => {
    if (isEdit) {
      tournamentAPI.getById(id).then(({ data }) => {
        const t = data.tournament;
        setForm({
          name: t.name || "", shortName: t.shortName || "", logo: t.logo || "",
          type: t.type || "series", format: t.format || "",
          rules: t.rules || "",
          startDate: t.startDate ? t.startDate.split("T")[0] : "",
          endDate: t.endDate ? t.endDate.split("T")[0] : "",
          host: t.host || "", teams: (t.teams || []).join(", "),
          isActive: !!t.isActive, isFeatured: !!t.isFeatured,
        });
        setPointsRows(t.pointsTable || []);
      });
    }
  }, [id]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const addPointsRow = () => setPointsRows(p => [...p, { team: "", played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, nrr: "0.000" }]);
  const updateRow = (i, k, v) => setPointsRows(p => p.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeRow = (i) => setPointsRows(p => p.filter((_, idx) => idx !== i));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name) { setError("Tournament name required"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        teams: form.teams ? form.teams.split(",").map(t => t.trim()).filter(Boolean) : [],
        pointsTable: pointsRows,
      };
      if (isEdit) await tournamentAPI.update(id, payload);
      else await tournamentAPI.create(payload);
      navigate("/admin/tournaments");
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/tournaments")} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-extrabold text-white">{isEdit ? "Edit Tournament" : "Add Tournament"}</h1>
      </div>
      <div className="flex gap-1 border-b border-gray-800 mb-5">
        {[["basic", "Details"], ["points", "Points Table"]].map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === v ? "border-brand-500 text-brand-400" : "border-transparent text-gray-500 hover:text-white"
              }`}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

        {tab === "basic" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <F label="Name *" value={form.name} onChange={v => set("name", v)} placeholder="T20 World Cup" />
              <F label="Short Name" value={form.shortName} onChange={v => set("shortName", v)} placeholder="T20 WC" />
              <div>
                <label className="label">Type</label>
                <select value={form.type} onChange={e => set("type", e.target.value)} className="input">
                  {TYPES.map(t => <option key={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <F label="Format" value={form.format} onChange={v => set("format", v)} placeholder="T20" />
              <F label="Logo URL" value={form.logo} onChange={v => set("logo", v)} placeholder="https://..." />
              <F label="Host" value={form.host} onChange={v => set("host", v)} placeholder="India" />
              <F label="Start Date" value={form.startDate} onChange={v => set("startDate", v)} type="date" />
              <F label="End Date" value={form.endDate} onChange={v => set("endDate", v)} type="date" />
              <div className="col-span-2">
                <label className="label">Teams (comma separated)</label>
                <input value={form.teams} onChange={e => set("teams", e.target.value)}
                  className="input" placeholder="India, Australia, England..." />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label">Rules</label>
              <textarea value={form.rules} onChange={e => set("rules", e.target.value)} rows={8}
                className="input min-h-[160px] resize-none" placeholder="Paste tournament rules here, e.g. ball type, over structure, points system..." />
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="w-4 h-4 accent-brand-500" />
                <span className="text-gray-300 text-sm">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isFeatured} onChange={e => set("isFeatured", e.target.checked)} className="w-4 h-4 accent-brand-500" />
                <span className="text-gray-300 text-sm">Featured on Homepage</span>
              </label>
            </div>
          </div>
          </div>
        )}

        {tab === "points" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">Points Table</h3>
              <button type="button" onClick={addPointsRow} className="btn-primary text-xs px-3 py-1.5">+ Add Row</button>
            </div>
            {pointsRows.length === 0
              ? <p className="text-gray-600 text-sm text-center py-6">No rows yet. Click &quot;+ Add Row&quot; to add teams.</p>
              : <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-700 text-gray-400">
                      {["Team", "P", "W", "L", "T", "NR", "Pts", "NRR", ""].map(h => (
                        <th key={h} className="py-2 px-2 text-center first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pointsRows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-800">
                        <td className="py-1.5 px-1">
                          <input value={row.team} onChange={e => updateRow(i, "team", e.target.value)}
                            className="input text-xs py-1 min-w-28" placeholder="Team name" />
                        </td>
                        {["played", "won", "lost", "tied", "nr", "points"].map(k => (
                          <td key={k} className="py-1.5 px-1">
                            <input type="number" value={row[k]} onChange={e => updateRow(i, k, Number(e.target.value))}
                              className="input text-xs py-1 w-12 text-center" />
                          </td>
                        ))}
                        <td className="py-1.5 px-1">
                          <input value={row.nrr} onChange={e => updateRow(i, "nrr", e.target.value)}
                            className="input text-xs py-1 w-20 text-center" placeholder="0.000" />
                        </td>
                        <td className="py-1.5 px-1">
                          <button type="button" onClick={() => removeRow(i)} className="text-red-500 hover:text-red-400 px-1">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : isEdit ? "Update Tournament" : "Create Tournament"}
          </button>
          <button type="button" onClick={() => navigate("/admin/tournaments")} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
