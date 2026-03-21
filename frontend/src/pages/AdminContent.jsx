import React, { useState } from 'react';
import { useContent } from '../context/ContentContext';
import { Save, RefreshCw, PenTool, PlayCircle } from 'lucide-react';
import ReactPlayer from 'react-player';

const VideoPreview = ({ url }) => {
  if (!url) return null;
  
  // Custom intercept for Facebook links to bypass react-player's strict regex
  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    const fbIframeSrc = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0`;
    return (
      <iframe 
        src={fbIframeSrc}
        width="100%" 
        height="100%" 
        style={{ border: 'none', overflow: 'hidden' }} 
        scrolling="no" 
        frameBorder="0" 
        allowFullScreen={true} 
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" 
      />
    );
  }

  // Fallback to ReactPlayer for YouTube, Vimeo, and raw MP4s
  return <ReactPlayer url={url} controls width="100%" height="100%" />;
};

const AdminContent = () => {
  const { siteVideos, updateVideo, defaultVideos } = useContent();
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({});

  const handleEdit = (video) => {
    setEditingId(video.id);
    setFormData(video);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = (id) => {
    updateVideo(id, formData);
    setEditingId(null);
    alert('Video updated successfully! Check the Home Page to see changes.');
  };

  const handleReset = (id) => {
    if (window.confirm("Are you sure you want to restore the original default video?")) {
      const defaultVid = defaultVideos.find(v => v.id === id);
      if (defaultVid) {
        updateVideo(id, defaultVid);
      }
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#1e293b', marginBottom: '0.5rem' }}>Site Content</h1>
        <p style={{ color: '#64748b' }}>Manage the promotional videos displayed on the customer Home Page. You can paste a YouTube, Facebook, or .mp4 link.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>
        {siteVideos.map(video => (
          <div key={video.id} style={{ 
            background: 'white', 
            borderRadius: '1rem', 
            padding: '1.5rem', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PlayCircle size={24} color="#f97316" />
                <h3 style={{ margin: 0 }}>Section {video.id}</h3>
              </div>
              {editingId !== video.id ? (
                <button 
                  onClick={() => handleEdit(video)}
                  style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '0.5rem', borderRadius: '0.5rem', cursor: 'pointer' }}
                >
                  <PenTool size={16} color="#64748b" />
                </button>
              ) : null}
            </div>

            {/* Video Preview */}
            <div style={{ 
              width: '100%', 
              height: '300px', 
              background: '#0f172a', 
              borderRadius: '0.5rem', 
              overflow: 'hidden',
              marginBottom: '1.5rem'
            }}>
              <VideoPreview url={editingId === video.id ? formData.src : video.src} />
            </div>

            {editingId === video.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Video URL (YouTube, Facebook, MP4)</label>
                  <input 
                    name="src" 
                    value={formData.src} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Title</label>
                  <input 
                    name="title" 
                    value={formData.title} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Description Text</label>
                  <textarea 
                    name="text" 
                    value={formData.text} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', minHeight: '100px', resize: 'vertical' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button 
                    onClick={() => handleSave(video.id)}
                    style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  >
                    <Save size={18} /> Save Changes
                  </button>
                  <button 
                    onClick={() => setEditingId(null)}
                    style={{ flex: 1, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#1e293b' }}>{video.title}</h4>
                <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>{video.text}</p>
                
                <button 
                  onClick={() => handleReset(video.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: '#f97316', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
                >
                  <RefreshCw size={14} /> Restore Default Video
                </button>
              </div>
            )}

          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminContent;
