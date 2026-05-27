// src/components/match/ScoreBoard.jsx
export default function ScoreBoard({ match }) {
  if (!match) return null;
  const inn = match.currentInnings === 2 ? match.innings2 : match.innings1;
  const prev = match.currentInnings === 2 ? match.innings1 : null;
  const inningsOvers = match.isSuperOver ? 1 : (match.overs || 20);
  const totalBalls = inningsOvers * 6;
  const overs = inn?.balls
    ? `${Math.floor(inn.balls / 6)}.${inn.balls % 6}`
    : "0.0";
  const rr = inn?.balls
    ? (inn.runs / (inn.balls / 6)).toFixed(2)
    : "0.00";
  const ballsLeft = totalBalls > 0
    ? Math.max(0, totalBalls - (inn?.balls || 0))
    : null;
  const targetValue = match.isSuperOver && match.currentInnings === 2
    ? (match.superOverInnings1?.runs || 0) + 1
    : (match.target || ((match.innings1?.runs || 0) + 1));
  const runsLeft = match.currentInnings === 2 && targetValue > 0
    ? Math.max(0, targetValue - (inn?.runs || 0))
    : null;
  const hasResult = match.status === "completed" && !!match.result;
  const isSuper = match.isSuperOver;
  const inningsLabel = isSuper
    ? `Super Over • ${match.currentInnings === 2 ? '2nd Innings' : '1st Innings'}`
    : `${match.currentInnings === 2 ? '2nd Innings' : '1st Innings'}`;
  const extrasLabel = inn?.extras || 0;
  const lastFall = inn?.fallOfWickets?.slice(-3).map(f => `${f.score} (${f.over})`).join(" • ");
  const lastPartnership = inn?.partnerships?.slice(-1)[0];
  const partnershipText = lastPartnership && lastPartnership.players?.length === 2
    ? `${lastPartnership.players[0]} & ${lastPartnership.players[1]} — ${lastPartnership.runs} runs, ${lastPartnership.balls} balls`
    : lastPartnership
      ? `${lastPartnership.runs} runs, ${lastPartnership.balls} balls`
      : null;

  return (
    <div className="relative group overflow-hidden rounded-2xl">
      {/* Background with subtle animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-brand-800 via-brand-900 to-black z-0" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 z-0" />
      
      {/* Content */}
      <div className="relative z-10 p-6 text-white backdrop-blur-sm">
        {/* Match title */}
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="text-[10px] font-black text-brand-400 uppercase tracking-[0.2em] mb-1">
              {match.series || "Live Match"}
            </div>
            <div className="text-lg font-black tracking-tight leading-none uppercase">
              {match.matchTitle || `${match.teamA} vs ${match.teamB}`}
            </div>
            <div className="text-[10px] opacity-40 mt-1 font-medium">{match.venue}</div>
          </div>
          {match.status === "live" && (
            <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-red-500 tracking-wider">LIVE</span>
            </div>
          )}
        </div>

        {/* Score Display */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-black font-mono tracking-tighter">
                {inn?.runs ?? 0}
              </span>
              <span className="text-2xl font-bold text-white/40">/{inn?.wickets ?? 0}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-bold text-white/70 tracking-widest uppercase">
                {overs} OVERS
              </span>
              <span className="text-[10px] font-bold text-brand-400 uppercase">
                CRR {rr}
              </span>
            </div>
          </div>

          <div className="text-right">
            {hasResult && (
              <div className="space-y-1 text-right">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Result</div>
                <div className="text-2xl font-black text-brand-300 leading-tight">
                  {match.result}
                </div>
              </div>
            )}
            {!hasResult && match.currentInnings === 2 && targetValue > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest">To Win</div>
                <div className="text-2xl font-black text-yellow-400 font-mono">
                  {runsLeft}
                </div>
                <div className="text-[10px] text-white/60 uppercase tracking-[0.2em]">
                  {targetValue} target
                </div>
                {ballsLeft !== null && ballsLeft > 0 && (
                  <div className="text-[10px] font-bold text-white/60">
                    OFF {ballsLeft} BALLS
                  </div>
                )}
              </div>
            )}
            {prev && match.currentInnings === 2 && (
              <div className="mt-2 text-[10px] font-bold text-white/40 uppercase">
                {prev.battingTeam} {prev.runs}/{prev.wickets}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mb-2">Innings</div>
            <div className="text-sm text-white font-semibold">{inningsLabel}</div>
            <div className="text-[10px] text-gray-400 mt-1">{inn?.battingTeam || 'Batting'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mb-2">Extras</div>
            <div className="text-2xl font-black text-brand-300">{extrasLabel}</div>
            <div className="text-[10px] text-gray-400 mt-1">{inn?.extras ? 'Recorded extras' : 'No extras yet'}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mb-2">Partnership</div>
            <div className="text-sm text-white font-semibold">{partnershipText || 'N/A'}</div>
          </div>
        </div>

        {(lastFall || (match.currentInnings === 2 && targetValue > 0)) && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-gray-200">
            {match.currentInnings === 2 && targetValue > 0 && (
              <div className="mb-2">
                <span className="font-bold text-white">Chase Target:</span> {targetValue} runs
                {ballsLeft !== null && ` • ${ballsLeft} balls remaining`}
              </div>
            )}
            {lastFall && (
              <div>
                <span className="font-bold text-white">Fall of Wickets:</span> {lastFall}
              </div>
            )}
          </div>
        )}

        {/* Recent Balls Strip */}
        {match.recentBalls?.length > 0 && (
          <div className="mt-8 flex items-center justify-between border-t border-white/5 pt-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {match.recentBalls.slice(-8).map((b, i) => (
                <div key={i} className={`
                  shrink-0 w-8 h-8 flex items-center justify-center rounded-xl font-black text-[10px]
                  transition-all duration-300 hover:scale-110
                  ${
                    b === "W"  ? "bg-red-500 text-white shadow-lg shadow-red-500/40" :
                    b === "4"  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/40" :
                    b === "6"  ? "bg-yellow-400 text-black shadow-lg shadow-yellow-500/40" :
                    b === "0" || b === "•" ? "bg-white/5 text-white/40 border border-white/5" :
                    "bg-white/10 text-white border border-white/10"
                  }
                `}>
                  {b}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 blur-[60px] rounded-full translate-y-1/2 -translate-x-1/2" />
    </div>
  );
}

// src/components/match/BattingTable.jsx
export function BattingTable({ batsmen = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="text-left py-2 px-3 font-semibold">Batsman</th>
            <th className="py-2 px-3 text-center font-semibold">R</th>
            <th className="py-2 px-3 text-center font-semibold">B</th>
            <th className="py-2 px-3 text-center font-semibold">4s</th>
            <th className="py-2 px-3 text-center font-semibold">6s</th>
            <th className="py-2 px-3 text-center font-semibold">SR</th>
          </tr>
        </thead>
        <tbody>
          {batsmen.map((b, i) => {
            const sr = b.balls > 0 ? ((b.runs / b.balls) * 100).toFixed(1) : "0.0";
            return (
              <tr key={i}
                className={`border-b border-gray-800/50 ${b.isStriker ? "bg-gray-800/40" : ""}`}
              >
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-1">
                    <span className={`font-semibold ${b.isOut ? "text-gray-500" : "text-white"}`}>
                      {b.name}
                    </span>
                    {b.isStriker && !b.isOut && (
                      <span className="text-brand-400 text-xs">🏏</span>
                    )}
                  </div>
                  {b.isOut && (
                    <div className="text-gray-500 text-xs mt-0.5">{b.dismissal || "out"}</div>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center font-bold text-white">{b.runs}</td>
                <td className="py-2.5 px-3 text-center text-gray-400">{b.balls}</td>
                <td className="py-2.5 px-3 text-center text-gray-400">{b.fours}</td>
                <td className="py-2.5 px-3 text-center text-gray-400">{b.sixes}</td>
                <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-xs">{sr}</td>
              </tr>
            );
          })}
          {batsmen.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-gray-600 text-sm">No batting data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// src/components/match/BowlingTable.jsx
export function BowlingTable({ bowlers = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="text-left py-2 px-3 font-semibold">Bowler</th>
            <th className="py-2 px-3 text-center font-semibold">O</th>
            <th className="py-2 px-3 text-center font-semibold">M</th>
            <th className="py-2 px-3 text-center font-semibold">R</th>
            <th className="py-2 px-3 text-center font-semibold">W</th>
            <th className="py-2 px-3 text-center font-semibold">Eco</th>
          </tr>
        </thead>
        <tbody>
          {bowlers.map((b, i) => {
            const overs = b.balls > 0
              ? `${Math.floor(b.balls / 6)}.${b.balls % 6}` : "0.0";
            const eco   = b.balls > 0
              ? (b.runs / (b.balls / 6)).toFixed(2) : "0.00";
            return (
              <tr key={i} className="border-b border-gray-800/50">
                <td className="py-2.5 px-3 font-semibold text-white">{b.name}</td>
                <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-xs">{overs}</td>
                <td className="py-2.5 px-3 text-center text-gray-400">{b.maidens}</td>
                <td className="py-2.5 px-3 text-center text-gray-400">{b.runs}</td>
                <td className="py-2.5 px-3 text-center font-bold text-white">{b.wickets}</td>
                <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-xs">{eco}</td>
              </tr>
            );
          })}
          {bowlers.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-gray-600 text-sm">No bowling data yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FallOfWickets({ fallOfWickets = [] }) {
  if (!fallOfWickets.length) {
    return (
      <div className="rounded-2xl border border-gray-800/50 bg-white/5 p-4 text-sm text-gray-400">
        No fall of wickets recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800/50 bg-white/5 p-4">
      <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mb-3">Fall of Wickets</div>
      <div className="grid gap-2 text-sm text-white">
        {fallOfWickets.map((f, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center rounded-xl bg-gray-950/40 p-2">
            <span>{f.player}</span>
            <span className="text-right text-gray-300">{f.score}</span>
            <span className="text-right text-gray-400">{f.over}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PartnershipsTable({ partnerships = [] }) {
  if (!partnerships.length) {
    return (
      <div className="rounded-2xl border border-gray-800/50 bg-white/5 p-4 text-sm text-gray-400">
        No partnerships recorded yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800/50 bg-white/5 p-4 overflow-x-auto">
      <div className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mb-3">Partnerships</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
            <th className="text-left py-2 px-3 font-semibold">Partnership</th>
            <th className="py-2 px-3 text-center font-semibold">Runs</th>
            <th className="py-2 px-3 text-center font-semibold">Balls</th>
          </tr>
        </thead>
        <tbody>
          {partnerships.map((p, i) => (
            <tr key={i} className="border-b border-gray-800/50">
              <td className="py-2.5 px-3 text-gray-200">{p.players?.join(" & ") || "N/A"}</td>
              <td className="py-2.5 px-3 text-center text-white font-semibold">{p.runs}</td>
              <td className="py-2.5 px-3 text-center text-gray-400">{p.balls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// src/components/match/CommentaryFeed.jsx
export function CommentaryFeed({ commentary = [] }) {
  if (!commentary.length) {
    return <p className="text-gray-600 text-sm py-6 text-center">No commentary yet</p>;
  }
  return (
    <div className="space-y-0">
      {commentary.map((c, i) => (
        <div key={i}
          className={`flex gap-4 py-3 px-3 border-b border-gray-800/50 ${
            c.isWicket ? "bg-red-950/30" :
            c.runs === 6 ? "bg-yellow-950/20" :
            c.runs === 4 ? "bg-blue-950/20" : ""
          }`}
        >
          <div className="shrink-0 w-12 text-xs font-mono text-gray-500 pt-0.5">{c.over || "—"}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {c.isWicket && <span className="text-xs font-bold text-red-400 bg-red-900/40 px-2 py-0.5 rounded">WICKET</span>}
              {c.runs === 6 && !c.isWicket && <span className="text-xs font-bold text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded">SIX!</span>}
              {c.runs === 4 && !c.isWicket && <span className="text-xs font-bold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">FOUR!</span>}
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{c.text}</p>
          </div>
          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            c.isWicket ? "bg-red-600 text-white" :
            c.runs === 6 ? "bg-yellow-500 text-black" :
            c.runs === 4 ? "bg-blue-500 text-white" :
            c.runs === 0 ? "bg-gray-700 text-gray-400" :
            "bg-gray-600 text-white"
          }`}>
            {c.isWicket ? "W" : c.extraType ? c.extraType.slice(0,2).toUpperCase() : c.runs}
          </div>
        </div>
      ))}
    </div>
  );
}
