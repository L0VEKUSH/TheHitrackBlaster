// src/pages/admin/AdminLiveScoring.jsx
import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { matchAPI, playerAPI, tournamentAPI, pollAPI } from "../../services/api";
import { useLiveMatch } from "../../hooks/useLiveMatch";
import { motion } from "framer-motion";
import Spinner from "../../components/common/Spinner";
import AutocompleteInput from "../../components/common/AutocompleteInput";
import { BattingTable, BowlingTable } from "../../components/match/ScoreBoard";
import { getActiveInnings } from "../../utils/matchSelectors";
import {
  getWicketTypesForExtra,
  isNonDeliveryWicketType,
} from "../../utils/scoringRules";

const createActionId = (operation) => {
  const nonce = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${operation}:${nonce}`.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128);
};

const getStateVersion = (match) => {
  const version = Number(match?.stateVersion ?? match?.__v);
  return Number.isInteger(version) && version >= 0 ? version : null;
};

const STRIKER_ONLY_WICKET_TYPES = new Set([
  "bowled", "caught", "lbw", "stumped", "hitWicket", "hitBallTwice",
]);
const FIELDER_REQUIRED_WICKET_TYPES = new Set(["caught", "stumped", "runOut"]);
const POSITIVE_VALUE_EXTRA_TYPES = new Set(["bye", "legBye", "penalty", "bonus"]);
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const cleanText = (value) => String(value == null ? "" : value).trim();

const playerIdOf = (player) => {
  if (!player || typeof player !== "object") return "";
  const rawId = player.playerId ?? player._id ?? player.id;
  if (rawId && typeof rawId === "object") {
    return cleanText(rawId._id ?? rawId.id);
  }
  return cleanText(rawId);
};

const playerNameOf = (player) => {
  if (!player || typeof player !== "object") return "";
  return cleanText(
    player.nameSnapshot ??
    player.name ??
    player.playerName ??
    (typeof player.playerId === "object" ? player.playerId?.name : "") ??
    player.player?.name,
  );
};

const normalizeRosterEntry = (entry) => {
  if (typeof entry === "string") {
    const value = cleanText(entry);
    return OBJECT_ID_PATTERN.test(value)
      ? { _id: value, playerId: value, name: "", role: "", photo: "" }
      : { _id: "", playerId: "", name: value, role: "", photo: "", isLegacyName: true };
  }

  const source = entry && typeof entry === "object" ? entry : {};
  const populatedPlayer = source.player && typeof source.player === "object"
    ? source.player
    : source.playerId && typeof source.playerId === "object"
      ? source.playerId
      : {};
  const playerId = playerIdOf(source) || playerIdOf(populatedPlayer);
  return {
    ...populatedPlayer,
    ...source,
    _id: playerId,
    playerId,
    name: playerNameOf(source) || playerNameOf(populatedPlayer),
    role: source.role || populatedPlayer.role || "",
    photo: source.photo || populatedPlayer.photo || "",
  };
};

const playingXIEntries = (selection) => {
  if (Array.isArray(selection)) return selection;
  return Array.isArray(selection?.playingXI) ? selection.playingXI : [];
};

const sameParticipant = (left, right) => {
  const leftId = playerIdOf(left);
  const rightId = playerIdOf(right);
  if (leftId && rightId) return leftId === rightId;
  const leftName = playerNameOf(left).toLocaleLowerCase();
  const rightName = playerNameOf(right).toLocaleLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
};

const dedupeRoster = (players) => {
  const seen = new Set();
  return players.filter((player) => {
    const playerId = playerIdOf(player);
    const name = playerNameOf(player);
    const key = playerId ? `id:${playerId}` : `name:${name.toLocaleLowerCase()}`;
    if (!name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function AdminLiveScoring() {
  const { id }  = useParams();
  const navigate = useNavigate();
  const { match, loading, error, setMatch, refetch } = useLiveMatch(id);

  const [tossWinner,   setTossWinner]   = useState("");
  const [tossDecision, setTossDecision] = useState("bat");
  const [newBatsman,   setNewBatsman]   = useState("");
  const [newBowler,    setNewBowler]    = useState("");
  const [bowlerName,   setBowlerName]   = useState("");
  const [commentary,   setCommentary]   = useState("");
  const [result,       setResult]       = useState("");
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState("");
  const [extraMRMCfier,setExtraMRMCfier] = useState("");
  const [manualBonus,   setManualBonus]   = useState(1);
  const [manualPenalty, setManualPenalty] = useState(1);
  const [wicketType,    setWicketType]    = useState("caught");
  const [wicketRuns,    setWicketRuns]    = useState(0);
  const [fielderName,   setFielderName]   = useState("");
  const [fielderId,     setFielderId]     = useState("");
  const [newBatsmanId,  setNewBatsmanId]  = useState("");
  const [newBowlerId,   setNewBowlerId]   = useState("");
  const mutationLockRef = useRef(false);
  const matchRef = useRef(match);
  const flashTimerRef = useRef(null);
  const requireBowlerChangeRef = useRef(false);
  const mountedRef = useRef(true);
  const pollRefreshRef = useRef(null);
  const routeIdRef = useRef(id);
  routeIdRef.current = id;
  matchRef.current = match;

  const statistics = match?.statistics ?? {};
  const inningsNum = Number(match?.currentInnings) === 2 ? 2 : 1;
  const inn = getActiveInnings(match);
  const activeInningsBatters = (inn?.batsmen || []).filter((batter) =>
    !batter.isOut && batter.isActive !== false);
  const striker = activeInningsBatters.find((batter) =>
    batter.isStriker && !batter.isOut && batter.isActive !== false);
  const nonStriker = activeInningsBatters.find((batter) => !sameParticipant(batter, striker));
  const batterName = striker?.name || "";
  const recentBalls = Array.isArray(match?.recentBalls)
    ? match.recentBalls
    : (inn?.recentBalls || []);
  const squadAKey = (match?.squadA || []).join("\u0001");
  const squadBKey = (match?.squadB || []).join("\u0001");
  const teamAPlayingXIKey = JSON.stringify(playingXIEntries(match?.teamAPlayingXI));
  const teamBPlayingXIKey = JSON.stringify(playingXIEntries(match?.teamBPlayingXI));
  
  // Rosters
  const [rosterA, setRosterA] = useState([]);
  const [rosterB, setRosterB] = useState([]);
  const [showRoster, setShowRoster] = useState(null); // 'bat' or 'bwl'

  // Wicket Dialog
  const [showWicketModal, setShowWicketModal] = useState(false);
  const [outPlayer, setOutPlayer] = useState("");
  const [outPlayerId, setOutPlayerId] = useState("");
  const [selectedMoM, setSelectedMoM] = useState("");

  // Poll
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState([{text: ""}, {text: ""}]);
  const [pollCreating, setPollCreating] = useState(false);
  const [storedPolls, setStoredPolls] = useState([]);
  const [showResolveModal, setShowResolveModal] = useState(null);

  // Timer
  const [startTime, setStartTime] = useState(new Date());
  const [elapsed, setElapsed] = useState("00:00:00");

  const flash = (message) => {
    if (!mountedRef.current) return;
    setMsg(message);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setMsg(""), 3000);
  };

  const resetWicketDraft = () => {
    setShowWicketModal(false);
    setOutPlayer("");
    setOutPlayerId("");
    setWicketType("caught");
    setWicketRuns(0);
    setFielderName("");
    setFielderId("");
  };

  const runMatchMutation = async (operation, request, options = {}) => {
    // React state updates asynchronously; the ref closes the double-click
    // window before disabled controls can render.
    if (mutationLockRef.current) {
      flash("A match update is already in progress.");
      return null;
    }

    const operationMatchId = String(routeIdRef.current || "");
    const expectedVersion = getStateVersion(matchRef.current);
    if (expectedVersion === null) {
      flash("Match version is unavailable. Refreshing the latest state...");
      const latest = await refetch();
      if (operationMatchId === String(routeIdRef.current || "") && latest) {
        matchRef.current = latest;
      }
      return null;
    }

    mutationLockRef.current = true;
    setSaving(true);
    const metadata = { actionId: createActionId(operation), expectedVersion };

    try {
      let response;
      try {
        response = await request(metadata);
      } catch (firstError) {
        // A timeout can happen after MongoDB committed the event. Retrying once
        // with the same action ID asks for the durable receipt and cannot apply
        // the delivery twice.
        if (firstError.response) throw firstError;
        response = await request(metadata);
      }
      const data = response?.data;
      if (!data?.match) throw new Error("Server returned no authoritative match state");
      // An in-flight request may finish after React Router has reused this
      // component for another match. Ignore that old response completely.
      if (operationMatchId !== String(routeIdRef.current || "")) return null;
      const returnedMatchId = String(data.match._id ?? data.match.id ?? "");
      if (!returnedMatchId || returnedMatchId !== operationMatchId) {
        throw new Error("Server returned state for a different match");
      }
      matchRef.current = data.match;
      if (!mountedRef.current) return data;
      setMatch(data.match);
      options.onSuccess?.(data);
      if (options.successMessage) {
        flash(typeof options.successMessage === "function"
          ? options.successMessage(data)
          : options.successMessage);
      }
      return data;
    } catch (err) {
      if (operationMatchId !== String(routeIdRef.current || "")) return null;
      const status = err.response?.status;
      const serverMessage = err.response?.data?.message;
      if (status === 409 || !err.response) {
        const latest = await refetch();
        if (latest) matchRef.current = latest;
        options.onConflict?.(latest);
        flash(status === 409
          ? `${serverMessage || "Match state changed."} Latest state loaded.`
          : latest
            ? "Connection was interrupted. The authoritative match state was reloaded."
            : "Connection was interrupted. Refresh before attempting another score.");
      } else {
        flash(serverMessage || options.failureMessage || err.message || "Match update failed");
      }
      return null;
    } finally {
      mutationLockRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };

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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // Do not carry an unfinished scoring draft, roster, poll, or display timer
    // into a different match when this route component is reused.
    requireBowlerChangeRef.current = false;
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = null;
    setMsg("");
    setCommentary("");
    setResult("");
    setExtraMRMCfier("");
    setManualBonus(1);
    setManualPenalty(1);
    setNewBatsman("");
    setNewBatsmanId("");
    setNewBowler("");
    setNewBowlerId("");
    setBowlerName("");
    setRosterA([]);
    setRosterB([]);
    setShowRoster(null);
    setStoredPolls([]);
    setShowPollModal(false);
    setShowResolveModal(null);
    setPollQuestion("");
    setPollOptions([{ text: "" }, { text: "" }]);
    setStartTime(new Date());
    resetWicketDraft();
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    let inFlight = false;
    const controllers = new Set();

    const fetchPolls = async () => {
      if (!active || inFlight) return;
      inFlight = true;
      const controller = new AbortController();
      controllers.add(controller);
      try {
        const response = await pollAPI.getMatchPolls(id, { all: true }, { signal: controller.signal });
        if (active) {
          setStoredPolls(Array.isArray(response.data.data) ? response.data.data : []);
        }
      } catch (pollError) {
        if (active && pollError.name !== "CanceledError" && pollError.code !== "ERR_CANCELED") {
          console.error("Unable to refresh match polls:", pollError.message);
        }
      } finally {
        controllers.delete(controller);
        inFlight = false;
      }
    };

    pollRefreshRef.current = fetchPolls;
    void fetchPolls();
    const interval = window.setInterval(() => { void fetchPolls(); }, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
      controllers.forEach((controller) => controller.abort());
      controllers.clear();
      if (pollRefreshRef.current === fetchPolls) pollRefreshRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!match) return;
    setTossWinner(match.tossWinner || match.teamA || "");
    setTossDecision(match.tossDecision || "bat");
  }, [match]);

  useEffect(() => {
    if (!match?._id) return undefined;
    let active = true;
    const squadA = match.squadA || [];
    const squadB = match.squadB || [];
    const teamAPlayingXI = playingXIEntries(match.teamAPlayingXI);
    const teamBPlayingXI = playingXIEntries(match.teamBPlayingXI);

    const loadRoster = async (team, selectedPlayingXI, squad, setter) => {
      const playingSeeds = selectedPlayingXI.map(normalizeRosterEntry).filter((player) => (
        playerIdOf(player) || playerNameOf(player)
      ));

      if (playingSeeds.length > 0) {
        // Render any snapshots immediately, then enrich ID-backed entries with
        // the current Player record for photos and roles. The selected XI is
        // authoritative; substitutes and broader squad members are excluded.
        setter(dedupeRoster(playingSeeds));
        let teamPlayers = [];
        try {
          const response = await playerAPI.getAll({ team, limit: 100 });
          teamPlayers = Array.isArray(response.data?.players) ? response.data.players : [];
        } catch (rosterError) {
          if (active) console.error(`Unable to enrich ${team}'s Playing XI:`, rosterError.message);
        }

        const playersById = new Map(teamPlayers.map((player) => [playerIdOf(player), player]));
        const unresolvedIds = [...new Set(
          playingSeeds.map(playerIdOf).filter((playerId) => playerId && !playersById.has(playerId)),
        )];
        const fetchedById = new Map();
        await Promise.all(unresolvedIds.map(async (playerId) => {
          try {
            const response = await playerAPI.getById(playerId);
            const player = response.data?.player;
            if (player) fetchedById.set(playerId, player);
          } catch (rosterError) {
            if (active) console.error(`Unable to resolve Playing XI player ${playerId}:`, rosterError.message);
          }
        }));

        const teamPlayersByName = new Map();
        for (const player of teamPlayers) {
          const key = playerNameOf(player).toLocaleLowerCase();
          if (!key) continue;
          const matches = teamPlayersByName.get(key) || [];
          matches.push(player);
          teamPlayersByName.set(key, matches);
        }

        const resolved = playingSeeds.map((seed) => {
          const playerId = playerIdOf(seed);
          const nameMatches = teamPlayersByName.get(playerNameOf(seed).toLocaleLowerCase()) || [];
          const details = playersById.get(playerId) || fetchedById.get(playerId) ||
            (!playerId && nameMatches.length === 1 ? nameMatches[0] : null);
          const resolvedId = playerId || playerIdOf(details);
          return {
            ...(details || {}),
            ...seed,
            _id: resolvedId,
            playerId: resolvedId,
            name: playerNameOf(seed) || playerNameOf(details),
            role: seed.role || details?.role || "",
            photo: seed.photo || details?.photo || "",
          };
        });
        if (active) setter(dedupeRoster(resolved));
        return;
      }

      if (squad.length > 0) {
        // Legacy matches remain viewable/selectable by their historical squad
        // names, but ID-backed Playing XI data always wins when it exists.
        setter(dedupeRoster(squad.map(normalizeRosterEntry)));
        return;
      }

      setter([]);
      try {
        const response = await playerAPI.getAll({ team, limit: 100 });
        if (active) setter(dedupeRoster(response.data?.players || []));
      } catch (rosterError) {
        if (active) console.error(`Unable to load ${team} roster:`, rosterError.message);
      }
    };

    void loadRoster(match.teamA, teamAPlayingXI, squadA, setRosterA);
    void loadRoster(match.teamB, teamBPlayingXI, squadB, setRosterB);
    return () => { active = false; };
  }, [
    match?._id,
    match?.teamA,
    match?.teamB,
    squadAKey,
    squadBKey,
    teamAPlayingXIKey,
    teamBPlayingXIKey,
  ]);

  useEffect(() => {
    if (match) {
      const currentInnings = getActiveInnings(match);
      const overNeedsNewBowler = currentInnings && currentInnings.balls > 0 &&
        currentInnings.balls % 6 === 0 &&
        currentInnings.currentBowler === currentInnings.lastOverBowler;
      setBowlerName(requireBowlerChangeRef.current || overNeedsNewBowler
        ? ""
        : (match.currentBowler || currentInnings?.currentBowler || ""));
      setResult(match.result || "");
      setNewBatsman("");
      setNewBatsmanId("");
      setNewBowler("");
      setNewBowlerId("");
      resetWicketDraft();
      if (statistics?.manOfTheMatch?.name) {
        setSelectedMoM(statistics.manOfTheMatch.name);
      } else {
        setSelectedMoM("");
      }

    }
  }, [match]);

  const performToss = async () => {
    if (!tossWinner) return flash("⚠️ Select toss winner first.");
    if (!tossDecision) return flash("⚠️ Select toss decision first.");
    await runMatchMutation(
      "START_MATCH",
      (metadata) => matchAPI.setToss(id, { winner: tossWinner, decision: tossDecision, ...metadata }),
      {
        successMessage: `🎉 ${tossWinner} won the toss and chose to ${tossDecision}`,
        failureMessage: "❌ Toss failed",
      },
    );
  };

  const quickBall = async (r, type = "", wkt = false, dismissedPlayer = "", wType = "", fName = "", fId = "") => {
    if (match?.status === "completed") return flash("⚠️ Match is completed! Use Undo if needed.");
    if (match?.status !== "live" || !inn) return flash("⚠️ Start the match and initialize the innings first.");
    const runs = Number(r);
    if (!Number.isInteger(runs) || runs < 0 || runs > 20) {
      return flash("Runs must be a whole number between 0 and 20.");
    }
    const isAdjustment = type === "bonus" || type === "penalty";
    const resolvedWicketType = wType || (wkt ? wicketType : "");
    const isNonDeliveryWicket = wkt && isNonDeliveryWicketType(resolvedWicketType);
    const resolvedFielderName = String(fName || (wkt ? fielderName : "")).trim();
    const resolvedFielderId = cleanText(fId || (wkt ? fielderId : ""));
    const authoritativeInnings = getActiveInnings(matchRef.current);
    const authoritativeFreeHitPending = Boolean(authoritativeInnings?.freeHitPending);
    if (POSITIVE_VALUE_EXTRA_TYPES.has(type) && runs < 1) {
      return flash("The selected extra must add at least one run.");
    }
    if (isAdjustment && wkt) {
      return flash("Penalty and bonus adjustments cannot include a wicket.");
    }
    if (isNonDeliveryWicket && type) {
      return flash("Administrative dismissals cannot be combined with a delivery extra.");
    }
    if (authoritativeFreeHitPending && wkt && !isNonDeliveryWicket) {
      resetWicketDraft();
      return flash("FREE HIT: a delivery wicket cannot be submitted.");
    }
    if (!isAdjustment && !batterName) return flash("⚠️ Select a striker first!");
    if (!isAdjustment && !isNonDeliveryWicket && !bowlerName) return flash("⚠️ Select a bowler!");
    if (wkt && STRIKER_ONLY_WICKET_TYPES.has(resolvedWicketType) && dismissedPlayer !== batterName) {
      return flash("That dismissal can only apply to the striker.");
    }
    if (wkt && FIELDER_REQUIRED_WICKET_TYPES.has(resolvedWicketType) && !resolvedFielderName) {
      return flash("Select or enter the fielder before confirming the dismissal.");
    }
    if (wkt && FIELDER_REQUIRED_WICKET_TYPES.has(resolvedWicketType) && !resolvedFielderId) {
      return flash("Select the fielder from the player suggestions to confirm their identity.");
    }
    const selectedBowler = (inn?.bowlers || []).find((bowler) => bowler.name === bowlerName);
    const dismissedBatter = (inn?.batsmen || []).find((batter) => (
      outPlayerId ? playerIdOf(batter) === outPlayerId : batter.name === dismissedPlayer
    ));

    await runMatchMutation(
      "SCORE_BALL",
      (metadata) => matchAPI.updateScore(id, {
        inningsNum, runs, isWicket: wkt, extraType: type,
        batterName, batterId: playerIdOf(striker),
        nonStrikerName: nonStriker?.name || "",
        nonStrikerId: playerIdOf(nonStriker),
        bowlerName, bowlerId: playerIdOf(selectedBowler),
        outPlayerName: dismissedPlayer, outPlayerId: playerIdOf(dismissedBatter),
        commentary: commentary || "",
        wicketType: resolvedWicketType || null,
        fielderName: resolvedFielderName || null,
        fielderId: resolvedFielderId,
        ...metadata,
      }),
      {
        failureMessage: "❌ Failed",
        onSuccess: (data) => {
          setCommentary("");
          setExtraMRMCfier("");
          resetWicketDraft();
          if (data.isOverComplete && data.match.status !== "completed") {
            requireBowlerChangeRef.current = true;
            setBowlerName("");
            flash("🔔 Over Complete! Change Bowler.");
          } else if (data.match.status === "completed") {
            flash("🏆 Match Completed!");
          }
        },
      },
    );
  };

  const undoBall = async () => {
    await runMatchMutation(
      "UNDO",
      (metadata) => matchAPI.undo(id, { inningsNum, ...metadata }),
      {
        successMessage: "↩ Last action undone",
        failureMessage: "❌ Undo failed",
        onSuccess: (data) => {
          requireBowlerChangeRef.current = false;
          setBowlerName(data.match.currentBowler || getActiveInnings(data.match)?.currentBowler || "");
          setExtraMRMCfier("");
          setCommentary("");
          resetWicketDraft();
        },
      },
    );
  };

  const redoBall = async () => {
    await runMatchMutation(
      "REDO",
      (metadata) => matchAPI.redo(id, { inningsNum, ...metadata }),
      {
        successMessage: "↪ Last action restored",
        failureMessage: "❌ Redo failed",
        onSuccess: (data) => {
          requireBowlerChangeRef.current = false;
          setBowlerName(data.match.currentBowler || getActiveInnings(data.match)?.currentBowler || "");
          setExtraMRMCfier("");
          setCommentary("");
          resetWicketDraft();
        },
      },
    );
  };

  const updateStatus = async (status, resultMsg = "") => {
    await runMatchMutation(
      "END_MATCH",
      (metadata) => matchAPI.setStatus(id, { status, result: resultMsg, ...metadata }),
      {
        successMessage: (data) => `🚀 Match status: ${data.match.status}`,
        failureMessage: "❌ Update failed",
      },
    );
  };

  const declareCurrentInnings = async () => {
    if (!window.confirm("Are you sure you want to declare this innings or mark as All Out? This will close the current innings.")) return;
    await runMatchMutation(
      "END_INNINGS",
      (metadata) => matchAPI.declareInnings(id, {
        inningsNum,
        reason: "declared",
        commentary: commentary || "",
        ...metadata,
      }),
      {
        successMessage: "✅ Innings declared / all out",
        failureMessage: "❌ Failed",
        onSuccess: () => {
          requireBowlerChangeRef.current = false;
          setBowlerName("");
          setCommentary("");
          setExtraMRMCfier("");
          resetWicketDraft();
        },
      },
    );
  };

  const beginSuperOver = async () => {
    await runMatchMutation(
      "START_SUPER_OVER",
      (metadata) => matchAPI.startSuperOver(id, metadata),
      {
        successMessage: "Super over started",
        failureMessage: "Unable to start super over",
        onSuccess: () => {
          requireBowlerChangeRef.current = false;
          setBowlerName("");
          setResult("");
          setCommentary("");
          setExtraMRMCfier("");
          resetWicketDraft();
        },
      },
    );
  };

  const addFromRoster = async (playerOrName, type, { requirePlayerId = false } = {}) => {
    const player = typeof playerOrName === "object" && playerOrName !== null
      ? playerOrName
      : { name: playerOrName };
    const name = playerNameOf(player);
    const playerId = playerIdOf(player);
    if (match?.status === "completed") return flash("⚠️ Match is completed!");
    if (match?.status !== "live" || !inn) return flash("⚠️ Start the match before selecting players.");
    if (!name) return flash(`⚠️ Select a ${type === "bat" ? "batsman" : "bowler"} first.`);
    if (requirePlayerId && !playerId) {
      return flash(`Select the ${type === "bat" ? "batsman" : "bowler"} from the suggestions to confirm their identity.`);
    }
    const existingBatter = (inn.batsmen || []).find((batter) => sameParticipant(batter, player));
    if (type === "bat" && existingBatter) {
      return flash(existingBatter.isOut
        ? "⚠️ A dismissed batter cannot return."
        : "⚠️ That batter is already active.");
    }
    if (type === "bwl" && (inn.batsmen || []).some((batter) => sameParticipant(batter, player))) {
      return flash("⚠️ A batting-team player cannot be selected as bowler.");
    }
    const operation = type === "bat" ? "ADD_BATTER" : "ADD_BOWLER";
    await runMatchMutation(
      operation,
      (metadata) => type === "bat"
        ? matchAPI.addBatsman(id, inningsNum, { name, playerId, ...metadata })
        : matchAPI.addBowler(id, inningsNum, { name, playerId, ...metadata }),
      {
        successMessage: `✅ ${name} added`,
        failureMessage: "❌ Failed",
        onSuccess: () => {
          setShowRoster(null);
          if (type === "bat") {
            setNewBatsman("");
            setNewBatsmanId("");
          }
          else {
            requireBowlerChangeRef.current = false;
            setNewBowler("");
            setNewBowlerId("");
            setBowlerName(name);
          }
        },
      },
    );
  };

  const submitManualPoll = async () => {
    if (!pollQuestion) return flash("⚠️ Question required");
    const validOptions = pollOptions.filter(o => o.text.trim() !== "");
    if (validOptions.length < 2) return flash("⚠️ At least 2 options required");
    setPollCreating(true);
    try {
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
      void pollRefreshRef.current?.();
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
      void pollRefreshRef.current?.();
    } catch (err) {
      flash(err.response?.data?.message || "❌ Failed to resolve poll");
    }
  };

  if (loading) return <Spinner size="lg" />;
  if (!match) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p>{error || "Match not found"}</p>
        {error && <button type="button" onClick={() => { void refetch(); }} className="btn-primary mt-4">Retry</button>}
      </div>
    );
  }

  const overs = inn?.balls ? `${Math.floor(inn.balls/6)}.${inn.balls%6}` : "0.0";
  const activeBatsmen = activeInningsBatters;
  const currentBattingTeam = inn?.battingTeam;
  const currentBowlingTeam = currentBattingTeam === match.teamA ? match.teamB : match.teamA;
  const currentBattingRoster = currentBattingTeam === match.teamA ? rosterA : currentBattingTeam === match.teamB ? rosterB : rosterA;
  const currentBowlingRoster = currentBowlingTeam === match.teamA ? rosterA : currentBowlingTeam === match.teamB ? rosterB : rosterB;
  const matchStarted = Boolean(match.innings1) || match.status !== "upcoming";
  const inningsIsOpen = match.status === "live" && Boolean(inn) && !inn?.isDone;
  const latestDelivery = (inn?.commentary || []).find((entry) => entry?.bowlerName);
  const newOverHasIllegalDelivery = Boolean(inn?.balls >= 0 && inn?.balls % 6 === 0 &&
    inn?.currentBowler && inn.currentBowler !== inn.lastOverBowler &&
    latestDelivery?.bowlerName === inn.currentBowler);
  const currentOverHasDelivery = Boolean(inn?.balls % 6 || newOverHasIllegalDelivery);
  const canChangeBowler = inningsIsOpen && !currentOverHasDelivery;
  const scoreInputsReady = inningsIsOpen && activeBatsmen.length === 2 && Boolean(batterName && bowlerName);
  const adjustmentSelected = extraMRMCfier === "bonus" || extraMRMCfier === "penalty";
  const quickScoreReady = adjustmentSelected ? inningsIsOpen : scoreInputsReady;
  const freeHitPending = Boolean(inn?.freeHitPending);
  const availableWicketTypes = getWicketTypesForExtra(extraMRMCfier, { freeHitPending });
  const wicketMayIncludeRuns = ["runOut", "obstructingField", "hitBallTwice"].includes(wicketType);
  const wicketIsNonDelivery = isNonDeliveryWicketType(wicketType);
  const wicketNeedsFielder = FIELDER_REQUIRED_WICKET_TYPES.has(wicketType);
  const eligibleDismissedBatsmen = STRIKER_ONLY_WICKET_TYPES.has(wicketType)
    ? activeBatsmen.filter((batter) => batter.name === batterName)
    : activeBatsmen;
  const wicketSelectionReady = Boolean(
    outPlayer &&
    (!wicketNeedsFielder || fielderName.trim()) &&
    (!wicketNeedsFielder || fielderId) &&
    (wicketIsNonDelivery || bowlerName) &&
    (!freeHitPending || wicketIsNonDelivery),
  );
  const inningsBallLimit = (match.isSuperOver ? 1 : Number(match.overs || 0)) * 6;
  const inningsOverLimit = match.isSuperOver ? 1 : match.overs;
  const ballsRemaining = Number.isFinite(inningsBallLimit)
    ? Math.max(0, inningsBallLimit - (inn?.balls || 0))
    : 0;
  const authoritativeRequiredRuns = match.requiredRuns == null
    ? Math.max(0, (match.target || 0) - (inn?.runs || 0))
    : Math.max(0, Number(match.requiredRuns) || 0);
  const openWicketModal = () => {
    if (availableWicketTypes.length === 0) {
      return flash(freeHitPending
        ? "FREE HIT: clear the delivery extra to record an administrative dismissal."
        : "No dismissal is available for the selected scoring action.");
    }
    const selectedType = availableWicketTypes.includes(wicketType)
      ? wicketType
      : availableWicketTypes[0];
    setWicketType(selectedType);
    if (STRIKER_ONLY_WICKET_TYPES.has(selectedType)) {
      setOutPlayer(batterName);
      setOutPlayerId(playerIdOf(striker));
    } else {
      setOutPlayer("");
      setOutPlayerId("");
    }
    setShowWicketModal(true);
  };

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

      {error && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-xs text-yellow-200">
          <span>{error}. The last confirmed match state is still displayed.</span>
          <button type="button" onClick={() => { void refetch(); }} className="font-black uppercase tracking-widest text-yellow-100 hover:text-white">Retry</button>
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
              <select value={tossWinner} onChange={e => setTossWinner(e.target.value)} disabled={saving || matchStarted} className="mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white disabled:opacity-40">
                <option value="" disabled>Select winner</option>
                <option value={match.teamA}>{match.teamA}</option>
                <option value={match.teamB}>{match.teamB}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Decision</span>
              <select value={tossDecision} onChange={e => setTossDecision(e.target.value)} disabled={saving || matchStarted} className="mt-2 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white disabled:opacity-40">
                <option value="bat">Bat</option>
                <option value="bowl">Bowl</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-3 items-center mt-6">
            <button onClick={performToss} disabled={saving || matchStarted} className="py-3 px-5 rounded-2xl bg-brand-500 hover:bg-brand-400 text-white font-black uppercase tracking-widest disabled:opacity-40">
              {matchStarted ? "Match Started" : saving ? "Starting..." : "Perform Toss"}
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
               <div>Overs <span className="text-white text-lg">{overs}</span><span className="text-white/20 font-normal"> / {inningsOverLimit}</span></div>
               <div>Extras <span className="text-white text-lg">{inn?.extras}</span></div>
            </div>
          </div>

          <div className="space-y-6 text-right">
            {match.target > 0 && inningsNum === 2 && (
              <div className="bg-black/40 backdrop-blur-xl p-5 rounded-3xl border border-white/10 shadow-xl">
                 <div className="text-[10px] text-white/30 font-black uppercase tracking-widest mb-1">Target: {match.target}</div>
                 <div className="text-2xl font-black text-yellow-400">Need {authoritativeRequiredRuns} <span className="text-sm font-bold text-white/40">runs in</span> {ballsRemaining} <span className="text-sm font-bold text-white/40">balls</span></div>
                 {Number(match.requiredRunRate) > 0 && (
                   <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-white/50">RRR {Number(match.requiredRunRate).toFixed(2)}</div>
                 )}
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

      {freeHitPending && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl border-2 border-yellow-200 bg-yellow-400 px-6 py-5 text-black shadow-[0_0_40px_rgba(250,204,21,0.35)]"
        >
          <div className="absolute inset-0 animate-pulse bg-white/15" />
          <div className="relative flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-xl font-black text-yellow-300">FH</span>
              <div>
                <div className="text-3xl font-black italic uppercase tracking-tight">Free Hit</div>
                <div className="text-xs font-bold uppercase tracking-widest text-black/65">Delivery wickets are disabled for this ball</div>
              </div>
            </div>
            <div className="rounded-xl bg-black/10 px-4 py-2 text-[10px] font-black uppercase tracking-widest">
              Authoritative innings state
            </div>
          </div>
        </motion.div>
      )}

      {/* Bonus & Penalty Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-900/20 border border-green-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div>
              <div className="text-[10px] font-black text-green-400 uppercase tracking-widest mb-1">Bonus Award</div>
              <div className="text-xs text-white/50">Add custom extra runs</div>
           </div>
           <div className="flex items-center gap-2">
              <input type="number" min="1" max="20" step="1" value={manualBonus} disabled={saving} onChange={e => setManualBonus(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))} className="w-16 h-12 bg-black/40 border border-green-500/30 rounded-xl text-center text-white font-black focus:outline-none focus:border-green-500 disabled:opacity-40" />
              <button disabled={saving || !inningsIsOpen} onClick={() => quickBall(manualBonus, "bonus")} className="h-12 px-6 rounded-xl bg-green-500 text-white text-[10px] font-black uppercase hover:bg-green-400 transition-all disabled:opacity-30">Add Bonus</button>
           </div>
        </div>
        <div className="bg-red-900/20 border border-red-500/20 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div>
              <div className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Penalty Runs</div>
              <div className="text-xs text-white/50">Add penalty extras</div>
           </div>
           <div className="flex items-center gap-2">
              <input type="number" min="1" max="20" step="1" value={manualPenalty} disabled={saving} onChange={e => setManualPenalty(Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1)))} className="w-16 h-12 bg-black/40 border border-red-500/30 rounded-xl text-center text-white font-black focus:outline-none focus:border-red-500 disabled:opacity-40" />
              <button disabled={saving || !inningsIsOpen} onClick={() => quickBall(manualPenalty, "penalty")} className="h-12 px-6 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase hover:bg-red-500 transition-all disabled:opacity-30">Penalty</button>
           </div>
        </div>
      </div>

      {/* Control Grid */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Lineup Management */}
        <div className="lg:col-span-4 space-y-6">
          {/* ── Match Awards & MOTM Picker ────────────────── */}
          {(() => {
            // Compute top performers from statistics.players (sorted by points desc)
            const statPlayers = Array.isArray(statistics?.players)
              ? [...statistics.players].sort((a, b) => (b.points || 0) - (a.points || 0))
              : [];
            const topPerformers = statPlayers.slice(0, 5);  // show top 5 for admin to pick
            const currentMoM = statistics?.manOfTheMatch;

            const saveMoM = async (name, points) => {
              const reason = points !== undefined ? `${points} match pts` : 'Selected by admin';
              await runMatchMutation(
                "SET_MAN_OF_MATCH",
                (metadata) => matchAPI.setManOfTheMatch(id, { name, reason, ...metadata }),
                {
                  successMessage: name ? `🏆 Man of the Match set — ${name}` : "Man of the Match cleared",
                  failureMessage: "Save failed",
                },
              );
            };

            const topPts = topPerformers[0]?.points || 0;
            const isTied = topPerformers.filter(p => p.points === topPts).length > 1;

            return (
              <div className="card p-6 border-white/5 bg-gray-900/50">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">🏆 Man of the Match</h3>
                  <button className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors" onClick={async () => {
                    if (!match.tournament) return flash("No tournament set on match");
                    try {
                      await tournamentAPI.rebuildLeaderboards(match.tournament);
                      flash("✅ Leaderboards rebuilt");
                    } catch (err) { flash(err.response?.data?.message || 'Rebuild failed'); }
                  }}>Rebuild Leaderboards</button>
                </div>

                {/* Current MOTM badge */}
                {currentMoM?.name && (
                  <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/25">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <div className="text-yellow-400 font-black text-sm">{currentMoM.name}</div>
                      <div className="text-yellow-600 text-[10px] font-bold uppercase tracking-wider">{currentMoM.reason || 'Man of the Match'}</div>
                    </div>
                    <button disabled={saving} onClick={() => saveMoM("", "")} className="ml-auto text-[9px] text-gray-600 hover:text-red-400 font-bold uppercase transition-colors disabled:opacity-30">Clear</button>
                  </div>
                )}

                {/* Tie warning */}
                {isTied && topPts > 0 && (
                  <div className="mb-3 text-[10px] font-black text-orange-400 uppercase tracking-widest bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
                    ⚠️ Tie — {topPerformers.filter(p=>p.points===topPts).length} players on {topPts} pts · Admin must decide
                  </div>
                )}

                {/* Top performer cards */}
                {topPerformers.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {topPerformers.map((p, idx) => {
                      const isSelected = currentMoM?.name === p.name;
                      const isTiedPlayer = p.points === topPts && isTied;
                      return (
                        <button
                          key={p.name}
                          disabled={saving}
                          onClick={() => saveMoM(p.name, p.points)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left disabled:opacity-40 ${
                            isSelected
                              ? 'bg-yellow-500/15 border-yellow-500/40 shadow-lg shadow-yellow-500/10'
                              : isTiedPlayer
                              ? 'bg-orange-500/10 border-orange-500/30 hover:bg-orange-500/20'
                              : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15'
                          }`}
                        >
                          {/* Rank badge */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            idx === 0 ? 'bg-yellow-500 text-black' :
                            idx === 1 ? 'bg-gray-400 text-black' :
                            idx === 2 ? 'bg-amber-700 text-white' :
                            'bg-white/10 text-gray-400'
                          }`}>
                            {isTiedPlayer ? '=' : `#${idx + 1}`}
                          </div>

                          {/* Name & stats */}
                          <div className="flex-1 min-w-0">
                            <div className="text-white text-xs font-black truncate">{p.name}</div>
                            <div className="text-gray-500 text-[9px] font-bold mt-0.5 flex gap-2 flex-wrap">
                              {p.runs > 0 && <span className="text-green-400">{p.runs}R</span>}
                              {p.balls > 0 && <span>{p.balls}B</span>}
                              {p.fours > 0 && <span>{p.fours}×4</span>}
                              {p.sixes > 0 && <span className="text-purple-400">{p.sixes}×6</span>}
                              {p.wickets > 0 && <span className="text-red-400">{p.wickets}W</span>}
                              {p.ballsBowled > 0 && <span>Eco {p.economy ?? '—'}</span>}
                            </div>
                          </div>

                          {/* Points */}
                          <div className="text-right shrink-0">
                            <div className={`text-base font-black ${isSelected ? 'text-yellow-400' : isTiedPlayer ? 'text-orange-400' : 'text-brand-400'}`}>{p.points ?? 0}</div>
                            <div className="text-[8px] font-bold text-gray-600 uppercase">pts</div>
                          </div>

                          {isSelected && <span className="text-yellow-400 text-base shrink-0">🏆</span>}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center text-gray-600 text-xs py-4 italic">No stats yet — play some balls first</div>
                )}

                {/* Manual override dropdown for players not in top 5 */}
                <details className="mt-2">
                  <summary className="text-[10px] text-gray-500 font-bold uppercase tracking-widest cursor-pointer hover:text-gray-300 transition-colors">Override — Pick any player ▾</summary>
                  <div className="flex items-center gap-2 mt-3">
                    <select value={selectedMoM} disabled={saving} onChange={e => setSelectedMoM(e.target.value)} className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-40">
                      <option value="">Select player…</option>
                      {[...new Map(
                        (match.innings1?.batsmen || []).concat(match.innings2?.batsmen || [])
                        .concat(match.innings1?.bowlers || []).concat(match.innings2?.bowlers || [])
                        .concat(rosterA || []).concat(rosterB || [])
                        .filter(Boolean).map(p => [p.name, p])
                      ).values()].map(p => {
                        const pts = statPlayers.find(sp => sp.name === p.name)?.points || 0;
                        return (
                          <option key={p.name} value={p.name}>{p.name} ({pts} pts)</option>
                        );
                      })}
                    </select>
                    <button disabled={saving} className="btn-primary px-4 py-2 rounded-xl text-xs shrink-0 disabled:opacity-40" onClick={async () => {
                      if (!selectedMoM) return flash('Select player first');
                      const pts = statPlayers.find(sp => sp.name === selectedMoM)?.points;
                      await saveMoM(selectedMoM, pts);
                    }}>Set</button>
                  </div>
                </details>

                {/* Other awards */}
                <div className="mt-4 pt-4 border-t border-white/5 space-y-2 text-xs">
                  {statistics?.sixerKing?.name && (
                    <div className="flex justify-between text-gray-400">
                      <span>💥 Sixer King</span>
                      <span className="text-white font-bold">
                        {statistics.sixerKing.name} — {statistics.sixerKing.sixes ?? 0} sixes
                      </span>
                    </div>
                  )}
                  {statistics?.fourKing?.name && <div className="flex justify-between text-gray-400"><span>🔥 Four King</span><span className="text-white font-bold">{statistics.fourKing.name} — {statistics.fourKing.fours ?? 0} fours</span></div>}
                  {(statistics?.highestStrikeRate?.name || statistics?.bestStrikeRate?.name) && (
                    <div className="flex justify-between text-gray-400">
                      <span>⚡ Best SR</span>
                      <span className="text-white font-bold">
                        {(statistics.highestStrikeRate || statistics.bestStrikeRate).name} — {(statistics.highestStrikeRate || statistics.bestStrikeRate).strikeRate}
                      </span>
                    </div>
                  )}
                  {statistics?.bestEconomy?.name && <div className="flex justify-between text-gray-400"><span>🎳 Best Eco</span><span className="text-white font-bold">{statistics.bestEconomy.name} — {statistics.bestEconomy.economy}</span></div>}
                </div>
              </div>
            );
          })()}

          <div className="card p-6 border-white/5 bg-gray-900/50">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Batsmen</h3>
              <button onClick={() => setShowRoster('bat')} disabled={saving || !inningsIsOpen || activeBatsmen.length >= 2} className="bg-brand-500/10 text-brand-400 text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-brand-500/20 transition-all disabled:opacity-20">+ ROSTER</button>
            </div>
            <div className="space-y-3">
              {activeBatsmen.map(b => (
                <div key={b.name} className={`flex items-center justify-between p-4 rounded-2xl transition-all ${
                  b.name === batterName ? "bg-brand-500 text-white shadow-lg shadow-brand-900/40" : "bg-white/5 hover:bg-white/10 border border-white/5"
                } ${saving ? "opacity-60" : ""}`}>
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
                      disabled={saving || !inningsIsOpen}
                      onChange={(value) => { setNewBatsman(value); setNewBatsmanId(""); }}
                      onSelect={p => { setNewBatsman(playerNameOf(p)); setNewBatsmanId(playerIdOf(p)); }}
                      fetchFn={async q => {
                        const localHits = (currentBattingRoster || []).filter((p) =>
                          p?.name?.toLowerCase().includes((q || "").toLowerCase())
                        );
                        const { data } = await playerAPI.getAll({ search: q, team: currentBattingTeam, limit: 8 });
                        const globalHits = Array.isArray(data?.players) ? data.players : [];
                        const combined = [...localHits, ...globalHits];
                        const seen = new Map();
                        return combined.filter((player) => {
                          const key = String(player?._id || player?.playerId || player?.name || "");
                          if (!key || seen.has(key)) return false;
                          seen.set(key, true);
                          return true;
                        });
                      }}
                      placeholder="Search batsman..."
                      inputClass="text-xs py-2"
                      className="flex-1"
                      minChars={1}
                    />
                    <button
                      disabled={saving || !inningsIsOpen || !newBatsman.trim() || !newBatsmanId}
                      onClick={() => { void addFromRoster(
                        { name: newBatsman, _id: newBatsmanId },
                        'bat',
                        { requirePlayerId: true },
                      ); }}
                      className="btn-primary px-4 rounded-xl shrink-0 h-[38px] text-xs disabled:opacity-40"
                    >ADD</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card p-6 border-white/5 bg-gray-900/50">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Current Bowler</h3>
              <button onClick={() => setShowRoster('bwl')} disabled={saving || !canChangeBowler} className="bg-blue-500/10 text-blue-400 text-[10px] font-black px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-20">+ ROSTER</button>
            </div>

            {/* Active bowlers quick-select */}
            {inn?.bowlers?.length > 0 && (
              <div className="space-y-2 mb-4">
                {inn.bowlers.map(b => {
                  const isPreviousOverBowler = inn.balls > 0 && inn.balls % 6 === 0 && b.name === inn.lastOverBowler;
                  const unavailable = saving || !canChangeBowler || isPreviousOverBowler;
                  return <button type="button" key={b.name} disabled={unavailable}
                    onClick={() => {
                      if (unavailable) return;
                      requireBowlerChangeRef.current = false;
                      setBowlerName(b.name);
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      b.name === bowlerName
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30"
                        : "bg-white/5 hover:bg-white/10 border border-white/5 text-gray-300"
                    }`}>
                    <span className="text-xs font-black uppercase tracking-tight">{b.name}</span>
                    <span className="text-[10px] font-mono opacity-60">
                      {b.wickets}/{b.runs} · {Math.floor(b.balls/6)}.{b.balls%6}ov
                    </span>
                  </button>;
                })}
              </div>
            )}

            {/* Add new bowler with autocomplete */}
            <div className="pt-3 border-t border-white/5">
              <div className="text-[10px] text-blue-400 font-bold mb-2 uppercase">Add Bowler</div>
              <div className="flex gap-2 items-start">
                <AutocompleteInput
                  value={newBowler}
                  disabled={saving || !canChangeBowler}
                  onChange={(value) => { setNewBowler(value); setNewBowlerId(""); }}
                  onSelect={p => { setNewBowler(playerNameOf(p)); setNewBowlerId(playerIdOf(p)); }}
                  fetchFn={async q => {
                    const localHits = (currentBowlingRoster || []).filter((p) =>
                      p?.name?.toLowerCase().includes((q || "").toLowerCase())
                    );
                    const { data } = await playerAPI.getAll({ search: q, team: currentBowlingTeam, limit: 8 });
                    const globalHits = Array.isArray(data?.players) ? data.players : [];
                    const combined = [...localHits, ...globalHits];
                    const seen = new Map();
                    return combined.filter((player) => {
                      const key = String(player?._id || player?.playerId || player?.name || "");
                      if (!key || seen.has(key)) return false;
                      seen.set(key, true);
                      return true;
                    });
                  }}
                  placeholder="Search bowler..."
                  inputClass="text-xs py-2"
                  className="flex-1"
                  minChars={1}
                />
                <button
                  disabled={saving || !canChangeBowler || !newBowler.trim() || !newBowlerId}
                  onClick={() => { void addFromRoster(
                    { name: newBowler, _id: newBowlerId },
                    'bwl',
                    { requirePlayerId: true },
                  ); }}
                  className="bg-blue-600 text-white px-4 rounded-xl text-xs font-bold shrink-0 h-[38px] disabled:opacity-40"
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
                <button disabled={saving || !match.canUndo} onClick={undoBall} className="h-10 px-4 rounded-2xl bg-white/5 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500/10 transition-all border border-red-500/20 disabled:opacity-30">↩ Undo</button>
                <button disabled={saving || !match.canRedo} onClick={redoBall} className="h-10 px-4 rounded-2xl bg-white/5 text-blue-400 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/10 transition-all border border-blue-500/20 disabled:opacity-30">↪ Redo</button>
                <div className="h-10 px-6 rounded-2xl bg-brand-500 text-white flex items-center justify-center text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-900/40">Striker: {batterName || "—"}</div>
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-7 gap-4 mb-10">
              {[0, 1, 2, 3, 4, 5, 6].map(r => (
                <button key={r} disabled={saving || !quickScoreReady || (r === 0 && POSITIVE_VALUE_EXTRA_TYPES.has(extraMRMCfier))} onClick={() => { void quickBall(r, extraMRMCfier); }}
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

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 mb-10">
               <button
                 disabled={saving || !inningsIsOpen || activeBatsmen.length !== 2 || !batterName || adjustmentSelected || availableWicketTypes.length === 0}
                 onClick={openWicketModal}
                 className={`sm:col-span-2 h-16 rounded-2xl font-black text-sm shadow-xl transition-all uppercase tracking-widest disabled:opacity-30 ${
                   freeHitPending
                     ? "bg-yellow-400 text-black shadow-yellow-900/20 hover:bg-yellow-300"
                     : "bg-red-600 text-white shadow-red-900/40 hover:bg-red-500"
                 }`}
               >{freeHitPending ? "ADMIN OUT ONLY" : "WICKET / OUT"}</button>
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "wide" ? "" : "wide")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "wide" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>WIDE</button>
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "noBall" ? "" : "noBall")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "noBall" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>NO BALL</button>
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "bye" ? "" : "bye")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "bye" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>BYE</button>
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "legBye" ? "" : "legBye")} className={`h-16 rounded-2xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "legBye" ? "bg-white text-black shadow-xl" : "bg-gray-800 text-gray-400 border border-white/5 hover:bg-gray-700"}`}>LEG BYE</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "bonus" ? "" : "bonus")} className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "bonus" ? "bg-green-600 text-white shadow-lg" : "bg-white/5 text-gray-500 border border-white/5 hover:bg-white/10"}`}>BONUS</button>
               <button disabled={saving || !inningsIsOpen} onClick={() => setExtraMRMCfier(m => m === "penalty" ? "" : "penalty")} className={`h-12 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${extraMRMCfier === "penalty" ? "bg-red-600 text-white shadow-lg" : "bg-white/5 text-gray-500 border border-white/5 hover:bg-white/10"}`}>PENALTY</button>
               <button onClick={declareCurrentInnings} disabled={saving || !inningsIsOpen} className="h-12 rounded-xl bg-orange-600 text-white text-[10px] font-black uppercase shadow-lg shadow-orange-900/20 disabled:opacity-30 hover:bg-orange-500 transition-all">ALL OUT / DECLARE</button>
               <button onClick={() => updateStatus("completed", result)} disabled={saving || match?.status === "completed"} className="h-12 rounded-xl bg-green-600 text-white text-[10px] font-black uppercase shadow-lg shadow-green-900/20 disabled:opacity-30">MARK FINISH</button>
            </div>

            <div className="relative">
              <textarea value={commentary} disabled={saving} onChange={e => setCommentary(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-3xl p-6 text-sm text-white focus:outline-none focus:border-brand-500 transition-all resize-none h-32 disabled:opacity-40"
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
               <input value={result} disabled={saving} onChange={e => setResult(e.target.value)} className="input mb-4 disabled:opacity-40" placeholder="Enter Result Message..." />
               <div className="grid grid-cols-2 gap-3 mb-3">
                  {match.status === "completed" && /tie/i.test(match.result || "") && !match.isSuperOver ? (
                    <button disabled={saving} onClick={beginSuperOver} className="bg-orange-600/10 text-orange-400 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-orange-600/20 disabled:opacity-30">Start Super Over</button>
                  ) : (
                    <button disabled className="bg-red-600/10 text-red-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-50">{match.status === "upcoming" ? "Start via Toss" : match.status}</button>
                  )}
                  <button disabled={saving || match.status === "completed"} onClick={() => updateStatus("completed", result)} className="bg-green-600/10 text-green-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-600/20 disabled:opacity-30">Finalize</button>
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
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => { if (!saving) setShowRoster(null); }} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[2.5rem] p-10 w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-brand-600/20 blur-[80px]" />
            <h2 className="text-3xl font-black text-white mb-2 uppercase italic tracking-tighter">
              {showRoster === 'bat' ? 'Select Batsman' : 'Select Bowler'}
            </h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mb-8">Choose from {showRoster === 'bat' ? currentBattingTeam : currentBowlingTeam} Roster</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
              {(showRoster === 'bat' ? currentBattingRoster : currentBowlingRoster).map(p => {
                const isSelected = (showRoster === 'bat' ? inn?.batsmen : inn?.bowlers)?.some(b => b.name === p.name);
                return (
                  <button key={p._id || p.name} disabled={saving || isSelected} onClick={() => addFromRoster(p, showRoster)}
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
          <div className="absolute inset-0 bg-black/95 backdrop-blur-xl" onClick={() => { if (!saving) setShowWicketModal(false); }} />
          <div className="relative bg-gray-950 border border-white/10 rounded-[3rem] p-12 w-full max-w-lg shadow-2xl overflow-hidden">
            <h2 className="text-4xl font-black text-white mb-8 italic uppercase tracking-tighter">Wicket Analysis</h2>
            
            <div className="space-y-10">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block">Dismissed Player</label>
                <div className="grid grid-cols-2 gap-4">
                  {eligibleDismissedBatsmen.map(b => (
                    <button key={playerIdOf(b) || b.name} disabled={saving} onClick={() => {
                      setOutPlayer(b.name);
                      setOutPlayerId(playerIdOf(b));
                    }}
                      className={`py-5 rounded-3xl text-sm font-black transition-all disabled:opacity-30 ${
                        outPlayer === b.name && (!outPlayerId || outPlayerId === playerIdOf(b))
                          ? "bg-red-600 text-white shadow-xl shadow-red-900/40 scale-105"
                          : "bg-white/5 text-gray-500 hover:bg-white/10"
                      }`}>{b.name.split(' ')[0]}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 block">How it happened</label>
                <div className="grid grid-cols-3 gap-3">
                  {availableWicketTypes.map(t => (
                    <button key={t} disabled={saving} onClick={() => {
                      setWicketType(t);
                      if (STRIKER_ONLY_WICKET_TYPES.has(t)) {
                        setOutPlayer(batterName);
                        setOutPlayerId(playerIdOf(striker));
                      }
                      if (!["runOut", "obstructingField", "hitBallTwice"].includes(t)) setWicketRuns(0);
                      if (!FIELDER_REQUIRED_WICKET_TYPES.has(t)) {
                        setFielderName("");
                        setFielderId("");
                      }
                    }}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-30 ${
                        wicketType === t ? "bg-white text-black" : "bg-white/5 text-gray-500"
                      }`}>{t}</button>
                  ))}
                </div>
              </div>

              {wicketMayIncludeRuns && (
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-3 block">Runs completed</label>
                  <select value={wicketRuns} disabled={saving} onChange={(event) => setWicketRuns(Number(event.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-bold disabled:opacity-40">
                    {[0, 1, 2, 3].map((runs) => <option key={runs} value={runs}>{runs}</option>)}
                  </select>
                </div>
              )}

              {["caught", "stumped", "runOut"].includes(wicketType) && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                  <label className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4 block">Fielder / Helper</label>
                  <AutocompleteInput
                    value={fielderName}
                    disabled={saving}
                    onChange={(value) => { setFielderName(value); setFielderId(""); }}
                    onSelect={p => { setFielderName(playerNameOf(p)); setFielderId(playerIdOf(p)); }}
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

              <button disabled={saving || !wicketSelectionReady || (freeHitPending && !wicketIsNonDelivery)} onClick={() => {
                void quickBall(wicketMayIncludeRuns ? wicketRuns : 0, extraMRMCfier, true, outPlayer, wicketType, fielderName, fielderId);
              }}
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
                      const value = e.target.value;
                      setPollOptions((current) => current.map((option, index) => (
                        index === i ? { ...option, text: value } : option
                      )));
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
