// server/socket/liveSocket.js
module.exports = (io) => {
  const activeMatches = new Map(); // Track active match rooms

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);
    socket.data.matchRooms = new Set();

    // Join a specific match room for live updates
    socket.on("joinMatch", (matchId, callback) => {
      try {
        const roomId = matchId != null ? String(matchId).trim() : "";
        if (!/^[a-f\d]{24}$/i.test(roomId)) {
          return callback?.({ error: "Invalid match ID" });
        }

        if (socket.data.matchRooms.has(roomId)) return callback?.({ success: true, alreadyJoined: true });
        if (socket.data.matchRooms.size >= 10) return callback?.({ error: "Too many match rooms" });

        socket.join(roomId);
        socket.data.matchRooms.add(roomId);
        
        // Track active watchers per match
        const key = roomId;
        const current = activeMatches.get(key) || 0;
        activeMatches.set(key, current + 1);

        console.log(`   ↳ joined match room: ${roomId} (viewers: ${current + 1})`);
        callback?.({ success: true });
      } catch (err) {
        console.error("❌ Error in joinMatch:", err.message);
        callback?.({ error: err.message });
      }
    });

    socket.on("leaveMatch", (matchId, callback) => {
      try {
        const key = String(matchId).trim();
        if (!socket.data.matchRooms.has(key)) return callback?.({ success: true, alreadyLeft: true });
        socket.leave(key);
        socket.data.matchRooms.delete(key);
        const current = activeMatches.get(key) || 1;
        const updated = Math.max(0, current - 1);
        
        if (updated === 0) {
          activeMatches.delete(key);
        } else {
          activeMatches.set(key, updated);
        }

        console.log(`   ↳ left match room: ${matchId} (viewers: ${updated})`);
        callback?.({ success: true });
      } catch (err) {
        console.error("❌ Error in leaveMatch:", err.message);
        callback?.({ error: err.message });
      }
    });

    socket.on("disconnecting", () => {
      for (const room of socket.data.matchRooms) {
          const current = activeMatches.get(room) || 1;
          const updated = Math.max(0, current - 1);
          if (updated === 0) {
            activeMatches.delete(room);
          } else {
            activeMatches.set(room, updated);
          }
      }
      socket.data.matchRooms.clear();
    });

    socket.on("disconnect", (reason) => {
      console.log("🔌 Client disconnected:", socket.id, `(${reason})`);
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error("❌ Socket error:", socket.id, error);
    });

  });

  // Graceful error handling for broadcast operations
  io.on("error", (error) => {
    console.error("❌ IO error:", error.message);
  });
};
