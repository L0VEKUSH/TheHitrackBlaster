import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSave, FiX, FiImage } from "react-icons/fi";
import api from "../../services/api";
import { aboutMeAPI } from "../../services/api";

const initialState = {
  heroTitle: "I AM",
  heroName: "LOVEKUSH",
  heroSubtitle: "Developer • Visionary • Sports Enthusiast",
  storyHeading: "Building the Future of Sports Tracking",
  photo: "",
  socialLinks: {
    github: "",
    instagram: "",
    linkedin: ""
  },
  storyParagraphs: [
    "Hi, I'm Lovekush, the mind behind The Hitrack. My journey started with a simple passion for sports and a drive to create something that brings fans closer to the game. I believe that technology should be as exciting as the sport itself.",
    "When I'm not crafting cinematic web interfaces or building real-time scoring engines, you can find me analyzing match tactics, exploring new tech stacks, or pushing the boundaries of what's possible in web development."
  ],
  stats: [
    { label: "Code Commits", value: "500+" },
    { label: "Projects Built", value: "12+" },
    { label: "Matches Scored", value: "100+" }
  ],
  lifestyle: [
    { title: "Pure Innovation", desc: "Always looking for the next big thing in UI/UX and real-time data." },
    { title: "Sports DNA", desc: "A lifelong fan of high-intensity sports, from Cricket to Kabaddi." },
    { title: "Creative Flow", desc: "Believing that code is an art form that should wow the user." },
    { title: "Lish", desc: "The inspiration and anime love that drives my creative journey and pursuit of excellence." }
  ],
  quoteText: "Building technology is like playing a match—you need precision, team spirit, and the hunger to win.",
  quoteAuthor: "— Lovekush"
};

export default function AdminAboutMe() {
  const [formData, setFormData] = useState(initialState);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAboutMe = async () => {
      try {
        const { data } = await aboutMeAPI.get();
        if (data.success && data.data) {
          setFormData({ ...initialState, ...data.data });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAboutMe();
  }, []);

  const [uploading, setUploading] = useState(false);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSocialChange = (name, value) => {
    setFormData((prev) => ({
      ...prev,
      socialLinks: { ...prev.socialLinks, [name]: value }
    }));
  };

  const handleArrayChange = (field, index, key, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((item, idx) => idx === index ? { ...item, [key]: value } : item)
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    try {
      const { data } = await api.post("/upload/image", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (data.success) {
        setFormData((prev) => ({ ...prev, photo: data.imageUrl }));
      }
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Unable to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleParagraphChange = (index, value) => {
    setFormData((prev) => ({
      ...prev,
      storyParagraphs: prev.storyParagraphs.map((paragraph, idx) => idx === index ? value : paragraph)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await aboutMeAPI.update(formData);
      navigate("/admin");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Unable to save About Me content");
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading About Me editor...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Edit About Me</h1>
          <p className="text-sm text-gray-400 mt-2">Update the public About Me page content from the admin panel.</p>
        </div>
        <button
          onClick={() => navigate("/admin")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <FiX /> Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Hero Title</label>
            <input
              name="heroTitle"
              value={formData.heroTitle}
              onChange={(e) => handleChange("heroTitle", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Hero Name</label>
            <input
              name="heroName"
              value={formData.heroName}
              onChange={(e) => handleChange("heroName", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="md:col-span-2 space-y-3">
            <label className="text-sm font-medium text-gray-400">Hero Subtitle</label>
            <input
              name="heroSubtitle"
              value={formData.heroSubtitle}
              onChange={(e) => handleChange("heroSubtitle", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3 md:col-span-2">
            <label className="text-sm font-medium text-gray-400">Photo URL</label>
            <input
              name="photo"
              value={formData.photo}
              onChange={(e) => handleChange("photo", e.target.value)}
              placeholder="https://.../avatar.jpg"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Photo Preview</label>
            <div className="rounded-3xl overflow-hidden bg-gray-950 border border-gray-800 h-28">
              {formData.photo ? (
                <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">No photo URL yet</div>
              )}
            </div>
          </div>
          <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">GitHub URL</label>
              <input
                value={formData.socialLinks.github}
                onChange={(e) => handleSocialChange("github", e.target.value)}
                placeholder="https://github.com/username"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">Instagram URL</label>
              <input
                value={formData.socialLinks.instagram}
                onChange={(e) => handleSocialChange("instagram", e.target.value)}
                placeholder="https://instagram.com/username"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">LinkedIn URL</label>
              <input
                value={formData.socialLinks.linkedin}
                onChange={(e) => handleSocialChange("linkedin", e.target.value)}
                placeholder="https://linkedin.com/in/username"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="space-y-3 md:col-span-2">
            <label className="text-sm font-medium text-gray-400">Photo URL</label>
            <input
              name="photo"
              value={formData.photo}
              onChange={(e) => handleChange("photo", e.target.value)}
              placeholder="https://.../avatar.jpg"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Photo Preview</label>
            <div className="rounded-3xl overflow-hidden bg-gray-950 border border-gray-800 h-28">
              {formData.photo ? (
                <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500 text-sm">No photo yet</div>
              )}
            </div>
          </div>
          <div className="md:col-span-3 grid gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">Upload from Device</label>
              <label className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-lg cursor-pointer transition-colors border border-dashed border-gray-600">
                {uploading ? "Uploading..." : <><FiImage /> Select file</>}
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">GitHub URL</label>
              <input
                value={formData.socialLinks.github}
                onChange={(e) => handleSocialChange("github", e.target.value)}
                placeholder="https://github.com/username"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-400">Instagram URL</label>
              <input
                value={formData.socialLinks.instagram}
                onChange={(e) => handleSocialChange("instagram", e.target.value)}
                placeholder="https://instagram.com/username"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-xl font-semibold text-white">Story Section</div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Story Heading</label>
            <input
              value={formData.storyHeading}
              onChange={(e) => handleChange("storyHeading", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          {formData.storyParagraphs.map((paragraph, index) => (
            <div key={index} className="space-y-3">
              <label className="text-sm font-medium text-gray-400">Paragraph {index + 1}</label>
              <textarea
                rows={3}
                value={paragraph}
                onChange={(e) => handleParagraphChange(index, e.target.value)}
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 resize-none"
              />
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <div className="text-xl font-semibold text-white">Stats</div>
          <div className="grid gap-4 md:grid-cols-3">
            {formData.stats.map((item, index) => (
              <div key={index} className="space-y-3 bg-gray-900 border border-gray-800 rounded-3xl p-4">
                <label className="text-sm font-medium text-gray-400">Label</label>
                <input
                  value={item.label}
                  onChange={(e) => handleArrayChange("stats", index, "label", e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
                <label className="text-sm font-medium text-gray-400">Value</label>
                <input
                  value={item.value}
                  onChange={(e) => handleArrayChange("stats", index, "value", e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="text-xl font-semibold text-white">Lifestyle Blocks</div>
          <div className="grid gap-4 md:grid-cols-2">
            {formData.lifestyle.map((item, index) => (
              <div key={index} className="space-y-3 bg-gray-900 border border-gray-800 rounded-3xl p-4">
                <label className="text-sm font-medium text-gray-400">Title</label>
                <input
                  value={item.title}
                  onChange={(e) => handleArrayChange("lifestyle", index, "title", e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
                />
                <label className="text-sm font-medium text-gray-400">Description</label>
                <textarea
                  rows={3}
                  value={item.desc}
                  onChange={(e) => handleArrayChange("lifestyle", index, "desc", e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 resize-none"
                />
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Quote Text</label>
            <textarea
              rows={3}
              value={formData.quoteText}
              onChange={(e) => handleChange("quoteText", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 resize-none"
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-400">Quote Author</label>
            <input
              value={formData.quoteAuthor}
              onChange={(e) => handleChange("quoteAuthor", e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
        </section>

        <div className="pt-4">
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-3xl font-bold transition-all shadow-lg shadow-brand-600/20"
          >
            <FiSave /> Save About Me
          </button>
        </div>
      </form>
    </div>
  );
}
