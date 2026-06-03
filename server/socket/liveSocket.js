// server/socket/liveSocket.js
module.exports = (io) => {
  const activeMatches = new Map(); // Track active match rooms

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Join a specific match room for live updates
    socket.on("joinMatch", (matchId, callback) => {
      try {
        const roomId = matchId != null ? String(matchId).trim() : "";
        if (!roomId) {
          return callback?.({ error: "Invalid match ID" });
        }

        socket.join(roomId);
        
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
        socket.leave(String(matchId));
        
        const key = String(matchId);
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

    socket.on("disconnect", (reason) => {
      console.log("🔌 Client disconnected:", socket.id, `(${reason})`);
      
      // Clean up rooms when client disconnects
      socket.rooms.forEach(room => {
        if (room !== socket.id) {
          const current = activeMatches.get(room) || 1;
          const updated = Math.max(0, current - 1);
          if (updated === 0) {
            activeMatches.delete(room);
          } else {
            activeMatches.set(room, updated);
          }
        }
      });
    });

    // Handle connection errors
    socket.on("error", (error) => {
      console.error("❌ Socket error:", socket.id, error);
    });

    // Handle reconnection
    socket.on("reconnect", () => {
      console.log("🔌 Client reconnected:", socket.id);
    });
  });

  // Graceful error handling for broadcast operations
  io.on("error", (error) => {
    console.error("❌ IO error:", error.message);
  });
};
