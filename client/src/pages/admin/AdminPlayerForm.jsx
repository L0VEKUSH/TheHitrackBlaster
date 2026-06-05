import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { playerAPI, teamAPI } from "../../services/api";
import dayjs from "dayjs";
import { FiImage } from "react-icons/fi";
import { getImageUrl } from "../../utils/imageUtils";

const ROLES = ["Batsman","Bowler","All-Rounder","Wicket-Keeper"];

function F({ label, value, onChange, placeholder="", type="text" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

export default function AdminPlayerForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name:"", fullName:"", team:"", photo:"", dateOfBirth:"",
    role:"Batsman", battingStyle:"", bowlingStyle:"", bio:"",
    isFeatured: false, isCaptain: false, isViceCaptain: false,
    batting: { matches:0, innings:0, notOuts:0, runs:0, highestScore:0, average:0, strikeRate:0, hundreds:0, fifties:0, fours:0, sixes:0 },
    bowling: { matches:0, innings:0, wickets:0, runs:0, balls:0, bestFigures:"0/0", average:0, economy:0, strikeRate:0, fiveWickets:0 },
    rankings: { 
      t20Batting:0, RMCBatting:0, testBatting:0, 
      t20Bowling:0, RMCBowling:0, testBowling:0,
      t20AllRounder:0, RMCAllRounder:0, testAllRounder:0 
    },
  });
  const [tab,    setTab]    = useState("basic");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");
  const [uploading, setUploading] = useState(false);

  const [allTeams,    setAllTeams]    = useState([]);

  useEffect(() => {
    // Fetch teams for selection
    teamAPI.getAll().then(({ data }) => {
      setAllTeams(data.teams || []);
    });

    if (isEdit) {
      playerAPI.getById(id).then(({ data }) => {
        const p = data.player;
        setForm({
          name: p.name||"", fullName: p.fullName||"",
          team: p.team||"", photo: p.photo||"", dateOfBirth: p.dateOfBirth ? dayjs(p.dateOfBirth).format("YYYY-MM-DD") : "",
          role: p.role||"Batsman",
          battingStyle: p.battingStyle||"", bowlingStyle: p.bowlingStyle||"",
          bio: p.bio||"", isFeatured: !!p.isFeatured,
          isCaptain: !!p.isCaptain, isViceCaptain: !!p.isViceCaptain,
          batting:  { ...{ matches:0,innings:0,notOuts:0,runs:0,highestScore:0,average:0,strikeRate:0,hundreds:0,fifties:0,fours:0,sixes:0 }, ...(p.baseBatting || p.batting) },
          bowling:  { ...{ matches:0,innings:0,wickets:0,runs:0,balls:0,bestFigures:"0/0",average:0,economy:0,strikeRate:0,fiveWickets:0 }, ...(p.baseBowling || p.bowling) },
          rankings: { ...{ t20Batting:0,RMCBatting:0,testBatting:0,t20Bowling:0,RMCBowling:0,testBowling:0,t20AllRounder:0,RMCAllRounder:0,testAllRounder:0 }, ...p.rankings },
        });
      });
    }
  }, [id]);

const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    try {
      const { data } = await api.post("/upload/image", formData, {
        headers: { 
          "Content-Type": "multipart/form-data"
        }
      });
      if (data.success) {
        // Persist whatever backend returned; normalize only at render-time
        set("photo", data.imageUrl);
        if (import.meta.env?.VITE_DEBUG_IMAGES === "true") {
          // eslint-disable-next-line no-console
          console.debug("[images] upload response imageUrl:", data.imageUrl);
          // eslint-disable-next-line no-console
          console.debug("[images] normalized imageUrl:", getImageUrl(data.imageUrl));
        }
      }
    } catch (err) {
      alert("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const set    = (k,v) => setForm(p => ({...p, [k]:v}));
  const setBat = (k,v) => setForm(p => ({...p, batting: {...p.batting, [k]:v}}));
  const setBwl = (k,v) => setForm(p => ({...p, bowling: {...p.bowling, [k]:v}}));
  const setRnk = (k,v) => setForm(p => ({...p, rankings: {...p.rankings, [k]:v}}));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.role) { setError("Name and role are required"); return; }
    setSaving(true); setError("");
    
    // Rename to baseBatting/baseBowling so the live stats are calculated on top of these
    const payload = { ...form, baseBatting: form.batting, baseBowling: form.bowling };
    delete payload.batting;
    delete payload.bowling;

    try {
      if (isEdit) await playerAPI.update(id, payload);
      else        await playerAPI.create(payload);
      navigate("/admin/players");
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const TABS = [["basic","Basic"],["batting","Historical Batting"],["bowling","Historical Bowling"],["rankings","Rankings"]];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/players")} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-extrabold text-white">{isEdit ? "Edit Player" : "Add Player"}</h1>
      </div>
      <div className="flex gap-1 border-b border-gray-800 mb-5">
        {TABS.map(([v,l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === v ? "border-brand-500 text-brand-400" : "border-transparent text-gray-500 hover:text-white"
            }`}>{l}</button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}

        {tab === "basic" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <F label="Name *"    value={form.name}    onChange={v => set("name",v)}    placeholder="Virat Kohli" />
              <F label="Full Name" value={form.fullName} onChange={v => set("fullName",v)} placeholder="Virat Kohli" />
              <F label="Date of Birth" value={form.dateOfBirth} onChange={v => set("dateOfBirth",v)} type="date" />
              <div>
                <label className="label">Team</label>
                <select value={form.team} onChange={e => set("team", e.target.value)} className="input">
                  <option value="">No Team / Free Agent</option>
                  {allTeams.map(t => (
                    <option key={t._id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Role *</label>
                <select value={form.role} onChange={e => set("role",e.target.value)} className="input">
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Player Photo</label>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input value={form.photo} onChange={e => set("photo",e.target.value)} 
                      className="flex-1 input" placeholder="URL or upload..." />
                    <label className="btn-ghost px-3 flex items-center justify-center cursor-pointer border border-gray-800 rounded-lg">
                      <input type="file" className="hidden" onChange={handleImageUpload} accept="image/*" />
                      {uploading ? "..." : <FiImage />}
                    </label>
                  </div>
                  {form.photo && (
                    <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-800">
                      <img
                        src={getImageUrl(form.photo)}
                        alt="P"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = getImageUrl(null);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
              <F label="Batting Style" value={form.battingStyle} onChange={v => set("battingStyle",v)} placeholder="Right-hand bat" />
              <F label="Bowling Style" value={form.bowlingStyle} onChange={v => set("bowlingStyle",v)} placeholder="Right-arm fast" />
            </div>
            <div>
              <label className="label">Bio</label>
              <textarea value={form.bio} onChange={e => set("bio",e.target.value)}
                className="input h-20 resize-none" placeholder="Short biography..." />
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isFeatured} onChange={e => set("isFeatured",e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-500" />
                <span className="text-gray-300 text-sm">Featured</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isCaptain} onChange={e => set("isCaptain",e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-500" />
                <span className="text-brand-400 text-sm font-bold">Captain (C)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isViceCaptain} onChange={e => set("isViceCaptain",e.target.checked)}
                  className="w-4 h-4 rounded accent-brand-500" />
                <span className="text-gray-300 text-sm font-bold">Vice-Captain (VC)</span>
              </label>
            </div>
          </div>
        )}

        {tab === "batting" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="grid grid-cols-3 gap-3">
              {[["Matches","matches"],["Innings","innings"],["Not Outs","notOuts"],
                ["Runs","runs"],["Highest Score","highestScore"],["Average","average"],
                ["Strike Rate","strikeRate"],["100s","hundreds"],["50s","fifties"],
                ["4s","fours"],["6s","sixes"]].map(([l,k]) => (
                <div key={k}>
                  <label className="label text-xs">{l}</label>
                  <input type="number" value={form.batting[k]} onChange={e => setBat(k, e.target.value)} className="input" />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "bowling" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="grid grid-cols-3 gap-3">
              {[["Matches","matches"],["Innings","innings"],["Wickets","wickets"],
                ["Runs","runs"],["Balls","balls"],["Average","average"],
                ["Economy","economy"],["Strike Rate","strikeRate"],["5-Wicket Hauls","fiveWickets"]].map(([l,k]) => (
                <div key={k}>
                  <label className="label text-xs">{l}</label>
                  <input type="number" value={form.bowling[k]} onChange={e => setBwl(k, e.target.value)} className="input" />
                </div>
              ))}
              <div className="col-span-3">
                <label className="label text-xs">Best Figures</label>
                <input value={form.bowling.bestFigures} onChange={e => setBwl("bestFigures",e.target.value)}
                  className="input max-w-xs" placeholder="5/23" />
              </div>
            </div>
          </div>
        )}

        {tab === "rankings" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-400 text-xs mb-4">Enter 0 to hide from rankings. Lower number = higher rank.</p>
            <div className="grid grid-cols-2 gap-3">
              {[["T20I Batting","t20Batting"],["RMC Batting","RMCBatting"],["Test Batting","testBatting"],
                ["T20I Bowling","t20Bowling"],["RMC Bowling","RMCBowling"],["Test Bowling","testBowling"],
                ["T20I All-Rounder","t20AllRounder"],["RMC All-Rounder","RMCAllRounder"],["Test All-Rounder","testAllRounder"]].map(([l,k]) => (
                <div key={k}>
                  <label className="label text-xs">{l}</label>
                  <input type="number" value={form.rankings[k]} onChange={e => setRnk(k, Number(e.target.value))}
                    className="input" placeholder="0" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : isEdit ? "Update Player" : "Add Player"}
          </button>
          <button type="button" onClick={() => navigate("/admin/players")} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
