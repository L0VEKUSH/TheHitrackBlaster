// src/pages/TournamentDetailPage.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { tournamentAPI, playerAPI, teamAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { TabBar } from "../components/common/Spinner";
import MatchCard from "../components/match/MatchCard";
import dayjs from "dayjs";

// ── Leaderboard category definitions ─────────────────────────────────────
const BATTING_CATEGORIES = [
  { key: "mostRuns",           label: "Most Runs",             icon: "🏏", getValue: p => p.runs,                 statLabel: "Runs",    extra: p => `${p.inns} inns` },
  { key: "highestScore",       label: "Highest Score",         icon: "📈", getValue: p => p.bestScore,             statLabel: "HS",      extra: p => `${p.inns} inns` },
  { key: "bestBattingAverage", label: "Best Batting Average",  icon: "🎯", getValue: p => p.average,               statLabel: "Avg",     extra: p => `${p.runs} runs` },
  { key: "bestStrikeRate",     label: "Best Strike Rate",      icon: "⚡", getValue: p => p.strikeRate,             statLabel: "SR",      extra: p => `${p.runs} runs` },
  { key: "mostHundreds",       label: "Most Hundreds",         icon: "💯", getValue: p => p.hundreds,              statLabel: "100s",    extra: p => `${p.runs} runs` },
  { key: "mostFifties",        label: "Most Fifties",          icon: "🏅", getValue: p => p.fifties,               statLabel: "50s",     extra: p => `${p.runs} runs` },
  { key: "mostThirties",       label: "Most Thirties",         icon: "🔷", getValue: p => p.thirties,              statLabel: "30s",     extra: p => `${p.runs} runs` },
  { key: "mostSixes",          label: "Most Sixes",            icon: "💥", getValue: p => p.sixes,                 statLabel: "6s",      extra: p => `${p.runs} runs` },
  { key: "mostFours",          label: "Most Fours",            icon: "🔥", getValue: p => p.fours,                 statLabel: "4s",      extra: p => `${p.runs} runs` },
];

const BOWLING_CATEGORIES = [
  { key: "mostWickets",        label: "Most Wickets",          icon: "🎳", getValue: p => p.wickets,               statLabel: "Wkts",    extra: p => `${p.overs} ov` },
  { key: "bestEconomy",        label: "Best Economy",          icon: "⛳", getValue: p => p.economy ?? "—",        statLabel: "Eco",     extra: p => `${p.wickets} wkts` },
  { key: "bestBowlingAverage", label: "Best Bowling Average",  icon: "🎖️", getValue: p => p.average ?? "—",        statLabel: "Avg",     extra: p => `${p.wickets} wkts` },
  { key: "bestBowling",        label: "Best Bowling",          icon: "🏹", getValue: p => `${p.bestFigures.wickets}/${p.bestFigures.runs}`, statLabel: "Figures", extra: p => `${p.wickets} total wkts` },
  { key: "mostFiveWickets",    label: "Most 5W Hauls",         icon: "🏆", getValue: p => p.fiveWickets,           statLabel: "5W",      extra: p => `${p.wickets} wkts` },
];

// ── Aggregate stats from match data ───────────────────────────────────────
function computeTournamentLeaders(matches) {
  const bat  = {};
  const bowl = {};

  const finishBatEntry = (entry) => {
    const strikeRate = entry.balls > 0 ? (entry.runs / entry.balls) * 100 : 0;
    const average    = entry.outs  > 0 ? (entry.runs / entry.outs)        : entry.runs;
    return { ...entry, strikeRate: parseFloat(strikeRate.toFixed(1)), average: parseFloat(average.toFixed(2)) };
  };

  matches.forEach(m => {
    [m.innings1, m.innings2].forEach(inn => {
      if (!inn) return;

      (inn.batsmen || []).forEach(p => {
        if (!p?.name) return;
        const key   = p.name;
        const entry = bat[key] || { name: key, runs: 0, balls: 0, inns: 0, outs: 0, fours: 0, sixes: 0, hundreds: 0, fifties: 0, thirties: 0, bestScore: 0 };
        const score = p.runs || 0;
        entry.runs     += score;
        entry.balls    += p.balls || 0;
        entry.inns     += 1;
        if (p.isOut)     entry.outs += 1;
        entry.fours    += p.fours || 0;
        entry.sixes    += p.sixes || 0;
        if (score > entry.bestScore)  entry.bestScore = score;
        if (score >= 100)             entry.hundreds  += 1;
        else if (score >= 50)         entry.fifties   += 1;
        else if (score >= 30)         entry.thirties  += 1;
        bat[key] = entry;
      });

      (inn.bowlers || []).forEach(p => {
        if (!p?.name) return;
        const key   = p.name;
        const entry = bowl[key] || { name: key, wickets: 0, runs: 0, balls: 0, fiveWickets: 0, bestFigures: { wickets: 0, runs: 999 } };
        const wickets = p.wickets || 0;
        const runs    = p.runs    || 0;
        const balls   = p.balls   || 0;
        entry.wickets += wickets;
        entry.runs    += runs;
        entry.balls   += balls;
        if (wickets >= 5) entry.fiveWickets += 1;
        if (wickets > entry.bestFigures.wickets || (wickets === entry.bestFigures.wickets && runs < entry.bestFigures.runs)) {
          entry.bestFigures = { wickets, runs };
        }
        bowl[key] = entry;
      });
    });
  });

  const batsmen = Object.values(bat).map(finishBatEntry);
  const bowlers = Object.values(bowl).map(p => ({
    ...p,
    overs:   p.balls > 0 ? parseFloat((p.balls / 6).toFixed(1)) : 0,
    economy: p.balls > 0 ? parseFloat((p.runs / (p.balls / 6)).toFixed(2)) : null,
    average: p.wickets > 0 ? parseFloat((p.runs / p.wickets).toFixed(2)) : null,
  }));

  return {
    mostRuns:           batsmen.slice().sort((a,b) => b.runs - a.runs).slice(0, 10),
    highestScore:       batsmen.slice().sort((a,b) => b.bestScore - a.bestScore).slice(0, 10),
    bestBattingAverage: batsmen.slice().filter(p => p.outs > 0).sort((a,b) => b.average - a.average).slice(0, 10),
    bestStrikeRate:     batsmen.slice().filter(p => p.balls >= 10).sort((a,b) => b.strikeRate - a.strikeRate).slice(0, 10),
    mostHundreds:       batsmen.slice().sort((a,b) => b.hundreds - a.hundreds || b.runs - a.runs).slice(0, 10),
    mostFifties:        batsmen.slice().sort((a,b) => b.fifties  - a.fifties  || b.runs - a.runs).slice(0, 10),
    mostThirties:       batsmen.slice().sort((a,b) => b.thirties - a.thirties || b.runs - a.runs).slice(0, 10),
    mostSixes:          batsmen.slice().sort((a,b) => b.sixes - a.sixes).slice(0, 10),
    mostFours:          batsmen.slice().sort((a,b) => b.fours - a.fours).slice(0, 10),
    mostWickets:        bowlers.slice().sort((a,b) => b.wickets - a.wickets).slice(0, 10),
    bestEconomy:        bowlers.slice().filter(p => p.balls >= 6).sort((a,b) => (a.economy ?? 999) - (b.economy ?? 999)).slice(0, 10),
    bestBowlingAverage: bowlers.slice().filter(p => p.wickets > 0).sort((a,b) => a.average - b.average).slice(0, 10),
    bestBowling:        bowlers.slice().sort((a,b) => b.bestFigures.wickets - a.bestFigures.wickets || a.bestFigures.runs - b.bestFigures.runs).slice(0, 10),
    mostFiveWickets:    bowlers.slice().sort((a,b) => b.fiveWickets - a.fiveWickets || b.wickets - a.wickets).slice(0, 10),
  };
}

// ── Main Component ────────────────────────────────────────────────────────
export default function TournamentDetailPage() {
  const { id } = useParams();
  const [tournament, setTournament] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("matches");

  // Leaders state
  const [leaderCat,  setLeaderCat]  = useState("mostRuns");
  const [playersMap, setPlayersMap] = useState({});   // name → _id
  const [teamsMap,   setTeamsMap]   = useState({});   // name → _id

  useEffect(() => {
    tournamentAPI.getById(id)
      .then(({ data }) => setTournament(data.tournament))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner size="lg" />;
  if (!tournament) return <div className="text-center py-16 text-gray-400">Tournament not found</div>;

  const matches   = tournament.matches || [];
  const live      = matches.filter(m => m.status === "live");
  const upcoming  = matches.filter(m => m.status === "upcoming");
  const completed = matches.filter(m => m.status === "completed");

  const leaders   = computeTournamentLeaders(matches);
  const leaderNames = [...new Set(Object.values(leaders).flatMap(list => list.map(p => p.name)))];

  // Fetch player IDs when Leaders tab opens
  useEffect(() => {
    if (tab === "leaders" && Object.keys(playersMap).length === 0 && leaderNames.length > 0) {
      playerAPI.getByNames(leaderNames)
        .then(({ data }) => {
          const map = {};
          (data.players || []).forEach(p => { map[p.name] = p._id; });
          setPlayersMap(map);
        })
        .catch(() => {
          playerAPI.getAll({ limit: 500 })
            .then(({ data }) => {
              const map = {};
              (data.players || []).forEach(p => { map[p.name] = p._id; });
              setPlayersMap(map);
            })
            .catch(() => {});
        });
    }
    if (tab === "points" && Object.keys(teamsMap).length === 0) {
      teamAPI.getAll({ limit: 200 })
        .then(({ data }) => {
          const map = {};
          (data.teams || []).forEach(t => { map[t.name] = t._id; });
          setTeamsMap(map);
        })
        .catch(() => {});
    }
  }, [tab, leaderNames, playersMap, teamsMap]);

  // Active category config
  const allCats   = [...BATTING_CATEGORIES, ...BOWLING_CATEGORIES];
  const activeCat = allCats.find(c => c.key === leaderCat) || BATTING_CATEGORIES[0];
  const activeList = leaders[leaderCat] || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="card p-5 mb-6 flex items-center gap-4">
        {tournament.logo
          ? <img src={tournament.logo} alt={tournament.name} className="w-14 h-14 object-contain shrink-0"/>
          : <div className="text-4xl shrink-0">🏆</div>
        }
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-white">{tournament.name}</h1>
          <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            {tournament.format    && <span className="bg-gray-800 px-2 py-0.5 rounded">{tournament.format}</span>}
            {tournament.host      && <span>Host: {tournament.host}</span>}
            {tournament.startDate && (
              <span>
                {dayjs(tournament.startDate).format("D MMM YYYY")}
                {tournament.endDate ? ` – ${dayjs(tournament.endDate).format("D MMM YYYY")}` : ""}
              </span>
            )}
          </div>
        </div>
        {tournament.isActive && (
          <span className="bg-green-800 text-green-300 text-xs font-bold px-3 py-1 rounded-full">ACTIVE</span>
        )}
      </div>

      {/* ── Tab Body ───────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-2 border-b border-gray-800">
          <TabBar
            tabs={[
              { label: `Matches (${matches.length})`, value: "matches" },
              { label: "Points Table",                value: "points"  },
              { label: "Leaders",                     value: "leaders" },
              { label: "Rules",                       value: "rules"   },
            ]}
            active={tab}
            onChange={setTab}
          />
        </div>
        <div className="p-4">

          {/* ═══ MATCHES ════════════════════════════════ */}
          {tab === "matches" && (
            <div className="space-y-6">
              {live.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"/>Live Now
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">{live.map(m => <MatchCard key={m._id} match={m}/>)}</div>
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-400 mb-3">📅 Upcoming</h3>
                  <div className="grid sm:grid-cols-2 gap-3">{upcoming.map(m => <MatchCard key={m._id} match={m}/>)}</div>
                </div>
              )}
              {completed.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-gray-500 mb-3">✅ Completed</h3>
                  <div className="grid sm:grid-cols-2 gap-3">{completed.map(m => <MatchCard key={m._id} match={m}/>)}</div>
                </div>
              )}
              {matches.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No matches added yet</p>}
            </div>
          )}

          {/* ═══ POINTS TABLE ═══════════════════════════ */}
          {tab === "points" && (
            <div className="overflow-x-auto">
              {tournament.pointsTable?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                      {["#","Team","P","W","L","T","NR","Pts","NRR"].map(h => (
                        <th key={h} className="py-2 px-3 text-center font-semibold first:text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...tournament.pointsTable].sort((a,b) => b.points - a.points).map((row,i) => {
                      const tid = teamsMap[row.team];
                      return (
                        <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                          <td className="py-3 px-3 text-gray-500 text-xs">{i+1}</td>
                          <td className="py-3 px-3 font-semibold">
                            {tid
                              ? <Link to={`/teams/${tid}`} className="text-brand-400 hover:text-brand-300 hover:underline transition-colors">{row.team}</Link>
                              : <span className="text-white">{row.team}</span>
                            }
                          </td>
                          <td className="py-3 px-3 text-center text-gray-400">{row.played}</td>
                          <td className="py-3 px-3 text-center text-green-400 font-semibold">{row.won}</td>
                          <td className="py-3 px-3 text-center text-red-400">{row.lost}</td>
                          <td className="py-3 px-3 text-center text-gray-400">{row.tied}</td>
                          <td className="py-3 px-3 text-center text-gray-400">{row.nr}</td>
                          <td className="py-3 px-3 text-center text-brand-400 font-bold">{row.points}</td>
                          <td className="py-3 px-3 text-center text-gray-400 font-mono text-xs">{row.nrr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : <p className="text-gray-600 text-sm text-center py-8">No points table data yet</p>}
            </div>
          )}

          {/* ═══ LEADERS (ESPN Cricinfo style) ══════════ */}
          {tab === "leaders" && (
            <div className="flex flex-col sm:flex-row gap-0 min-h-[480px]">

              {/* Left sidebar — category list */}
              <div className="sm:w-56 shrink-0 border-b sm:border-b-0 sm:border-r border-gray-800">
                {/* Batting section */}
                <div className="px-3 py-2 bg-teal-900/20 border-b border-gray-800">
                  <span className="text-[10px] font-black text-teal-400 uppercase tracking-[0.2em]">Batting</span>
                </div>
                <div className="space-y-0">
                  {BATTING_CATEGORIES.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setLeaderCat(cat.key)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm border-b border-gray-800/40 transition-all group
                        ${leaderCat === cat.key
                          ? "bg-brand-500 text-white font-bold"
                          : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
                        }`}
                    >
                      <span>{cat.label}</span>
                      <svg className={`w-3.5 h-3.5 shrink-0 ${leaderCat === cat.key ? "text-white" : "text-gray-600 group-hover:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  ))}
                </div>

                {/* Bowling section */}
                <div className="px-3 py-2 bg-teal-900/20 border-b border-t border-gray-800">
                  <span className="text-[10px] font-black text-teal-400 uppercase tracking-[0.2em]">Bowling</span>
                </div>
                <div className="space-y-0">
                  {BOWLING_CATEGORIES.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setLeaderCat(cat.key)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left text-sm border-b border-gray-800/40 transition-all group
                        ${leaderCat === cat.key
                          ? "bg-brand-500 text-white font-bold"
                          : "text-gray-300 hover:bg-gray-800/60 hover:text-white"
                        }`}
                    >
                      <span>{cat.label}</span>
                      <svg className={`w-3.5 h-3.5 shrink-0 ${leaderCat === cat.key ? "text-white" : "text-gray-600 group-hover:text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right panel — leaderboard table */}
              <div className="flex-1 overflow-x-auto">
                {/* Panel header */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900/40">
                  <span className="text-base">{activeCat.icon}</span>
                  <span className="text-sm font-black text-white tracking-wide">{activeCat.label}</span>
                  <span className="ml-auto text-[10px] text-gray-500 uppercase tracking-widest">{tournament.name}</span>
                </div>

                {activeList.length === 0 ? (
                  <div className="text-center py-16 text-gray-600 text-sm italic">No data yet for this category</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-gray-500 text-[10px] uppercase tracking-widest">
                        <th className="py-2.5 px-4 text-left w-8">#</th>
                        <th className="py-2.5 px-3 text-left">Player</th>
                        <th className="py-2.5 px-3 text-center text-gray-400">{activeCat.statLabel}</th>
                        <th className="py-2.5 px-3 text-center hidden sm:table-cell">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeList.map((p, i) => {
                        const pid  = playersMap[p.name];
                        const val  = activeCat.getValue(p);
                        const extra = activeCat.extra(p);
                        return (
                          <tr key={p.name}
                            className={`border-b border-gray-800/40 transition-colors hover:bg-gray-800/30 ${i === 0 ? "bg-brand-500/5" : ""}`}
                          >
                            {/* Rank */}
                            <td className="py-3 px-4">
                              {i === 0
                                ? <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-[10px] font-black flex items-center justify-center">1</span>
                                : <span className="text-gray-500 text-xs font-bold">{i + 1}</span>
                              }
                            </td>

                            {/* Player name */}
                            <td className="py-3 px-3">
                              {pid
                                ? <Link to={`/players/${pid}`}
                                    className="font-semibold text-brand-400 hover:text-brand-300 hover:underline transition-colors">
                                    {p.name}
                                  </Link>
                                : <span className="font-semibold text-white">{p.name}</span>
                              }
                            </td>

                            {/* Main stat */}
                            <td className="py-3 px-3 text-center">
                              <span className={`font-black text-base ${i === 0 ? "text-brand-400" : "text-white"}`}>
                                {val}
                              </span>
                            </td>

                            {/* Details */}
                            <td className="py-3 px-3 text-center text-gray-500 text-xs hidden sm:table-cell">
                              {extra}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ═══ RULES ══════════════════════════════════ */}
          {tab === "rules" && (
            <div className="space-y-4">
              {tournament.rules ? (
                <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 whitespace-pre-line text-sm text-gray-200">
                  {tournament.rules}
                </div>
              ) : (
                <p className="text-gray-600 text-sm text-center py-8">No rules have been defined for this tournament yet.</p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
