import { useParams, Link } from "react-router-dom";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useLiveMatch } from "../hooks/useLiveMatch";
import { playerAPI } from "../services/api";
import Spinner from "../components/common/Spinner";
import { TabBar, FormatBadge, StatusBadge } from "../components/common/Spinner";
import ScoreBoard from "../components/match/ScoreBoard";
import { BattingTable, BowlingTable, CommentaryFeed, FallOfWickets, PartnershipsTable } from "../components/match/ScoreBoard";
import dayjs from "dayjs";
import { motion, AnimatePresence } from "framer-motion";

// Next-Gen Features
import { HypeToggle } from "../features/core/HypeToggle";
import { useHype } from "../features/core/HypeContext";
import { DualCaptain } from "../features/captain/DualCaptain";
import { useEventTrigger } from "../features/animations/useEventTrigger";
import { MomentumMeter } from "../features/stats/MomentumMeter";
import { WinProbability } from "../features/stats/WinProbability";
import { QuickEmojiReactions } from "../features/social/QuickEmojiReactions";
import MatchAIWidgets from "../components/MatchAIWidgets";

const getEmbedUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
};

export default function MatchDetailPage() {
  const { id }  = useParams();
  const { match, loading, error } = useLiveMatch(id);
  const [tab, setTab] = useState("scorecard");
  const { isHypeMode } = useHype();
  const [lastEvent, setLastEvent] = useState(null);
  const [playersMap, setPlayersMap] = useState({});   // name → _id
  const [activeInnTab, setActiveInnTab] = useState(1);

  useEffect(() => {
    if (match?.currentInnings) setActiveInnTab(match.currentInnings);
  }, [match?.currentInnings]);

  // Handle Match Events
  const onMatchEvent = useCallback((event) => {
    setLastEvent(event);
  }, []);

  useEventTrigger(match, onMatchEvent);

  // Build player name → _id map when statistics exist
  useEffect(() => {
    if (match?.statistics && Object.keys(match.statistics).length > 0 && Object.keys(playersMap).length === 0) {
      playerAPI.getAll({ limit: 500 })
        .then(({ data }) => {
          const map = {};
          (data.players || []).forEach(p => { map[p.name] = p._id; });
          setPlayersMap(map);
        })
        .catch(() => {});
    }
  }, [match]);

  // Helper: render a player name as link if ID known
  const PlayerLink = ({ name }) => {
    if (!name) return null;
    const pid = playersMap[name];
    return pid
      ? <Link to={`/players/${pid}`} className="text-brand-400 hover:text-brand-300 hover:underline transition-colors font-semibold">{name}</Link>
      : <span className="font-semibold text-white">{name}</span>;
  };

  const isClutchMode = useMemo(() => {
    if (!match || match.status !== "live") return false;
    const currentInn = match.currentInnings === 2 ? match.innings2 : match.innings1;
    if (!currentInn) return false;

    // Last 2 overs (12 balls)
    const totalBalls = match.isSuperOver ? 6 : (match.overs * 6);
    const ballsLeft = totalBalls - currentInn.balls;
    if (ballsLeft <= 12) return true;

    // Close match in 2nd innings
    if (match.currentInnings === 2 && match.target > 0) {
      const runsLeft = match.target - currentInn.runs;
      if (runsLeft > 0 && runsLeft <= ballsLeft * 1.5) return true;
    }

    return false;
  }, [match]);

  if (loading) return <Spinner size="lg" />;
  if (error || !match) return (
    <div className="max-w-4xl mx-auto px-4 py-16 text-center text-gray-400">Match not found</div>
  );

  const inn1 = match.innings1;
  const inn2 = match.innings2;
  const embedUrl = getEmbedUrl(match.videoUrl);

  const TABS = [
    { label: "Scorecard",  value: "scorecard"  },
    { label: "Commentary", value: "commentary" },
    { label: "Info",       value: "info"       },
  ];

  return (
    <div className={`transition-colors duration-1000 ${isClutchMode ? "bg-black" : "bg-gray-950"}`}>
      <div className={`max-w-4xl mx-auto px-4 py-4 animate-fade-in relative`}>
        
        {/* Hype Mode Features */}
        <AnimatePresence>
          {isHypeMode && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <DualCaptain event={lastEvent} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header with Hype Toggle */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <FormatBadge format={match.format} series={match.series} tournament={match.tournament} />
            <StatusBadge status={match.status} />
            {match.series && <span className="text-gray-400 text-sm hidden md:inline">{match.series}</span>}
          </div>
          <HypeToggle />
        </div>

        {/* Clutch Mode Indicator */}
        <AnimatePresence>
          {isClutchMode && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-950/40 border border-red-500/30 rounded-lg p-2 mb-4 text-center overflow-hidden"
            >
              <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.3em] animate-pulse">
                ⚠️ CLUTCH MODE ACTIVATED ⚠️
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Scoreboard hero */}
            <div className={lastEvent?.type === "WICKET" && isHypeMode ? "animate-shake" : ""}>
              <ScoreBoard match={match} />
            </div>

            {/* Tabs */}
            <div className="card overflow-hidden">
              <div className="border-b border-gray-800 px-2">
                <TabBar tabs={TABS} active={tab} onChange={setTab} />
              </div>

              <div className="p-4">
                {tab === "scorecard" && (
                  <div className="space-y-4">
                    {/* Innings Tabs */}
                    {(inn1 || inn2) && (
                      <div className="flex gap-2 border-b border-gray-800 pb-3">
                        {inn1 && (
                          <button
                            onClick={() => setActiveInnTab(1)}
                            className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${activeInnTab === 1 ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50"}`}
                          >
                            {inn1.battingTeam || match.teamA} (1st Inn)
                          </button>
                        )}
                        {inn2 && (
                          <button
                            onClick={() => setActiveInnTab(2)}
                            className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${activeInnTab === 2 ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50"}`}
                          >
                            {inn2.battingTeam || match.teamB} (2nd Inn)
                          </button>
                        )}
                      </div>
                    )}

                    {activeInnTab === 1 && inn1 && (
                      <div className="animate-fade-in space-y-4 pt-2">
                        <div className="flex items-center justify-between mb-3 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                          <h3 className="text-white font-bold text-sm flex items-center gap-2"><span className="text-brand-400">🏏</span> {inn1.battingTeam} — 1st Innings</h3>
                          <span className="text-white font-mono text-base font-black tracking-tight">
                            {inn1.runs}/{inn1.wickets} <span className="text-gray-400 text-xs ml-1 font-semibold">({inn1.balls ? `${Math.floor(inn1.balls/6)}.${inn1.balls%6}` : "0.0"} ov)</span>
                          </span>
                        </div>
                        <BattingTable batsmen={inn1.batsmen || []} />
                        <div className="mt-4 pt-4 border-t border-gray-800/50">
                          <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-brand-400">🎳</span> Bowling</h4>
                          <BowlingTable bowlers={inn1.bowlers || []} />
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <FallOfWickets fallOfWickets={inn1.fallOfWickets || []} />
                          <PartnershipsTable partnerships={inn1.partnerships || []} />
                        </div>
                      </div>
                    )}

                    {activeInnTab === 2 && inn2 && (
                      <div className="animate-fade-in space-y-4 pt-2">
                        <div className="flex items-center justify-between mb-3 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
                          <h3 className="text-white font-bold text-sm flex items-center gap-2"><span className="text-brand-400">🏏</span> {inn2.battingTeam} — 2nd Innings</h3>
                          <span className="text-white font-mono text-base font-black tracking-tight">
                            {inn2.runs}/{inn2.wickets} <span className="text-gray-400 text-xs ml-1 font-semibold">({inn2.balls ? `${Math.floor(inn2.balls/6)}.${inn2.balls%6}` : "0.0"} ov)</span>
                          </span>
                        </div>
                        <BattingTable batsmen={inn2.batsmen || []} />
                        <div className="mt-4 pt-4 border-t border-gray-800/50">
                          <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-brand-400">🎳</span> Bowling</h4>
                          <BowlingTable bowlers={inn2.bowlers || []} />
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <FallOfWickets fallOfWickets={inn2.fallOfWickets || []} />
                          <PartnershipsTable partnerships={inn2.partnerships || []} />
                        </div>
                      </div>
                    )}

                    {!inn1 && !inn2 && <p className="text-gray-600 text-sm text-center py-8">No scorecard data yet</p>}
                  </div>
                )}

                {tab === "commentary" && (
                  <div>
                    {match.currentInnings === 2 && inn2?.commentary?.length > 0 && (
                      <div className="mb-6">
                        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">2nd Innings</h3>
                        <CommentaryFeed commentary={inn2.commentary} />
                      </div>
                    )}
                    {inn1?.commentary?.length > 0 && (
                      <div>
                        {match.currentInnings === 2 && <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3 mt-4 pt-4 border-t border-gray-800">1st Innings</h3>}
                        <CommentaryFeed commentary={inn1.commentary} />
                      </div>
                    )}
                  </div>
                )}

                {tab === "info" && (
                  <div className="space-y-3">
                    {[
                      ["Match",  match.matchTitle || `${match.teamA} vs ${match.teamB}`],
                      ["Format", match.format],
                      ["Venue",  match.venue],
                      ["City",   match.city],
                      ["Date",   match.matchDate ? dayjs(match.matchDate).format("ddd, D MMM YYYY • h:mm A") : "TBD"],
                      ["Toss",   match.tossWinner ? `${match.tossWinner} won and chose to ${match.tossDecision}` : "—"],
                      ["Series", match.series || "—"],
                      ["Result", match.result || (match.status === "upcoming" ? "Match not started" : "—")],
                    ].map(([k, v]) => v && (
                      <div key={k} className="flex gap-4 py-2 border-b border-gray-800/50 last:border-0">
                        <span className="text-gray-500 text-sm w-20 shrink-0">{k}</span>
                        <span className="text-white text-sm">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Social & Video Sidebar */}
            <div className="sticky top-4 space-y-6">
                <MatchAIWidgets matchId={id} />
              <QuickEmojiReactions />

              {embedUrl && (
                <div className="card p-1 overflow-hidden">
                  <div className="aspect-video">
                    <iframe width="100%" height="100%" src={embedUrl} title="Live Stream" 
                      frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen className="rounded-xl"></iframe>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
