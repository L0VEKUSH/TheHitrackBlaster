import { useParams } from "react-router-dom";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useLiveMatch } from "../hooks/useLiveMatch";
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
import { getActiveInnings } from "../utils/matchSelectors";

const getEmbedUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
};

function InningsScorecard({ innings, label }) {
  if (!innings) return null;
  const overs = innings.balls
    ? `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    : "0.0";

  return (
    <div className="animate-fade-in space-y-4 pt-2">
      <div className="flex items-center justify-between mb-3 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
        <h3 className="text-white font-bold text-sm flex items-center gap-2"><span className="text-brand-400">🏏</span> {innings.battingTeam} — {label}</h3>
        <span className="text-white font-mono text-base font-black tracking-tight">
          {innings.runs}/{innings.wickets} <span className="text-gray-400 text-xs ml-1 font-semibold">({overs} ov)</span>
        </span>
      </div>
      <BattingTable batsmen={innings.batsmen || []} />
      <div className="mt-4 pt-4 border-t border-gray-800/50">
        <h4 className="text-gray-400 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"><span className="text-brand-400">🎳</span> Bowling</h4>
        <BowlingTable bowlers={innings.bowlers || []} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FallOfWickets fallOfWickets={innings.fallOfWickets || []} />
        <PartnershipsTable partnerships={innings.partnerships || []} />
      </div>
    </div>
  );
}

export default function MatchDetailPage() {
  const { id }  = useParams();
  const { match, loading, error } = useLiveMatch(id);
  const [tab, setTab] = useState("scorecard");
  const { isHypeMode } = useHype();
  const [lastEvent, setLastEvent] = useState(null);
  const [activeInnTab, setActiveInnTab] = useState("regulation-1");

  useEffect(() => {
    if (!match?.currentInnings) return;
    setActiveInnTab(`${match.isSuperOver ? "superOver" : "regulation"}-${match.currentInnings}`);
  }, [match?._id, match?.currentInnings, match?.isSuperOver]);

  // Handle Match Events
  const onMatchEvent = useCallback((event) => {
    setLastEvent(event);
  }, []);

  useEventTrigger(match, onMatchEvent);

  const isClutchMode = useMemo(() => {
    if (!match || match.status !== "live") return false;
    const currentInn = getActiveInnings(match);
    if (!currentInn) return false;

    // Last 2 overs (12 balls)
    const totalBalls = match.isSuperOver ? 6 : (match.overs * 6);
    const ballsLeft = totalBalls - currentInn.balls;
    if (ballsLeft <= 12) return true;

    // Close match in 2nd innings
    if (match.currentInnings === 2 && match.target > 0) {
      const runsLeft = match.requiredRuns == null
        ? match.target - currentInn.runs
        : Number(match.requiredRuns);
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
  const superOverInn1 = match.superOverInnings1;
  const superOverInn2 = match.superOverInnings2;
  const inningsTabs = [
    inn1 && { key: "regulation-1", innings: inn1, label: "1st Innings", shortLabel: `${inn1.battingTeam || match.teamA} (1st Inn)` },
    inn2 && { key: "regulation-2", innings: inn2, label: "2nd Innings", shortLabel: `${inn2.battingTeam || match.teamB} (2nd Inn)` },
    superOverInn1 && { key: "superOver-1", innings: superOverInn1, label: "Super Over · 1st Innings", shortLabel: `${superOverInn1.battingTeam || match.teamA} (SO 1)` },
    superOverInn2 && { key: "superOver-2", innings: superOverInn2, label: "Super Over · 2nd Innings", shortLabel: `${superOverInn2.battingTeam || match.teamB} (SO 2)` },
  ].filter(Boolean);
  const selectedInningsTab = inningsTabs.find((entry) => entry.key === activeInnTab) || inningsTabs[0];
  const commentarySections = [
    superOverInn2 && { key: "superOver-2", label: "Super Over · 2nd Innings", innings: superOverInn2 },
    superOverInn1 && { key: "superOver-1", label: "Super Over · 1st Innings", innings: superOverInn1 },
    inn2 && { key: "regulation-2", label: "2nd Innings", innings: inn2 },
    inn1 && { key: "regulation-1", label: "1st Innings", innings: inn1 },
  ].filter((entry) => entry?.innings?.commentary?.length > 0);
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
                    {inningsTabs.length > 0 && (
                      <div className="flex gap-2 border-b border-gray-800 pb-3 overflow-x-auto">
                        {inningsTabs.map((entry) => (
                          <button
                            key={entry.key}
                            onClick={() => setActiveInnTab(entry.key)}
                            className={`shrink-0 px-4 py-2 text-sm font-bold rounded-xl transition-colors ${activeInnTab === entry.key ? "bg-brand-500 text-white shadow-lg shadow-brand-500/20" : "bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700/50"}`}
                          >
                            {entry.shortLabel}
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedInningsTab && (
                      <InningsScorecard innings={selectedInningsTab.innings} label={selectedInningsTab.label} />
                    )}

                    {inningsTabs.length === 0 && <p className="text-gray-600 text-sm text-center py-8">No scorecard data yet</p>}
                  </div>
                )}

                {tab === "commentary" && (
                  <div>
                    {commentarySections.map((section, index) => (
                      <div key={section.key} className={index > 0 ? "mt-6 pt-4 border-t border-gray-800" : ""}>
                        <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">{section.label}</h3>
                        <CommentaryFeed commentary={section.innings.commentary} />
                      </div>
                    ))}
                    {commentarySections.length === 0 && <CommentaryFeed commentary={[]} />}
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
