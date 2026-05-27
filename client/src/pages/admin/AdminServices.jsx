import { useEffect, useState } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiBox, FiActivity, FiImage, FiSearch } from "react-icons/fi";

const initialServices = [
  { id: 1, title: "Our Products", type: "Product", status: "Active", items: 12 },
  { id: 2, title: "Our Services", type: "Service", status: "Active", items: 8 },
  { id: 3, title: "Sports Gallery", type: "Media", status: "Active", items: 145 }
];

export default function AdminServices() {
  const [services, setServices] = useState(() => {
    try {
      const raw = localStorage.getItem("admin_services");
      return raw ? JSON.parse(raw) : initialServices;
    } catch {
      return initialServices;
    }
  });
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", type: "Service", status: "Active", items: 0 });

  useEffect(() => {
    localStorage.setItem("admin_services", JSON.stringify(services));
  }, [services]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", type: "Service", status: "Active", items: 0 });
    setModalOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s.id);
    setForm({ title: s.title, type: s.type, status: s.status, items: s.items });
    setModalOpen(true);
  };

  const save = () => {
    if (!form.title) return alert("Title required");
    if (editing) {
      setServices(prev => prev.map(p => p.id === editing ? { ...p, ...form } : p));
    } else {
      const id = Date.now();
      setServices(prev => [{ id, ...form }, ...prev]);
    }
    setModalOpen(false);
  };

  const remove = (id) => {
    if (!confirm("Delete this facility?")) return;
    setServices(prev => prev.filter(s => s.id !== id));
  };

  const filtered = services.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || s.type.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white uppercase italic tracking-tight">Services Management</h1>
          <p className="text-[10px] text-brand-500 font-bold uppercase tracking-widest mt-1">Manage Products, Services & Gallery</p>
        </div>
        <button onClick={openNew} className="bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all shadow-glow-orange">
          <FiPlus size={16} /> Add New Facility
        </button>
      </div>

      {/* Stats Cards (static counts derived from services) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: "Total Products", val: services.filter(s => s.type === "Product").length.toString(), icon: <FiBox />, color: "text-blue-500" },
          { label: "Active Services", val: services.filter(s => s.status === "Active").length.toString(), icon: <FiActivity />, color: "text-brand-500" },
          { label: "Gallery Assets", val: services.filter(s => s.type === "Media").reduce((a,c)=>a+(Number(c.items)||0),0).toString(), icon: <FiImage />, color: "text-purple-500" }
        ].map(s => (
          <div key={s.label} className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">{s.label}</div>
              <div className="text-3xl font-black text-white italic">{s.val}</div>
            </div>
            <div className={`text-2xl ${s.color} bg-white/5 p-4 rounded-2xl`}>{s.icon}</div>
          </div>
        ))}
      </div>

      {/* Services List */}
      <div className="bg-white/5 border border-white/5 rounded-[2rem] overflow-hidden">
        <div className="p-8 border-b border-white/5 flex items-center justify-between">
           <div className="relative w-full max-w-xs">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={query} onChange={e=>setQuery(e.target.value)} type="text" placeholder="Search facilities..." className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-12 pr-4 text-xs text-white outline-none focus:border-brand-500 transition-all" />
           </div>
        </div>

        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
              <th className="px-8 py-6">Facility Name</th>
              <th className="px-8 py-6">Type</th>
              <th className="px-8 py-6">Status</th>
              <th className="px-8 py-6">Items/Assets</th>
              <th className="px-8 py-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map(s => (
              <tr key={s.id} className="group hover:bg-white/[0.02] transition-colors">
                <td className="px-8 py-6 font-black text-white uppercase italic text-sm">{s.title}</td>
                <td className="px-8 py-6">
                   <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">{s.type}</span>
                </td>
                <td className="px-8 py-6">
                   <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.status==="Active"?"bg-green-500 animate-pulse":"bg-gray-500"}`} />
                      <span className={`text-[10px] font-black uppercase tracking-widest ${s.status==="Active"?"text-green-500":"text-gray-400"}`}>{s.status}</span>
                   </div>
                </td>
                <td className="px-8 py-6 text-sm font-bold text-gray-500">{s.items}</td>
                <td className="px-8 py-6 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={()=>openEdit(s)} className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all hover:scale-110"><FiEdit2 size={14} /></button>
                    <button onClick={()=>remove(s.id)} className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-red-500 transition-all hover:scale-110"><FiTrash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Info Note */}
      <div className="bg-brand-500/10 border border-brand-500/20 p-8 rounded-[2rem] flex items-center gap-6">
         <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center text-2xl text-white shrink-0">
            <FiPlus />
         </div>
         <div>
            <h3 className="text-lg font-black text-white uppercase italic tracking-tight mb-2">Facility Expansion Hub</h3>
            <p className="text-gray-400 text-xs font-medium leading-relaxed">
              This module allows you to dynamically expand the "Other Services" page. You can add new product catalogs, service menus, and photo galleries without writing a single line of code.
            </p>
         </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80" onClick={()=>setModalOpen(false)} />
          <div className="relative bg-gray-950 border border-white/10 rounded-2xl p-8 max-w-md w-full z-10">
            <h3 className="text-lg font-bold mb-4">{editing?"Edit Facility":"Add Facility"}</h3>
            <div className="space-y-3">
              <label className="label">Title</label>
              <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} className="input w-full" />
              <label className="label">Type</label>
              <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} className="input w-full">
                <option>Service</option>
                <option>Product</option>
                <option>Media</option>
              </select>
              <label className="label">Status</label>
              <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} className="input w-full">
                <option>Active</option>
                <option>Inactive</option>
              </select>
              <label className="label">Items / Assets</label>
              <input type="number" value={form.items} onChange={e=>setForm(f=>({...f,items:parseInt(e.target.value||0)}))} className="input w-full" />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={()=>setModalOpen(false)} className="btn-ghost">Cancel</button>
              <button onClick={save} className="btn-primary">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
