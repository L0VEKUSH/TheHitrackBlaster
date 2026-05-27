// src/pages/admin/AdminTournaments.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { tournamentAPI } from "../../services/api";
import Spinner from "../../components/common/Spinner";
import dayjs from "dayjs";

export default function AdminTournaments() {
  const [tournaments, setTournaments] = useState([]);
  const [loading,     setLoading]     = useState(true);

  const load = () => {
    setLoading(true);
    tournamentAPI.getAll().then(({ data }) => setTournaments(data.tournaments || [])).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (id) => {
    if (!confirm("Delete this tournament?")) return;
    await tournamentAPI.remove(id); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-white">Tournaments &amp; Series</h1>
          <p className="text-gray-500 text-sm">{tournaments.length} tournaments</p>
        </div>
        <Link to="/admin/tournaments/new" className="btn-primary">+ Add Tournament</Link>
      </div>
      {loading ? <Spinner /> : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase">
                  <th className="py-3 px-4 text-left">Tournament</th>
                  <th className="py-3 px-4 text-left">Type</th>
                  <th className="py-3 px-4 text-left">Dates</th>
                  <th className="py-3 px-4 text-center">Matches</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tournaments.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-gray-600">
                    No tournaments yet. <Link to="/admin/tournaments/new" className="text-brand-400">Add one</Link>
                  </td></tr>
                )}
                {tournaments.map(t => (
                  <tr key={t._id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {t.logo ? <img src={t.logo} alt="" className="w-8 h-8 object-contain"/> : <span className="text-xl">🏆</span>}
                        <div>
                          <div className="font-semibold text-white">{t.name}</div>
                          {t.host && <div className="text-gray-500 text-xs">{t.host}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4"><span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded capitalize">{t.type}</span></td>
                    <td className="py-3 px-4 text-gray-400 text-xs">
                      {t.startDate ? dayjs(t.startDate).format("D MMM YY") : "—"}
                      {t.endDate ? ` → ${dayjs(t.endDate).format("D MMM YY")}` : ""}
                    </td>
                    <td className="py-3 px-4 text-center text-gray-400 font-mono">{t.matches?.length || 0}</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${t.isActive ? "bg-green-900/40 text-green-400" : "bg-gray-700 text-gray-400"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/admin/tournaments/${t._id}/edit`} className="text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 px-2 py-1 rounded">Edit</Link>
                        <button onClick={() => remove(t._id)} className="text-xs bg-red-900/30 text-red-500 hover:bg-red-900 px-2 py-1 rounded">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
