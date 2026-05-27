// src/services/api.js
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "";
const api = axios.create({ baseURL: `${API_URL}/api` });

// Attach token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cs_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  getAll:        (params)       => api.get("/matches", { params }),
  getLive:       ()             => api.get("/matches/live/all"),
  getById:       (id)           => api.get(`/matches/${id}`),
  create:        (data)         => api.post("/matches", data),
  update:        (id, data)     => api.put(`/matches/${id}`, data),
  remove:        (id)           => api.delete(`/matches/${id}`),
  setToss:       (id, data)     => api.post(`/matches/${id}/toss`, data),
  getAIPredictions: (id)        => api.get(`/matches/${id}/ai-predictions`),
  updateScore:   (id, data)     => api.post(`/matches/${id}/score`, data),
  addBatsman:    (id, num, data)=> api.post(`/matches/${id}/innings/${num}/batsman`, data),
  addBowler:     (id, num, data)=> api.post(`/matches/${id}/innings/${num}/bowler`, data),
  addCommentary: (id, data)     => api.post(`/matches/${id}/commentary`, data),
  undo:          (id)           => api.post(`/matches/${id}/undo`),
  setStatus:     (id, data)     => api.put(`/matches/${id}/status`, data),
  startSuperOver:(id)           => api.post(`/matches/${id}/super-over`),
  declareInnings:(id)           => api.post(`/matches/${id}/declare`),
  setManOfTheMatch: (id, data) => api.put(`/matches/${id}/man-of-match`, data),
};

export const pollAPI = {
  getMatchPolls: (matchId, params) => api.get(`/polls/match/${matchId}`, { params }),
  create:        (data)    => api.post("/polls", data),
  vote:          (data)    => api.post("/polls/vote", data),
  resolve:       (pollId, correctOptionId) => api.post(`/polls/${pollId}/resolve`, { correctOptionId }),
  getLeaderboard: ()       => api.get("/polls/leaderboard")
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
