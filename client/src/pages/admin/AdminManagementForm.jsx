import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { FiSave, FiX, FiImage } from "react-icons/fi";

const AdminManagementForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    image: "",
    bio: "",
    displayOrder: 0,
    socialLinks: {
      twitter: "",
      linkedin: "",
      instagram: ""
    }
  });

  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (isEdit) {
      const fetchMember = async () => {
        try {
          const { data } = await api.get(`/management/${id}`);
          if (data.success) {
            setFormData(data.data);
          }
        } catch (err) {
          console.error(err);
          alert("Error fetching member details");
        } finally {
          setLoading(false);
        }
      };
      fetchMember();
    }
  }, [id, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await api.put(`/management/${id}`, formData);
      } else {
        await api.post("/management", formData);
      }
      navigate("/admin/management");
    } catch (err) {
      alert(err.response?.data?.message || "Error saving member");
    }
  };

  const [uploading, setUploading] = useState(false);

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
        setFormData(prev => ({ ...prev, image: data.imageUrl }));
      }
    } catch (err) {
      console.error(err);
      alert("Error uploading image");
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("social.")) {
      const socialField = name.split(".")[1];
      setFormData(prev => ({
        ...prev,
        socialLinks: { ...prev.socialLinks, [socialField]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-400">Loading form...</div>;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">{isEdit ? "Edit Member" : "Add New Member"}</h1>
        <button 
          onClick={() => navigate("/admin/management")}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <FiX /> Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Full Name</label>
            <input 
              required
              type="text" 
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
              placeholder="e.g. John Doe"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Role / Designation</label>
            <input 
              required
              type="text" 
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
              placeholder="e.g. CEO & Founder"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">Profile Image</label>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  name="image"
                  value={formData.image}
                  onChange={handleChange}
                  className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
                  placeholder="https://example.com/photo.jpg or upload below"
                />
              </div>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden" 
                  id="image-upload"
                />
                <label 
                  htmlFor="image-upload"
                  className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg cursor-pointer transition-colors border border-dashed border-gray-600"
                >
                  {uploading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </span>
                  ) : (
                    <>
                      <FiImage /> Upload from Device
                    </>
                  )}
                </label>
              </div>
            </div>

            {formData.image && (
              <div className="w-32 h-32 rounded-xl bg-gray-900 overflow-hidden border border-gray-800 shadow-xl">
                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-400">Biography</label>
          <textarea 
            name="bio"
            rows="4"
            value={formData.bio}
            onChange={handleChange}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors resize-none"
            placeholder="A short description about the person..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Twitter URL</label>
            <input 
              type="text" 
              name="social.twitter"
              value={formData.socialLinks?.twitter}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">LinkedIn URL</label>
            <input 
              type="text" 
              name="social.linkedin"
              value={formData.socialLinks?.linkedin}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-400">Instagram URL</label>
            <input 
              type="text" 
              name="social.instagram"
              value={formData.socialLinks?.instagram}
              onChange={handleChange}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        </div>

        <div className="w-32 space-y-2">
          <label className="text-sm font-medium text-gray-400">Display Order</label>
          <input 
            type="number" 
            name="displayOrder"
            value={formData.displayOrder}
            onChange={handleChange}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <div className="pt-4">
          <button 
            type="submit"
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 rounded-lg font-bold transition-all shadow-lg shadow-brand-600/20"
          >
            <FiSave /> {isEdit ? "Update Member" : "Save Member"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminManagementForm;
