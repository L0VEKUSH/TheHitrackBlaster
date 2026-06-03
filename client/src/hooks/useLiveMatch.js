// src/hooks/useLiveMatch.js
import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import { matchAPI } from "../services/api";

export function useLiveMatch(matchId) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const retryCountRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!matchId) return;

    // Initial fetch with retry
    const fetchMatch = async (retries = 3) => {
      try {
        const { data } = await matchAPI.getById(matchId);
        if (isMountedRef.current) {
          setMatch(data.match);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchMatch(retries - 1), 2000);
        } else {
          if (isMountedRef.current) {
            setError(err.response?.data?.message || err.message || "Failed to load match");
            setLoading(false);
          }
        }
      }
    };

    fetchMatch();

    // Socket connection with error handling
    const rawSocketUrl = import.meta.env.VITE_API_URL || window.location.origin;
    const socketUrl = rawSocketUrl.trim().replace(/\/+$/g, "").replace(/\/api$/i, "") || window.location.origin;

    // Polling first — Render and some proxies close WebSocket before it is established
    socketRef.current = io(socketUrl, {
      path: "/socket.io",
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      transports: ["polling", "websocket"],
      upgrade: true,
      timeout: 20000,
    });

    // Connection handlers
    const handleConnect = () => {
      if (isMountedRef.current) {
        setIsConnected(true);
        retryCountRef.current = 0;
        socketRef.current?.emit("joinMatch", String(matchId), (callback) => {
          if (callback?.error) {
            console.error("Failed to join match room:", callback.error);
          }
        });
      }
    };

    const handleDisconnect = (reason) => {
      if (isMountedRef.current) {
        setIsConnected(false);
        console.warn("Socket disconnected:", reason);
        // Auto-reconnect is handled by Socket.IO config
      }
    };

    const handleScoreUpdate = (updatedMatch) => {
      if (!isMountedRef.current || !updatedMatch) return;
      // Live score payloads often omit statistics; keep previous awards/stats
      setMatch((prev) => {
        const hasStats =
          updatedMatch.statistics &&
          typeof updatedMatch.statistics === "object" &&
          Object.keys(updatedMatch.statistics).length > 0;
        return {
          ...updatedMatch,
          statistics: hasStats ? updatedMatch.statistics : prev?.statistics,
        };
      });
    };

    const handleError = (error) => {
      console.error("Socket error:", error);
      if (isMountedRef.current) {
        setError(`Connection error: ${error?.message || "Unknown error"}`);
      }
    };

    const handleReconnectAttempt = () => {
      retryCountRef.current++;
      if (retryCountRef.current > 5) {
        if (isMountedRef.current) {
          setError("Unable to reconnect to live updates. Please refresh the page.");
        }
      }
    };

    // Register listeners
    socketRef.current.on("connect", handleConnect);
    socketRef.current.on("disconnect", handleDisconnect);
    socketRef.current.on("scoreUpdate", handleScoreUpdate);
    socketRef.current.on("error", handleError);
    socketRef.current.on("reconnect_attempt", handleReconnectAttempt);

    const socket = socketRef.current;

    // Cleanup
    return () => {
      if (!socket) return;
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("scoreUpdate", handleScoreUpdate);
      socket.off("error", handleError);
      socket.off("reconnect_attempt", handleReconnectAttempt);
      if (socket.connected) {
        socket.emit("leaveMatch", String(matchId));
      }
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [matchId]);

  return { match, loading, error, setMatch, isConnected };
}
