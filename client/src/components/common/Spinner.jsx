// src/components/common/Spinner.jsx
export default function Spinner({ size = "md" }) {
  const s = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" }[size];
  return (
    <div className="flex justify-center items-center py-10">
      <div className={`${s} border-2 border-brand-500 border-t-transparent rounded-full animate-spin`} />
    </div>
  );
}

export function EmptyState({ icon = "🏏", title = "No data yet", sub = "" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="text-white font-semibold text-lg mb-1">{title}</h3>
      {sub && <p className="text-gray-500 text-sm">{sub}</p>}
    </div>
  );
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="bg-gray-900 border-b border-gray-800 py-5 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">{title}</h1>
          {sub && <p className="text-gray-400 text-sm mt-0.5">{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
      {tabs.map(t => (
        <button key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
            active === t.value
              ? "border-brand-500 text-brand-400"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    live:      "bg-red-500 text-white animate-pulse",
    upcoming:  "bg-blue-600 text-white",
    completed: "bg-gray-600 text-gray-300",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide ${map[status] || map.completed}`}>
      {status === "live" ? "● LIVE" : status}
    </span>
  );
}

const formatDisplayName = ({ format, series, tournament }) => {
  if (format === "ODI" && !series && !tournament) return "RMC";
  if (format === "IPL") {
    const name = [series, tournament?.name, tournament?.shortName, tournament?.type]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (/women|woman|female|girls|wpl/.test(name)) return "WBC";
    return "HBC";
  }
  return format;
};

export function FormatBadge({ format, series, tournament }) {
  const displayFormat = formatDisplayName({ format, series, tournament });
  const map = {
    T20: "bg-violet-600", T20I: "bg-violet-600",
    ODI: "bg-blue-700",   Test: "bg-amber-700",
    IPL: "bg-pink-700",   WPL: "bg-pink-700",
    T10:  "bg-cyan-700",  T8:  "bg-cyan-700",
    RMC:  "bg-cyan-600",
    HBC:  "bg-pink-700",
    WBC:  "bg-pink-500",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded text-white uppercase ${map[displayFormat] || "bg-gray-700"}`}>
      {displayFormat}
    </span>
  );
}
