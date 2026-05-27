// src/pages/admin/AdminLogin.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { GiCricketBat } from "react-icons/gi";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { adminLogin } = useAuth();
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await adminLogin(email, password);
      navigate("/admin");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid credentials");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <GiCricketBat className="text-brand-400 text-5xl mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-white">Admin Panel</h1>
          <p className="text-gray-500 text-sm mt-1">The Hitrack blasterAdministration</p>
        </div>
        <form onSubmit={handle} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="label">Admin Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input" placeholder="admin@example.com" required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="input" placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading}
            className="btn-primary w-full justify-center py-2.5 text-sm disabled:opacity-60">
            {loading ? "Signing in…" : "Sign In to Admin"}
          </button>
        </form>
        <p className="text-center text-gray-600 text-xs mt-4">
          First time?{" "}
          <a href="/admin/setup" className="text-brand-400 hover:underline">Setup admin account</a>
        </p>
      </div>
    </div>
  );
}
