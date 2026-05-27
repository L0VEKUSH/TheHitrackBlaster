// src/pages/admin/AdminNewsForm.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { newsAPI } from "../../services/api";

const CATS = ["match","series","player","team","general","ranking"];

function F({ label, value, onChange, placeholder="", type="text" }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)} className="input" />
    </div>
  );
}

export default function AdminNewsForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    title:"", summary:"", content:"", image:"", author:"",
    category:"general", tags:"", isPublished:true, isFeatured:false,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    if (isEdit) {
      newsAPI.getById(id).then(({ data }) => {
        const n = data.news;
        setForm({
          title: n.title||"", summary: n.summary||"", content: n.content||"",
          image: n.image||"", author: n.author||"",
          category: n.category||"general",
          tags: (n.tags||[]).join(", "),
          isPublished: !!n.isPublished, isFeatured: !!n.isFeatured,
        });
      });
    }
  }, [id]);

  const set = (k,v) => setForm(p => ({...p, [k]:v}));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.content) { setError("Title and content are required"); return; }
    setSaving(true); setError("");
    try {
      const payload = {
        ...form,
        tags: form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      };
      if (isEdit) await newsAPI.update(id, payload);
      else        await newsAPI.create(payload);
      navigate("/admin/news");
    } catch (err) {
      setError(err.response?.data?.message || "Save failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate("/admin/news")} className="text-gray-400 hover:text-white text-sm">← Back</button>
        <h1 className="text-xl font-extrabold text-white">{isEdit ? "Edit Article" : "Write Article"}</h1>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="bg-red-900/30 border border-red-700 text-red-400 text-sm px-3 py-2 rounded-lg">{error}</div>}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="label">Title *</label>
            <input value={form.title} onChange={e => set("title",e.target.value)}
              className="input text-base" placeholder="Article title..." />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={e => set("category",e.target.value)} className="input">
                {CATS.map(c => <option key={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <F label="Author" value={form.author} onChange={v => set("author",v)} placeholder="Admin" />
            <div className="col-span-2">
              <F label="Image URL" value={form.image} onChange={v => set("image",v)} placeholder="https://..." />
            </div>
            <div className="col-span-2">
              <F label="Tags (comma separated)" value={form.tags} onChange={v => set("tags",v)} placeholder="cricket, india, t20" />
            </div>
          </div>
          <div>
            <label className="label">Summary</label>
            <textarea value={form.summary} onChange={e => set("summary",e.target.value)}
              className="input h-16 resize-none" placeholder="Brief summary (shown in cards)..." />
          </div>
          <div>
            <label className="label">Content *</label>
            <textarea value={form.content} onChange={e => set("content",e.target.value)}
              className="input h-64 resize-y font-mono text-sm" placeholder="Full article content..." />
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isPublished} onChange={e => set("isPublished",e.target.checked)}
                className="w-4 h-4 accent-brand-500" />
              <span className="text-gray-300 text-sm">Published</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isFeatured} onChange={e => set("isFeatured",e.target.checked)}
                className="w-4 h-4 accent-brand-500" />
              <span className="text-gray-300 text-sm">Featured</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
            {saving ? "Saving…" : isEdit ? "Update Article" : "Publish Article"}
          </button>
          <button type="button" onClick={() => navigate("/admin/news")} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </div>
  );
}
