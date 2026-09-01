// src/hooks/useLiveMatch.js
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { matchAPI } from "../services/api";
import { shouldReplaceMatchState } from "../utils/matchSelectors";

export function useLiveMatch(matchId) {
  const [match, setMatchState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const matchRef = useRef(null);
  const refetchRef = useRef(null);
  const requestedMatchIdRef = useRef(matchId == null ? "" : String(matchId));
  requestedMatchIdRef.current = matchId == null ? "" : String(matchId);

  // Every source passes through one monotonic gate. Newer snapshots replace
  // state wholesale so nested fields from different database versions never mix.
  const acceptSnapshot = useCallback((candidate) => {
    if (!candidate || typeof candidate !== "object") return false;
    const requestedMatchId = requestedMatchIdRef.current;
    if (!shouldReplaceMatchState(matchRef.current, candidate, requestedMatchId)) return false;
    matchRef.current = candidate;
    setMatchState((current) => {
      if (!shouldReplaceMatchState(current, candidate, requestedMatchIdRef.current)) return current;
      return candidate;
    });
    return true;
  }, []);

  const refetch = useCallback(() => {
    if (!refetchRef.current) return Promise.resolve(null);
    return refetchRef.current({ retries: 0, reportFailure: true });
  }, []);

  useEffect(() => {
    if (!matchId) {
      matchRef.current = null;
      setMatchState(null);
      setLoading(false);
      setIsConnected(false);
      return undefined;
    }

    let active = true;
    let fetchController = null;
    const retryTimers = new Set();
    let reconnectAttempts = 0;

    matchRef.current = null;
    setMatchState(null);
    setLoading(true);
    setError(null);
    setIsConnected(false);

    const fetchMatch = async ({ retries = 0, reportFailure = false } = {}) => {
      if (!active) return null;

      // A reconnect/refetch supersedes an older GET and cancels its timeout.
      fetchController?.abort();
      const controller = new AbortController();
      fetchController = controller;

      try {
        const { data } = await matchAPI.getById(matchId, { signal: controller.signal });
        if (!active || controller.signal.aborted) return null;
        const accepted = acceptSnapshot(data.match);
        setError(null);
        setLoading(false);
        return accepted ? data.match : matchRef.current;
      } catch (err) {
        if (!active || controller.signal.aborted || axios.isCancel(err)) return null;

        if (retries > 0) {
          const timer = window.setTimeout(() => {
            retryTimers.delete(timer);
            void fetchMatch({ retries: retries - 1, reportFailure });
          }, 2000);
          retryTimers.add(timer);
          return null;
        }

        if (reportFailure || !matchRef.current) {
          setError(err.response?.data?.message || err.message || "Failed to load match");
        }
        setLoading(false);
        return null;
      } finally {
        if (fetchController === controller) fetchController = null;
      }
    };

    refetchRef.current = fetchMatch;
    void fetchMatch({ retries: 3, reportFailure: true });

    const rawSocketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socketUrl = rawSocketUrl.trim().replace(/\/+$/g, "").replace(/\/api$/i, "") || window.location.origin;
    const socket = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ["polling", "websocket"],
      upgrade: true,
      timeout: 20000,
    });
    socketRef.current = socket;

    const handleConnect = () => {
      if (!active) return;
      setIsConnected(true);
      reconnectAttempts = 0;
      setError(null);
      socket.emit("joinMatch", String(matchId), (callback) => {
        if (callback?.error) {
          console.error("Failed to join match room:", callback.error);
          return;
        }
        // Refetch only after the room join is acknowledged, closing the gap
        // between the HTTP snapshot and live subscription.
        void fetchMatch({ retries: 1, reportFailure: false });
      });
    };

    const handleDisconnect = (reason) => {
      if (!active) return;
      setIsConnected(false);
      console.warn("Socket disconnected:", reason);
    };

    const handleScoreUpdate = (updatedMatch) => {
      if (!active || !updatedMatch) return;
      const updatedId = updatedMatch._id ? String(updatedMatch._id) : "";
      if (updatedId && updatedId !== String(matchId)) return;
      acceptSnapshot(updatedMatch);
    };

    const handleConnectError = (socketError) => {
      console.warn("Live update connection error:", socketError?.message || socketError);
      // Keep rendering a valid GET snapshot while Socket.IO reconnects.
      if (active && !matchRef.current) {
        setError(`Connection error: ${socketError?.message || "Unknown error"}`);
      }
    };

    const handleReconnectAttempt = () => {
      reconnectAttempts += 1;
      if (active && reconnectAttempts > 5 && !matchRef.current) {
        setError("Unable to reconnect to live updates. Please refresh the page.");
      }
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("scoreUpdate", handleScoreUpdate);
    socket.on("connect_error", handleConnectError);
    socket.io.on("reconnect_attempt", handleReconnectAttempt);

    // Socket.IO is primary. While it is unavailable, bounded polling keeps the
    // viewer current without overlapping requests or duplicate intervals.
    const fallbackPoll = window.setInterval(() => {
      if (active && !socket.connected) void fetchMatch({ retries: 0, reportFailure: false });
    }, 5000);

    return () => {
      active = false;
      retryTimers.forEach((timer) => window.clearTimeout(timer));
      retryTimers.clear();
      fetchController?.abort();
      window.clearInterval(fallbackPoll);
      if (refetchRef.current === fetchMatch) refetchRef.current = null;

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("scoreUpdate", handleScoreUpdate);
      socket.off("connect_error", handleConnectError);
      socket.io.off("reconnect_attempt", handleReconnectAttempt);
      if (socket.connected) socket.emit("leaveMatch", String(matchId));
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [acceptSnapshot, matchId]);

  const visibleMatch = shouldReplaceMatchState(null, match, matchId) ? match : null;

  return {
    match: visibleMatch,
    loading: loading || Boolean(match && !visibleMatch),
    error,
    setMatch: acceptSnapshot,
    refetch,
    isConnected,
  };
}
