import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Keep the development server local and reject cross-origin reads from
    // arbitrary websites. Production assets are served by the deployment host.
    host: "127.0.0.1",
    port: 5173,
    cors: {
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"]
    },
    proxy: {
      "/api":       { target: "http://localhost:5000", changeOrigin: true },
      "/uploads":   { target: "http://localhost:5000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:5000", ws: true }
    }
  },
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        }
      }
    }
  }
});
