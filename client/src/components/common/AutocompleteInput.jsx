// src/components/common/AutocompleteInput.jsx
import { useState, useEffect, useRef, useCallback } from "react";

/**
 * AutocompleteInput
 *
 * Props:
 *  value        – controlled string value
 *  onChange     – (val: string) => void  called on every keystroke
 *  onSelect     – (item: object) => void called when user picks a suggestion
 *  fetchFn      – async (query: string) => item[]  returns suggestions
 *  renderItem   – (item) => JSX  custom row renderer (optional)
 *  getLabel     – (item) => string  what to display / fill on select (default: item.name)
 *  placeholder  – input placeholder
 *  className    – extra classes for the wrapper div
 *  inputClass   – extra classes for the <input>
 *  debounce     – ms to wait before fetching (default 300)
 *  minChars     – minimum chars before triggering (default 1)
 *  disabled
 */
export default function AutocompleteInput({
  value = "",
  onChange,
  onSelect,
  fetchFn,
  renderItem,
  getLabel = (item) => item.name,
  placeholder = "Type to search...",
  className = "",
  inputClass = "",
  debounce = 300,
  minChars = 1,
  disabled = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [searched,    setSearched]    = useState(false); // true once at least one search ran
  const timerRef  = useRef(null);
  const wrapRef   = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (!value || value.length < minChars) {
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchFn(value);
        setSuggestions(results || []);
        setSearched(true);
        setOpen(true);           // always open after a search so user sees feedback
        setHighlighted(-1);
      } catch {
        setSuggestions([]);
        setSearched(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, debounce);
    return () => clearTimeout(timerRef.current);
  }, [value]);

  const pick = (item) => {
    onChange(getLabel(item));
    onSelect?.(item);
    setSuggestions([]);
    setOpen(false);
    setSearched(false);
    setHighlighted(-1);
  };

  const handleKey = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const defaultRender = (item, isHighlighted) => (
    <div className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all
      ${isHighlighted ? "bg-brand-600/30 text-white" : "hover:bg-white/5 text-gray-300"}`}>
      {/* Avatar / icon */}
      {(item.photo || item.logo || item.flag) && (
        <img
          src={item.photo || item.logo || item.flag}
          alt=""
          className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0"
          onError={e => { e.target.style.display = "none"; }}
        />
      )}
      {!(item.photo || item.logo || item.flag) && (
        <div className="w-7 h-7 rounded-full bg-brand-700/40 border border-brand-500/30 flex items-center justify-center
                        text-[10px] font-black text-brand-400 shrink-0">
          {getLabel(item).charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-black truncate">{getLabel(item)}</div>
        {(item.role || item.shortName || item.teamType) && (
          <div className="text-[10px] text-gray-500 font-bold truncate">
            {item.role || item.shortName || item.teamType}
          </div>
        )}
      </div>
      {item.isCaptain && (
        <span className="ml-auto text-[9px] font-black text-yellow-400 bg-yellow-400/10
                         border border-yellow-400/20 px-1.5 py-0.5 rounded-md shrink-0">© C</span>
      )}
    </div>
  );

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); }}
          onKeyDown={handleKey}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                      placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-all
                      disabled:opacity-40 ${inputClass}`}
        />
        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* Clear button */}
        {value && !loading && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(""); setSuggestions([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white text-xs transition-colors"
          >✕</button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[500] top-full left-0 right-0 mt-1.5
                        bg-gray-950 border border-white/10 rounded-2xl shadow-2xl shadow-black/60
                        overflow-hidden backdrop-blur-xl max-h-64 overflow-y-auto
                        scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">

          {suggestions.length > 0 ? (
            <>
              {/* Header hint */}
              <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                  {suggestions.length} result{suggestions.length !== 1 ? "s" : ""}
                </span>
                <span className="text-[9px] text-gray-700">↑↓ navigate · Enter select · Esc close</span>
              </div>
              {suggestions.map((item, idx) => (
                <div key={item._id || item.name || idx} onMouseDown={() => pick(item)}>
                  {renderItem
                    ? renderItem(item, idx === highlighted)
                    : defaultRender(item, idx === highlighted)}
                </div>
              ))}
            </>
          ) : searched && !loading ? (
            /* Empty state */
            <div className="px-4 py-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-sm shrink-0">🔍</div>
              <div>
                <div className="text-xs font-black text-gray-500">No matches for "{value}"</div>
                <div className="text-[10px] text-gray-700 mt-0.5">Try a different spelling or add it first</div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
