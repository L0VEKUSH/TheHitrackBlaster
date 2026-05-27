// src/pages/RegisterPage.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GiCricketBat } from "react-icons/gi";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try { await register(form.name, form.email, form.password); navigate("/"); }
    catch (err) { setError(err.response?.data?.message || "Registration failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <GiCricketBat className="text-brand-400 text-4xl mx-auto mb-2" />
          <h1 className="text-2xl font-extrabold text-white">Create Account</h1>
          <p className="text-gray-400 text-sm mt-1">Join The Hitrack blastertoday</p>
        </div>
        <form onSubmit={handle} className="card p-6 space-y-4">
          {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          {[["Name", "text", "name", "Your full name"], ["Email", "email", "email", "you@example.com"], ["Password", "password", "password", "Min 6 characters"]].map(([l, t, k, ph]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <input type={t} value={form[k]} placeholder={ph}
                onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                className="input" required minLength={k === "password" ? 6 : 1} />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5 disabled:opacity-60">
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <p className="text-center text-gray-500 text-sm mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-400 font-semibold hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
