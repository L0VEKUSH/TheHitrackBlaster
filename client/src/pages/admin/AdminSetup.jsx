// src/pages/admin/AdminSetup.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authAPI } from "../../services/api";
import { GiCricketBat } from "react-icons/gi";

export default function AdminSetup() {
  const [form, setForm] = useState({ name:"", email:"", password:"", setupSecret:"" });
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const { data } = await authAPI.adminSetup(form);
      localStorage.setItem("cs_token", data.token);
      localStorage.setItem("cs_admin", JSON.stringify(data.admin));
      navigate("/admin");
    } catch (err) { setError(err.response?.data?.message || "Setup failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <GiCricketBat className="text-brand-400 text-5xl mx-auto mb-3"/>
          <h1 className="text-2xl font-extrabold text-white">First Time Setup</h1>
          <p className="text-gray-500 text-sm mt-1">Create your superadmin account</p>
        </div>
        <form onSubmit={handle} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
          {[["Name","text","name","Admin Name"],["Email","email","email","admin@example.com"],["Password","password","password","Min 6 characters"],["Setup Secret","password","setupSecret","Enter secret from .env"]].map(([l,t,k,ph]) => (
            <div key={k}>
              <label className="label">{l}</label>
              <input type={t} value={form[k]} placeholder={ph}
                onChange={e => setForm(p => ({...p,[k]:e.target.value}))}
                className="input" required />
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 disabled:opacity-60">
            {loading ? "Creating…" : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
