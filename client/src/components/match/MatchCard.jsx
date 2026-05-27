// src/components/match/MatchCard.jsx
import { Link } from "react-router-dom";
import { StatusBadge, FormatBadge } from "../common/Spinner";
import dayjs from "dayjs";

function getScore(innings) {
  if (!innings) return null;
  const overs = innings.balls
    ? `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    : "0.0";
  return `${innings.runs}/${innings.wickets} (${overs})`;
}

export default function MatchCard({ match }) {
  const inn1 = match.innings1;
  const inn2 = match.innings2;

  return (
    <Link to={`/matches/${match._id}`}
      className="card card-hover group p-6 relative overflow-hidden"
    >
      {/* Dynamic Background Glow for Live Matches */}
      {match.status === "live" && (
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-500/10 blur-[50px] rounded-full group-hover:bg-brand-500/20 transition-colors" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <FormatBadge format={match.format} series={match.series} tournament={match.tournament} />
          {match.status === "live" && <span className="flex items-center gap-1.5 bg-red-500/10 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-red-500/20">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Live
          </span>}
        </div>
        <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest">
          {match.venue || match.city}
        </span>
      </div>

      {/* Teams & Scores */}
      <div className="space-y-4">
        {/* Team A */}
        <div className="flex items-center justify-between group/team">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center p-1 border border-white/5 transition-all group-hover/team:bg-white/10">
              {match.teamAFlag 
                ? <img src={match.teamAFlag} alt="" className="w-full h-full object-contain rounded-lg shadow-sm"/>
                : <span className="text-[10px] font-bold text-gray-500">{match.teamAShort?.[0]}</span>
              }
            </div>
            <span className="font-black text-white text-[15px] tracking-tight group-hover:text-brand-400 transition-colors">
              {match.teamAShort || match.teamA}
            </span>
          </div>
          <span className="font-black text-white text-lg tracking-tighter">
            {inn1?.battingTeam === match.teamA || (!inn2 && inn1)
              ? getScore(inn1) ?? "—"
              : getScore(inn2) ?? (inn1 ? getScore(inn1) : "—")}
          </span>
        </div>

        {/* Team B */}
        <div className="flex items-center justify-between group/team">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center p-1 border border-white/5 transition-all group-hover/team:bg-white/10">
              {match.teamBFlag 
                ? <img src={match.teamBFlag} alt="" className="w-full h-full object-contain rounded-lg shadow-sm"/>
                : <span className="text-[10px] font-bold text-gray-500">{match.teamBShort?.[0]}</span>
              }
            </div>
            <span className="font-black text-white text-[15px] tracking-tight group-hover:text-brand-400 transition-colors">
              {match.teamBShort || match.teamB}
            </span>
          </div>
          <span className="font-black text-white text-lg tracking-tighter">
            {inn2?.battingTeam === match.teamB || (inn1?.battingTeam === match.teamB)
              ? getScore(
                  inn1?.battingTeam === match.teamB ? inn1 : inn2
                ) ?? "—"
              : <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Yet to bat</span>}
          </span>
        </div>
      </div>

      {/* Result / Recent Footer */}
      <div className="mt-6 pt-5 border-t border-white/5">
        {match.status === "completed" ? (
          <p className="text-[11px] text-brand-400 font-black uppercase tracking-widest">{match.result}</p>
        ) : match.status === "live" ? (
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest italic">
              {match.currentBowler ? `🎳 ${match.currentBowler}` : "Match in progress"}
            </p>
            {match.recentBalls?.length > 0 && (
              <div className="flex gap-1.5">
                {match.recentBalls.slice(-6).map((b, i) => (
                  <span key={i} className={`text-[10px] w-6 h-6 flex items-center justify-center rounded-lg font-black ${
                    b === "W" ? "bg-red-500 text-white shadow-glow-orange" :
                    b === "4" ? "bg-accent-500 text-white" :
                    b === "6" ? "bg-brand-500 text-white" :
                    b === "0" || b === "•" ? "bg-white/5 text-gray-600" :
                    "bg-white/10 text-white"
                  }`}>{b}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
              {match.matchDate ? dayjs(match.matchDate).format("ddd, D MMM • h:mm A") : "Schedule TBD"}
            </p>
            <span className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Preview</span>
          </div>
        )}
      </div>
    </Link>
  );
}
