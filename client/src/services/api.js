// src/services/api.js
import axios from "axios";

const normalizeApiUrl = (url) => {
  if (typeof url !== "string") return url;
  const protocolIndex = url.indexOf("://");
  if (protocolIndex !== -1) {
    const protocol = url.slice(0, protocolIndex + 3);
    const rest = url.slice(protocolIndex + 3).replace(/\/{2,}/g, "/");
    return `${protocol}${rest}`;
  }
  return url.replace(/\/{2,}/g, "/");
};

// Normalize API URL to avoid double-slash and double-/api issues.
// Accept VITE_API_URL as either https://host or https://host/api
const rawApiUrl = import.meta.env.VITE_API_URL || "";
const API_URL = rawApiUrl.trim().replace(/\/+$|\/$/g, "").replace(/\/api$/i, "");
let baseURL = API_URL ? `${API_URL}/api` : "/api";
baseURL = normalizeApiUrl(baseURL);
const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS);
const api = axios.create({
  baseURL,
  // Never leave a scoring control locked forever when a proxy or network drops
  // the response. Individual callers can still override this when necessary.
  timeout: Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 15000,
});

// If you use cookies for auth, enable credentials; otherwise keep it false.
// Uncomment the following line if backend uses cookie-based auth:
// api.defaults.withCredentials = true;

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cs_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;

  if (config && typeof config.url === "string") {
    config.url = normalizeApiUrl(config.url);
  }
  if (config.data && typeof config.data === "object") {
    if (config.data.actionId) config.headers["Idempotency-Key"] = config.data.actionId;
    if (Number.isInteger(Number(config.data.expectedVersion))) {
      config.headers["If-Match-Version"] = String(config.data.expectedVersion);
    }
  }

  return config;
});

// Handle 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("cs_token");
      localStorage.removeItem("cs_user");
    }
    return Promise.reject(err);
  }
);

export default api;

// ── Matches ─────────────────────────────────────────────────
export const matchAPI = {
  getAll:        (params, config = {}) => api.get("/matches", { ...config, params }),
  getLive:       ()             => api.get("/matches/live/all"),
  getById:       (id, config)   => api.get(`/matches/${id}`, config),
  create:        (data)         => api.post("/matches", data),
  update:        (id, data)     => api.put(`/matches/${id}`, data),
  remove:        (id)           => api.delete(`/matches/${id}`),
  setToss:       (id, data)     => api.post(`/matches/${id}/toss`, data),
  getAIPredictions: (id, config = {}) => api.get(`/matches/${id}/ai-predictions`, config),
  updateScore:   (id, data)     => api.post(`/matches/${id}/score`, data),
  addBatsman:    (id, num, data)=> api.post(`/matches/${id}/innings/${num}/batsman`, data),
  addBowler:     (id, num, data)=> api.post(`/matches/${id}/innings/${num}/bowler`, data),
  addCommentary: (id, data)     => api.post(`/matches/${id}/commentary`, data),
  undo:          (id, data = {})=> api.post(`/matches/${id}/undo`, data),
  redo:          (id, data = {})=> api.post(`/matches/${id}/redo`, data),
  setStatus:     (id, data)     => api.put(`/matches/${id}/status`, data),
  startSuperOver:(id, data = {})=> api.post(`/matches/${id}/super-over`, data),
  declareInnings:(id, data = {})=> api.post(`/matches/${id}/declare`, data),
  setManOfTheMatch: (id, data) => api.put(`/matches/${id}/man-of-match`, data),
};

export const pollAPI = {
  getMatchPolls: (matchId, params, config = {}) => api.get(`/polls/match/${matchId}`, { ...config, params }),
  create:        (data)    => api.post("/polls", data),
  vote:          (data)    => api.post("/polls/vote", data),
  resolve:       (pollId, correctOptionId) => api.post(`/polls/${pollId}/resolve`, { correctOptionId }),
  getLeaderboard: (config = {}) => api.get("/polls/leaderboard", config)
};

// ── Players ─────────────────────────────────────────────────
export const playerAPI = {
  getAll:          (params) => api.get("/players", { params }),
  getByNames:      (names)  => api.get("/players/by-names", { params: { names: names.join(",") } }),
  getById:         (id)     => api.get(`/players/${id}`),
  battingRankings: (params) => api.get("/players/rankings/batting", { params }),
  bowlingRankings: (params) => api.get("/players/rankings/bowling", { params }),
  allRounderRankings: (params) => api.get("/players/rankings/allrounder", { params }),
  pointsRankings: (params) => api.get("/players/rankings/points", { params }),
  create:          (data)   => api.post("/players", data),
  update:          (id, data) => api.put(`/players/${id}`, data),
  remove:          (id)     => api.delete(`/players/${id}`),
};

// ── Teams ───────────────────────────────────────────────────
export const teamAPI = {
  getAll:  (params)   => api.get("/teams", { params }),
  getById: (id)       => api.get(`/teams/${id}`),
  create:  (data)     => api.post("/teams", data),
  update:  (id, data) => api.put(`/teams/${id}`, data),
  remove:  (id)       => api.delete(`/teams/${id}`),
  getRankings: (params) => api.get("/teams/rankings", { params }),
};

// ── News ────────────────────────────────────────────────────
export const newsAPI = {
  getAll:  (params)   => api.get("/news", { params }),
  getById: (id)       => api.get(`/news/${id}`),
  create:  (data)     => api.post("/news", data),
  update:  (id, data) => api.put(`/news/${id}`, data),
  remove:  (id)       => api.delete(`/news/${id}`),
};

export const adminAPI = {
  getAll:  ()           => api.get("/admins"),
  getById: (id)         => api.get(`/admins/${id}`),
  create:  (data)       => api.post("/admins", data),
  update:  (id, data)   => api.put(`/admins/${id}`, data),
  remove:  (id)         => api.delete(`/admins/${id}`),
};

// ── Tournaments ─────────────────────────────────────────────
export const tournamentAPI = {
  getAll:       (params)   => api.get("/tournaments", { params }),
  getById:      (id)       => api.get(`/tournaments/${id}`),
  create:       (data)     => api.post("/tournaments", data),
  update:       (id, data) => api.put(`/tournaments/${id}`, data),
  remove:       (id)       => api.delete(`/tournaments/${id}`),
  updatePoints: (id, data) => api.put(`/tournaments/${id}/points`, data),
  getLeaderboards: (id) => api.get(`/tournaments/${id}/leaderboards`),
  rebuildLeaderboards: (id) => api.put(`/tournaments/${id}/leaderboards`),
};

export const aboutMeAPI = {
  get: () => api.get("/about-me"),
  update: (data) => api.put("/about-me", data),
};

// ── Auth ────────────────────────────────────────────────────
export const authAPI = {
  register:   (data) => api.post("/auth/register", data),
  login:      (data) => api.post("/auth/login", data),
  me:         ()     => api.get("/auth/me"),
  updateMe:   (data) => api.put("/auth/me", data),
  adminLogin: (data) => api.post("/auth/admin/login", data),
  adminSetup: (data) => api.post("/auth/admin/setup", data),
  unlockAboutMe: (data) => api.post("/auth/unlock-secret", data),
};
