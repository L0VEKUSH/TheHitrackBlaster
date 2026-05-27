// src/pages/admin/AdminLiveScoring.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { matchAPI, playerAPI, tournamentAPI, pollAPI } from "../../services/api";
import { useLiveMatch } from "../../hooks/useLiveMatch";
import { motion, AnimatePresence } from "framer-motion";
import Spinner from "../../components/common/Spinner";
import AutocompleteInput from "../../components/common/AutocompleteInput";
import { BattingTable, BowlingTable } from "../../components/match/ScoreBoard";

export default function AdminLiveScoring() {
  const { id }  = useParams();
  const navigate = useNavigate();
  const { match, loading, setMatch } = useLiveMatch(id);

  const [tossWinner,   setTossWinner]   = useState("");
  const [tossDecision, setTossDecision] = useState("bat");
  const [tossLoading,  setTossLoading]  = useState(false);
  const [newBatsman,   setNewBatsman]   = useState("");
  const [newBowler,    setNewBowler]    = useState("");
  const [batterName,   setBatterName]   = useState("");
  const [bowlerName,   setBowlerName]   = useState("");
  const [commentary,   setCommentary]   = useState("");
  const [recentBalls,  setRecentBalls]  = useState([]);
  const [inningsNum,   setInningsNum]   = useState(1);
  const [result,       setResult]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState("");
  const [extraMRMCfier,setExtraMRMCfier] = useState("");
  const [manualBonus,   setManualBonus]   = useState(1);
  const [manualPenalty, setManualPenalty] = useState(1);
  const [wicketType,    setWicketType]    = useState("caught");
  const [fielderName,   setFielderName]   = useState("");
  
  // Rosters
  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [showRoster, setShowRoster] = useState(null); // 'bat' or 'bwl'

  // Wicket Dialog
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [outPlayer, setOutPlayer] = useState("");
  const [selectedMoM, setSelectedMoM] = useState("");

  // Poll
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState([{text: ""}, {text: ""}]);
  const [pollCreating, setPollCreating] = useState(false);
  const [storedPolls, setStoredPolls] = useState([]);
  const [showResolveModal, setShowResolveModal] = useState(null);

  // Timer
  const [startTime] = useState(new Date());
  const [elapsed, setElapsed] = useState("00:00:00");

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.floor((new Date() - startTime) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const fetchPolls = () => {
    if (id) {
      pollAPI.getMatchPolls(id, { all: true }).then(res => setStoredPolls(res.data.data)).catch(console.error);
    }
  };

  useEffect(() => {
    fetchPolls();
    const intv = setInterval(fetchPolls, 30000);
    return () => clearInterval(intv);
  }, [id]);

  useEffect(() => {
    if (!match) return;
    setTossWinner(match.tossWinner || match.teamA || "");
    setTossDecision(match.tossDecision || "bat");
  }, [match]);

  useEffect(() => {
    if (match) {
      setInningsNum(match.currentInnings || 1);
      const inn = match.currentInnings === 2 ? match.innings2 : match.innings1;
      setRecentBalls(match.recentBalls || []);
      const striker = inn?.batsmen?.find(b => b.isStriker && !b.isOut);
      setBatterName(striker ? striker.name : "");
      if (match.currentBowler) setBowlerName(match.currentBowler);
      if (match.status === "completed" && match.result) setResult(match.result);
      if (match.statistics && match.statistics.manOfTheMatch && match.statistics.manOfTheMatch.name) {
        setSelectedMoM(match.statistics.manOfTheMatch.name);
      }

      // If statistics are present, surface them in admin UI (no-op here)

      // Load rosters: prefer squad picks from match creation, else fetch by team name
      if (!rosterLoaded) {
        setRosterLoaded(true);
        const sqA = match.squadA || [];
        const sqB = match.squadB || [];

        if (sqA.length > 0) {
          // Squad was pre-selected — convert name strings into player-like objects
          setRosterA(sqA.map(name => ({ _id: name, name, role: "", photo: "" })));
        } else {
          playerAPI.getAll({ team: match.teamA, limit: 50 }).then(res => setRosterA(res.data.players));
        }
        if (sqB.length > 0) {
          setRosterB(sqB.map(name => ({ _id: name, name, role: "", photo: "" })));
        } else {
          playerAPI.getAll({ team: match.teamB, limit: 50 }).then(res => setRosterB(res.data.players));
        }
      }
    }
  }, [match, rosterLoaded]);

  const performToss = async () => {
    if (!tossWinner) return flash("⚠️ Select toss winner first.");
    if (!tossDecision) return flash("⚠️ Select toss decision first.");
    setTossLoading(true);
    try {
      const { data } = await matchAPI.setToss(id, { winner: tossWinner, decision: tossDecision });
      setMatch(data.match);
      flash(`🎉 ${tossWinner} won the toss and chose to ${tossDecision}`);
    } catch (err) {
      flash(err.response?.data?.message || "❌ Toss failed");
    } finally {
      setTossLoading(false);
    }
  };

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const quickBall = async (r, type = "", wkt = false, dismissedPlayer = "", wType = "", fName = "") => {
    if (match?.status === "completed") return flash("⚠️ Match is completed! Use Undo if needed.");
    if (!batterName) return flash("⚠️ Select a striker first!");
    if (!bowlerName) return flash("⚠️ Select a bowler!");
    setSaving(true);
    let sym = wkt ? "W" : type === "wide" ? "Wd" : type === "noBall" ? "NB" : String(r);
    const updated = [...recentBalls.slice(-11), sym];
    try {
      const { data } = await matchAPI.updateScore(id, {
        inningsNum, runs: r, isWicket: wkt, extraType: type,
        batterName, bowlerName, outPlayerName: dismissedPlayer,
        commentary: commentary || "", recentBalls: updated,
        wicketType: wType || (wkt ? wicketType : null),
        fielderName: fName || (wkt ? fielderName : null)
      });
      setMatch(data.match); setCommentary(""); setShowWicketModal(false);
      setFielderName(""); // Reset for next wicket
      if (data.isOverComplete && data.match.status !== "completed") flash("🔔 Over Complete! Change Bowler.");
      if (data.match.status === "completed") flash("🏆 Match Completed!");
    } catch (err) { flash(err.response?.data?.message || "❌ Failed"); }
    finally { setSaving(false); }
  };

  const undoBall = async () => {
    setSaving(true);
    try {
      const { data } = await matchAPI.undo(id, { inningsNum });
      setMatch(data.match);
      setRecentBalls(data.match.recentBalls || []);
      flash("↩ Ball Undone");
    } catch (err) { flash(err.response?.data?.message || "❌ Undo Failed"); }
    finally { setSaving(false); }
  };

  const updateStatus = async (status, resultMsg = "") => {
    setSaving(true);
    try {
      const { data } = await matchAPI.setStatus(id, { status, result: resultMsg });
      setMatch(data.match);
      flash(`🚀 Match status: ${status}`);
    } catch (err) { flash(err.response?.data?.message || "❌ Update Failed"); }
    finally { setSaving(false); }
  };

  const addFromRoster = async (name, type) => {
    if (match?.status === "completed") return flash("⚠️ Match is completed!");
    try {
      if (type === 'bat') {
        const { data } = await matchAPI.addBatsman(id, inningsNum, { name });
        setMatch(data.match);
      } else {
        const { data } = await matchAPI.addBowler(id, inningsNum, { name });
        setMatch(data.match);
      }
      setShowRoster(null);
      flash(`✅ ${name} added`);
    } catch (err) { flash(err.response?.data?.message || "❌ Failed"); }
  };

  const submitManualPoll = async () => {
    if (!pollQuestion) return flash("⚠️ Question required");
    const validOptions = pollOptions.filter(o => o.text.trim() !== "");
    if (validOptions.length < 2) return flash("⚠️ At least 2 options required");
    setPollCreating(true);
    try {
      const inn = inningsNum === 1 ? match.innings1 : match.innings2;
      await pollAPI.create({
        matchId: id,
        question: pollQuestion,
        options: validOptions.map(o => ({ text: o.text })),
        type: "manual",
        overNumber: Math.floor((inn?.balls || 0) / 6)
      });
      flash("✅ Poll created successfully!");
      setShowPollModal(false);
      setPollQuestion("");
      setPollOptions([{text: ""}, {text: ""}]);
      fetchPolls();
    } catch (err) {
      flash(err.response?.data?.message || "❌ Failed to create poll");
    } finally {
      setPollCreating(false);
    }
  };

  const handleResolvePoll = async (pollId, optionId) => {
    try {
      await pollAPI.resolve(pollId, optionId);
      flash("✅ Poll resolved & points awarded!");
      setShowResolveModal(null);
      fetchPolls();
    } catch (err) {
      flash(err.response?.data?.message || "❌ Failed to resolve poll");
    }
  };

  if (loading) return <Spinner size="lg" />;
  if (!match)  return <div className="text-center py-10 text-gray-400">Match not found</div>;

  const inn = inningsNum === 1 ? match.innings1 : match.innings2;
  const overs = inn?.balls ? `${Math.floor(inn.balls/6)}.${inn.balls%6}` : "0.0";
  const activeBatsmen = (inn?.batsmen || []).filter(b => !b.isOut);
  const currentBattingTeam = inningsNum === 1 ? match.innings1?.battingTeam : match.innings2?.battingTeam;
  const currentBowlingTeam = currentBattingTeam === match.teamA ? match.teamB : match.teamA;
  const currentBattingRoster = currentBattingTeam === match.teamA ? rosterA : currentBattingTeam === match.teamB ? rosterB : rosterA;
  const currentBowlingRoster = currentBowlingTeam === match.teamA ? rosterA : currentBowlingTeam === match.teamB ? rosterB : rosterB;

  return (
    <div className="space-y-5 max-w-4xl mx-auto pb-20">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between bg-gray-900/50 p-4 rounded-2xl border border-white/5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/admin/matches")} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-all">←</button>
          <div>
             <h1 className="text-sm font-black text-white uppercase tracking-tighter">{match.teamA} vs {match.teamB}</h1>
             <div className="text-[10px] text-brand-400 font-bold uppercase tracking-widest">{match.format} • {match.venue}</div>
          </div>
        </div>
        <div className="text-right">
           <div className="text-xs font-mono font-bold text-white/40">{elapsed}</div>
           <div className="text-[10px] text-gray-500 font-black uppercase">Match Duration</div>
        </div>
      </div>

      {msg && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl bg-brand-600 text-white font-black shadow-2xl animate-fade-in border border-white/20">
          {msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6 border-white/5 bg-gray-900/50">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Toss</h3>
              <p className="text-[10px] text-white/50 mt-2">Initialize the match innings before scoring.</p>
            </div>
            {match.tossWinner && (
              <div className="text-[10px] font-black uppercase tracking-widest text-brand-400">Done</div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Winner</span>
              <select value={tossWinner} onChange={e => setTossWinner(e.target.value)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white">
                <option value="" disabled>Select winner</option>
                <option value={match.teamA}>{match.teamA}</option>
                <option value={match.teamB}>{match.teamB}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Decision</span>
              <select value={tossDecision} onChange={e => setTossDecision(e.target.value)} className="mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white">
                <option value="bat">Bat</option>
                <option value="bowl">Bowl</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 items-center mt-6">
            <button onClick={performToss} disabled={tossLoading} className="py-3 px-5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white font-black uppercase tracking-widest disabled:opacity-40">
              {match.tossWinner ? "Update Toss" : "Perform Toss"}
            </button>
            {match.tossWinner && (
              <div className="text-xs text-white/60">{match.tossWinner} won and chose to {match.tossDecision}</div>
            )}
          </div>
        </div>

        <div className="card p-6 border-white/5 bg-gray-900/50">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Match Setup</h3>
              <p className="text-[10px] text-white/50 mt-2">Use the toss panel before adding batsmen and bowlers.</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-white/60">
            <div><span className="font-bold text-white">Teams:</span> {match.teamA} vs {match.teamB}</div>
            <div><span className="font-bold text-white">Format:</span> {match.format}</div>
            <div><span className="font-bold text-white">Venue:</span> {match.venue}</div>
            <div><span className="font-bold text-white">Status:</span> {match.status || "upcoming"}</div>
          </div>
        </div>
      </div>

      {/* Main Scorecard Hero */}
      <div className="bg-gradient-to-br from-brand-600 to-gray-950 rounded-[2.5rem] p-10 border border-white/10 shadow-[0_35px_60px_-15px_rgba(0,0,0,0.5)] relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/5 rounded-full blur-[80px]" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-black/30 px-3 py-1 rounded-full text-[10px] font-black text-white/70 uppercase tracking-widest">
               <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {inn?.battingTeam} Batting
            </div>
            <div className="text-8xl font-black text-white font-mono flex items-baseline gap-2 -ml-1">
              {inn?.runs}<span className="text-4xl text-white/20 font-normal">/{inn?.wickets}</span>
            </div>
            <div className="flex items-center gap-6 text-sm font-bold text-white/50">
               <div>Overs <span className="text-white text-lg">{overs}</span><span className="text-white/20 font-normal"> / {match.overs}</span></div>
               <div>Extras <span className="text-white text-lg">{inn?.extras}</span></div>
            </div>
          </div>

          <div className="space-y-6 text-right">
            {match.target > 0 && inningsNum === 2 && (
              <div className="bg-black/40 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-xl">
                 <div className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-1">Target: {match.target}</div>
                 <div className="text-2xl font-black text-yellow-400">Need {match.target - (inn?.runs || 0)} <span className="text-sm font-bold text-white/40">runs in</span> {Math.max(0, match.overs*6 - (inn?.balls || 0))} <span className="text-sm font-bold text-white/40">balls</span></div>
              </div>
            )}
            <div className="flex gap-2 flex-wrap justify-end max-w-[280px]">
              {recentBalls.slice(-12).map((b, i) => (
                <span key={i} className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black shadow-lg transition-all transform hover:scale-110 ${
                  b === "W" ? "bg-red-500 text-white" : b === "6" ? "bg-yellow-500 text-black rotate-6" :
                  b === "4" ? "bg-blue-600 text-white" : "bg-white/10 text-white/40 border border-white/5"
                }`}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bonus & Penalty Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-900/20 border border-green-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div>
              <div className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Bonus Award</div>
              <div className="text-xs text-white/50">Add custom extra runs</div>
           </div>
           <div className="flex items-center gap-2">
              <input type="number" value={manualBonus} onChange={e => setManualBonus(parseInt(e.target.value) || 0)} className="w-16 h-12 bg-black/40 border border-green-500/30 rounded-xl text-center text-white font-black focus:outline-none focus:border-green-500" />
              <button onClick={() => quickBall(manualBonus, "bonus")} className="h-12 px-6 rounded-xl bg-green-500 text-white text-[10px] font-black uppercase hover:bg-green-400 transition-all">Add Bonus</button>
           </div>
        </div>
        <div className="bg-red-900/20 border border-red-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div>
              <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Penalty Runs</div>
              <div className="text-xs text-white/50">Subtract custom runs</div>
           </div>
           <div className="flex items-center gap-2">
              <input type="number" value={manualPenalty} onChange={e => setManualPenalty(parseInt(e.target.value) || 0)} className="w-16 h-12 bg-black/40 border border-red-500/30 rounded-xl text-center text-white font-black focus:outline-none focus:border-red-500" />
              <button onClick={() => quickBall(manualPenalty, "penalty")} className="h-12 px-6 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-500 transition-all">Penalty</button>
           </div>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Lineup Management */}
        <div className="lg:col-span-4 space-y-6">
          {/* Match Statistics & Leaderboard Controls */}
          {match?.statistics && Object.keys(match.statistics).length > 0 && (
            <div className="card p-6 border-white/5 bg-gray-900/50">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Match Awards</h3>
                <button className="text-[10px] text-gray-400" onClick={async () => {
                  if (!match.tournament) return flash("No tournament set on match");
                  try {
                    const { data } = await tournamentAPI.rebuildLeaderboards(match.tournament);
                    flash("✅ Leaderboards rebuilt");
                    console.log('leaderboards', data.leaderboards);
                  } catch (err) { flash(err.response?.data?.message || 'Rebuild failed'); }
                }}>Rebuild Tournament Leaderboards</button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <select value={selectedMoM} onChange={e => setSelectedMoM(e.target.value)} className="bg-black/40 rounded-xl px-3 py-2 text-sm">
                    <option value="">Select Man of the Match</option>
                    {/* Combine batsmen, bowlers, and roster lists for selection */}
                    {(match.innings1?.batsmen || []).concat(match.innings2?.batsmen || []).concat(match.innings1?.bowlers || []).concat(match.innings2?.bowlers || []).filter(Boolean).map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                    {(rosterA || []).concat(rosterB || []).filter(p => p && p.name).map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  <button className="btn-primary px-3 py-2 rounded-xl text-xs" onClick={async () => {
                    if (!selectedMoM) return flash('Select player first');
                    try {
                      const { data } = await matchAPI.setManOfTheMatch(id, { name: selectedMoM, reason: 'Selected by admin' });
                      setMatch(data.match);
                      flash('✅ Man of the Match set');
                    } catch (err) { flash(err.response?.data?.message || 'Save failed'); }
                  }}>Save MoM</button>
                </div>

                {match.statistics.manOfTheMatch && <div><strong>MoM:</strong> {match.statistics.manOfTheMatch.name} ({match.statistics.manOfTheMatch.reason || ''})</div>}
                {match.statistics.sixerKing && <div><strong>Sixes:</strong> {match.statistics.sixerKing.name} — {match.statistics.sixerKing.sixes}</div>}
                {match.statistics.fourKing && <div><strong>Fours:</strong> {match.statistics.fourKing.name} — {match.statistics.fourKing.fours}</div>}
                {match.statistics.highestStrikeRate && <div><strong>SR:</strong> {match.statistics.highestStrikeRate.name} — {match.statistics.highestStrikeRate.strikeRate}</div>}
                {match.statistics.bestEconomy && <div><strong>Eco:</strong> {match.statistics.bestEconomy.name} — {match.statistics.bestEconomy.economy}</div>}
              </div>
            </div>
          )}
          <div className="card p-6 border-white/5 bg-gray-900/50">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Batsmen</h3>
              <button onClick={() => setShowRoster('bat')} disabled={match?.status === "completed"} className="bg-brand-500/10 text-brand-400 text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-brand-500/20 transition-all disabled:opacity-20">+ ROSTER</button>
            </div>
            <div className="space-y-3">
              {activeBatsmen.map(b => (
                <div key={b.name} className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                  b.name === batterName ? "bg-brand-500 text-white shadow-lg shadow-brand-900/40" : "bg-white/5 hover:bg-white/10 border border-white/5"
                }`} onClick={() => setBatterName(b.name)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${b.isStriker ? "bg-white animate-ping" : "bg-white/20"}`} />
                    <span className="text-xs font-black uppercase tracking-tight">{b.name}</span>
                  </div>
                  <span className="text-xs font-mono font-bold opacity-60">{b.runs}({b.balls})</span>
                </div>
              ))}
              {activeBatsmen.length < 2 && (
                <div className="pt-4 border-t border-white/5">
                  <div className="text-[10px] text-red-400 font-bold mb-2 uppercase">Add Batsman</div>
                  <div className="flex gap-2 items-start">
                    <AutocompleteInput
                      value={newBatsman}
                      onChange={setNewBatsman}
                      onSelect={p => { setNewBatsman(p.name); }}
                      fetchFn={async q => {
                        // 1. Filter from the pre-selected squad first
                        const localHits = currentBattingRoster.filter(p =>
                          p.name.toLowerCase().includes(q.toLowerCase())
                        );
                        if (localHits.length > 0) return localHits;
                        // 2. Fallback: live API search
                        const { data } = await playerAPI.getAll({ search: q, team: currentBattingTeam, limit: 8 });
                        return data.players || [];
                      }}
                      placeholder="Search batsman..."
                      inputClass="text-xs py-2"
                      className="flex-1"
                      minChars={1}
                    />
                    <button
                      onClick={() => { addFromRoster(newBatsman, 'bat'); setNewBatsman(""); }}
                      className="btn-primary px-4 rounded-xl shrink-0 h-[38px] text-xs"
                    >ADD</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 border-white/5 bg-gray-900/50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Current Bowler</h3>
              <button onClick={() => setShowRoster('bwl')} disabled={match?.status === "completed"} className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-20">+ ROSTER</button>
            </div>

            {/* Active bowlers quick-select */}
            {inn?.bowlers?.length > 0 && (
              <div className="space-y-2 mb-4">
                {inn.bowlers.map(b => (
                  <div key={b.name}
                    onClick={() => setBowlerName(b.name)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${
                      b.name === bowlerName
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                        : "bg-white/5 hover:bg-white/10 border border-white/5 text-gray-300"
                    }`}>
                    <span className="text-xs font-black uppercase tracking-tight">{b.name}</span>
                    <span className="text-[10px] font-mono opacity-60">
                      {b.wickets}/{b.runs} · {Math.floor(b.balls/6)}.{b.balls%6}ov
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Add new bowler with autocomplete */}
            <div className="pt-3 border-t border-white/5">
              <div className="text-[10px] text-blue-400 font-bold mb-2 uppercase">Add Bowler</div>
              <div className="flex gap-2 items-start">
                <AutocompleteInput
                  value={newBowler}
                  onChange={setNewBowler}
                  onSelect={p => { setNewBowler(p.name); }}
                  fetchFn={async q => {
                    // 1. Filter from the pre-selected bowling squad
                    const localHits = currentBowlingRoster.filter(p =>
                      p.name.toLowerCase().includes(q.toLowerCase())
                    );
                    if (localHits.length > 0) return localHits;
                    // 2. Fallback: live API search
                    const { data } = await playerAPI.getAll({ search: q, team: currentBowlingTeam, limit: 8 });
                    return data.players || [];
                  }}
                  placeholder="Search bowler..."
                  inputClass="text-xs py-2"
                  className="flex-1"
                  minChars={1}
                />
                <button
                  onClick={() => { addFromRoster(newBowler, 'bwl'); setNewBowler(""); }}
                  className="bg-blue-600 text-white px-4 rounded-xl text-xs font-bold shrink-0 h-[38px]"
                >ADD</button>
              </div>
            </div>
          </div>
        </div>

        {/* Scoring Console */}
        <div className="lg:col-span-8 space-y-6">
          <div className="card p-8 border-white/5 shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
              <div>
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em] mb-1">Quick Console</h3>
                <div className="text-lg font-black text-white uppercase italic">Scoring Ball {Math.floor((inn?.balls || 0)/6)}.{(inn?.balls || 0)%6 + 1}</div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={undoBall} className="h-10 px-6 rounded-2xl bg-white/5 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all border border-red-500/20">↩ Undo</button>
                <div className="h-10 px-6 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-900/40">Striker: {batterName || "—"}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-4 mb-10">
              {[0, 1, 2, 3, 4, 5, 6].map(r => (
                <button key={r} disabled={saving} onClick={() => { quickBall(r, extraMRMCfier); setExtraMRMCfier(""); }}
                  className={`aspect-square rounded-[1.5rem] flex flex-col items-center justify-center text-xl font-black transition-all transform hover:-translate-y-2 active:scale-95 disabled:opacity-30 ${
                    extraMRMCfier ? "bg-brand-600 text-white shadow-[0_10px_20px_rgba(234,88,12,0.4)]" :
                    r === 0 ? "bg-gray-800 text-gray-500" :
                    r === 4 ? "bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.4)]" :
                    r === 6 ? "bg-yellow-500 text-black shadow-[0_10px_20px_rgba(234,179,8,0.4)]" :
                    "bg-white/5 text-white hover:bg-white/10 border border-white/5"
                  }`}>
                  <div>{r === 0 ? "•" : r}</div>
                  {extraMRMCfier && <div className="text-[10px] uppercase font-bold opacity-70 mt-1">{extraMRMCfier}</div>}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
               <button onClick={() => setShowWicketModal(true)} className="sm:col-span-2 h-16 rounded-2xl bg-red-600 text-white font-black text-sm shadow-xl shadow-red-900/40 hover:bg-red-500 transition-all uppercase tracking-widest">WICKET / OUT</button>
               <button onClick={() => setExtraMRMCfier(m => m === "wide" ? "" : "wide")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all ${extraMRMCfier === "wide" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>WIDE</button>
               <button onClick={() => setExtraMRMCfier(m => m === "noBall" ? "" : "noBall")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all ${extraMRMCfier === "noBall" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>NO BALL</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
               <button onClick={() => setExtraMRMCfier(m => m === "bonus" ? "" : "bonus")} className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all ${extraMRMCfier === "bonus" ? "bg-green-600 text-white shadow-lg" : "bg-white/5 text-gray-500 border border-white/5 hover:bg-white/10"}`}>BONUS</button>
               <button onClick={() => setExtraMRMCfier(m => m === "penalty" ? "" : "penalty")} className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all ${extraMRMCfier === "penalty" ? "bg-red-600 text-white shadow-lg" : "bg-white/5 text-gray-500 border border-white/5 hover:bg-white/10"}`}>PENALTY</button>
               <button onClick={async () => {
                 if (window.confirm("Are you sure you want to declare this innings or mark as All Out? This will close the current innings.")) {
                   setSaving(true);
                   try {
                     const { data } = await matchAPI.declareInnings(id);
                     setMatch(data.match);
                     flash("✅ Innings Declared / All Out");
                   } catch (err) { flash(err.response?.data?.message || "❌ Failed"); }
                   finally { setSaving(false); }
                 }
               }} disabled={match?.status === "completed"} className="h-12 rounded-xl bg-orange-600 text-white text-[10px] font-black uppercase shadow-lg shadow-orange-900/20 disabled:opacity-30 hover:bg-orange-500 transition-all">ALL OUT / DECLARE</button>
               <button onClick={() => updateStatus("completed", result)} disabled={match?.status === "completed"} className="h-12 rounded-xl bg-green-600 text-white text-[10px] font-black uppercase shadow-lg shadow-green-900/20 disabled:opacity-30">MARK FINISH</button>
            </div>

            <div className="relative">
              <textarea value={commentary} onChange={e => setCommentary(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-3xl p-6 text-sm text-white focus:outline-none focus:border-brand-500 transition-all resize-none h-32"
                placeholder="Live commentary updates here..." />
            </div>
          </div>

          {/* FOW & Partnerships */}
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="card p-6 bg-gray-900/50 border-white/5">
               <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Fall of Wickets</h3>
               <div className="space-y-4">
                  {inn?.fallOfWickets?.map(f => (
                    <div key={f.wicketNum} className="flex items-center justify-between group">
                       <div className="flex flex-col">
                          <span className="text-[10px] text-gray-500 font-black uppercase">{f.wicketNum} · {f.over} OV</span>
                          <span className="text-xs font-bold text-white group-hover:text-brand-400 transition-colors">{f.player}</span>
                       </div>
                       <div className="text-sm font-mono font-black text-brand-400 bg-brand-400/10 px-3 py-1 rounded-lg">{f.score}</div>
                    </div>
                  ))}
               </div>
            </div>
            <div className="card p-6 bg-gray-900/50 border-white/5">
               <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Match Actions</h3>
               <input value={result} onChange={e => setResult(e.target.value)} className="input mb-4" placeholder="Enter Result Message..." />
               <div className="grid grid-cols-2 gap-3 mb-3">
                  <button onClick={() => updateStatus("live")} className="bg-red-600/10 text-red-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600/20">Go Live</button>
                  <button onClick={() => updateStatus("completed", result)} className="bg-green-600/10 text-green-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600/20">Finalize</button>
               </div>
               <button onClick={() => setShowPollModal(true)} className="w-full bg-blue-600/10 text-blue-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20">Post Manual Poll</button>
            </div>
            {storedPolls.length > 0 && (
              <div className="card p-6 bg-gray-900/50 border-white/5 mt-6">
                 <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Stored Polls ({storedPolls.length})</h3>
                 <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                   {storedPolls.map(p => (
                     <div key={p._id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                       <div className="flex items-center justify-between gap-3 mb-2">
                         <div className="text-xs font-bold text-white truncate">{p.question}</div>
                         <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full ${p.isResolved ? 'bg-green-600/20 text-green-300' : p.isActive ? 'bg-brand-500/10 text-brand-300' : 'bg-yellow-500/10 text-yellow-300'}`}>
                           {p.isResolved ? 'Resolved' : p.isActive ? 'Active' : 'Pending'}
                         </span>
                       </div>
                       <div className="text-[10px] text-gray-400 mb-3">{p.totalVotes} Votes • {p.type}</div>
                       <button
                         onClick={() => setShowResolveModal(p)}
                         disabled={p.isResolved}
                         className={`w-full py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors ${p.isResolved ? 'bg-white/5 text-gray-500 cursor-not-allowed' : 'bg-green-600/20 text-green-400 hover:bg-green-600/40'}`}
                       >
                         {p.isResolved ? 'Already Resolved' : 'Resolve Poll'}
                       </button>
                     </div>
                   ))}
                 </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Roster Modal */}
      {showRoster && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowRoster(null)} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-brand-600/20 blur-[80px]" />
            <h2 className="text-3xl font-black text-white mb-2 uppercase italic tracking-tighter">
              {showRoster === 'bat' ? 'Select Batsman' : 'Select Bowler'}
            </h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-8">Choose from {showRoster === 'bat' ? currentBattingTeam : currentBowlingTeam} Roster</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
              {(showRoster === 'bat' ? currentBattingRoster : currentBowlingRoster).map(p => {
                const isSelected = (showRoster === 'bat' ? activeBatsmen : inn?.bowlers)?.some(b => b.name === p.name);
                return (
                  <button key={p._id} disabled={isSelected} onClick={() => addFromRoster(p.name, showRoster)}
                    className={`p-4 rounded-2xl flex flex-col items-center gap-3 transition-all group ${
                      isSelected ? "opacity-30 cursor-not-allowed bg-white/5" : "bg-white/5 hover:bg-brand-600 border border-white/5 hover:border-brand-400"
                    }`}>
                    <div className="w-12 h-12 rounded-full bg-gray-800 overflow-hidden border-2 border-white/10">
                       {p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black text-gray-600">{p.name.charAt(0)}</div>}
                    </div>
                    <div className="text-center">
                       <div className="text-[10px] font-black text-white group-hover:text-white uppercase leading-tight">{p.name}</div>
                       <div className="text-[8px] text-gray-500 font-bold uppercase tracking-tighter mt-1">{p.role}</div>
                    </div>
                  </button>
                );
              })}
              { (showRoster === 'bat' ? currentBattingRoster : currentBowlingRoster).length === 0 && (
                <div className="col-span-full py-10 text-center text-gray-600 text-xs font-bold italic uppercase">No players found in this team's roster.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Wicket Modal */}
      {showWicketModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowWicketModal(false)} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl overflow-hidden">
            <h2 className="text-4xl font-black text-white mb-8 italic uppercase tracking-tighter">Wicket Analysis</h2>
            
            <div className="space-y-10">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block">Dismissed Player</label>
                <div className="grid grid-cols-2 gap-4">
                  {activeBatsmen.map(b => (
                    <button key={b.name} onClick={() => setOutPlayer(b.name)}
                      className={`py-5 rounded-3xl text-sm font-black transition-all ${
                        outPlayer === b.name ? "bg-red-600 text-white shadow-xl shadow-red-900/40 scale-105" : "bg-white/5 text-gray-500 hover:bg-white/10"
                      }`}>{b.name.split(' ')[0]}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block">How it happened</label>
                <div className="grid grid-cols-3 gap-3">
                  {["bowled","caught","lbw","runOut","stumped","hit-wicket"].map(t => (
                    <button key={t} onClick={() => setWicketType(t)}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all ${
                        wicketType === t ? "bg-white text-black" : "bg-white/5 text-gray-500"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {["caught", "stumped", "runOut"].includes(wicketType) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4 block">Fielder / Helper</label>
                  <AutocompleteInput
                    value={fielderName}
                    onChange={setFielderName}
                    onSelect={p => setFielderName(p.name)}
                    fetchFn={async q => {
                      const localHits = currentBowlingRoster.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
                      if (localHits.length > 0) return localHits;
                      const { data } = await playerAPI.getAll({ search: q, team: currentBowlingTeam, limit: 8 });
                      return data.players || [];
                    }}
                    placeholder="Search fielder..."
                    inputClass="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                </motion.div>
              )}

              <button disabled={!outPlayer} onClick={() => { quickBall(0, "", true, outPlayer, wicketType, fielderName); setShowWicketModal(false); }}
                className="w-full py-6 rounded-3xl bg-red-600 text-white font-black uppercase tracking-widest shadow-2xl shadow-red-900/50 hover:bg-red-500 transition-all active:scale-95 disabled:opacity-20">
                Confirm Dismissal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Poll Modal */}
      {showPollModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowPollModal(false)} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl overflow-hidden">
            <h2 className="text-3xl font-black text-white mb-6 italic uppercase tracking-tighter">Create Poll</h2>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block">Poll Question</label>
                <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} placeholder="e.g. Who will win this match?" className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold" />
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-2 block">Options</label>
                <div className="space-y-3">
                  {pollOptions.map((opt, i) => (
                    <input key={i} value={opt.text} onChange={e => {
                      const newOpts = [...pollOptions];
                      newOpts[i].text = e.target.value;
                      setPollOptions(newOpts);
                    }} placeholder={`Option ${i + 1}`} className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold" />
                  ))}
                  {pollOptions.length < 4 && (
                    <button onClick={() => setPollOptions([...pollOptions, { text: "" }])} className="text-xs text-brand-400 font-bold uppercase hover:text-brand-300 transition-colors">+ Add Option</button>
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button onClick={() => setShowPollModal(false)} className="flex-1 py-4 rounded-2xl bg-white/5 text-gray-400 font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
                <button disabled={pollCreating} onClick={submitManualPoll} className="flex-1 py-4 rounded-2xl bg-brand-600 text-white font-black uppercase tracking-widest shadow-xl shadow-brand-900/40 hover:bg-brand-500 transition-all disabled:opacity-50">
                  {pollCreating ? "Posting..." : "Post Poll"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Poll Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => setShowResolveModal(null)} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl overflow-hidden">
            <h2 className="text-3xl font-black text-white mb-2 italic uppercase tracking-tighter">Resolve Poll</h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-8">Select the correct option to award points</p>
            
            <div className="text-sm font-bold text-white mb-6 bg-white/5 p-4 rounded-2xl border border-white/5">
              {showResolveModal.question}
            </div>

            <div className="space-y-3">
              {showResolveModal.options.map(opt => (
                <button key={opt._id} onClick={() => handleResolvePoll(showResolveModal._id, opt._id)}
                  className="w-full py-4 px-6 rounded-2xl bg-white/5 hover:bg-green-600 hover:text-white border border-white/10 hover:border-green-500 text-left transition-all text-sm font-bold text-gray-300 flex justify-between items-center group">
                  <span>{opt.text}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-50 group-hover:opacity-100">{opt.votes} Votes</span>
                </button>
              ))}
            </div>

            <button onClick={() => setShowResolveModal(null)} className="w-full py-4 mt-6 rounded-2xl bg-white/5 text-gray-400 font-black uppercase tracking-widest hover:bg-white/10 transition-all">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
