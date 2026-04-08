import React, { useMemo, useState } from 'react';
import { useContent } from '../context/ContentContext';
import { Save, RefreshCw, PenTool, PlayCircle } from 'lucide-react';
import MediaEmbed from '../components/MediaEmbed';

const AdminContent = () => {
  const {
    siteVideos,
    updateVideo,
    defaultVideos,
    isLoadingFromDB,
    refreshSiteVideos,
    lastSyncedAt,
    syncError,
  } = useContent();
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [formData, setFormData] = useState({});
  const safeSiteVideos = useMemo(() => {
    const normalized = Array.isArray(siteVideos) ? siteVideos.filter(Boolean) : [];
    return normalized.length > 0 ? normalized : (defaultVideos || []).filter(Boolean);
  }, [siteVideos, defaultVideos]);

  const handleEdit = (video) => {
    setEditingId(video.id);
    setFormData(video);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSyncRefresh = async () => {
    setIsRefreshing(true);
    const result = await refreshSiteVideos();
    setIsRefreshing(false);

    if (!result?.ok && result?.message) {
      alert(result.message);
    }
  };

  const handleSave = async (id) => {
    setSavingId(id);
    const result = await updateVideo(id, formData);
    setSavingId(null);

    if (!result?.ok) {
      alert(result?.message || 'Failed to update the video. Please try again.');
      return;
    }

    setEditingId(null);
    if (result.persisted === false) {
      alert(result.message || 'Video saved locally only.');
      return;
    }

    alert('Video updated successfully! Check the Home Page to see changes.');
  };

  const handleReset = async (id) => {
    if (window.confirm("Are you sure you want to restore the original default video?")) {
      const defaultVid = defaultVideos.find(v => v.id === id);
      if (defaultVid) {
        setSavingId(id);
        const result = await updateVideo(id, defaultVid);
        setSavingId(null);

        if (!result?.ok) {
          alert(result?.message || 'Failed to restore the default video.');
          return;
        }

        alert(result.persisted === false ? (result.message || 'Default video restored locally only.') : 'Default video restored successfully.');
      }
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: '#1e293b', marginBottom: '0.5rem' }}>Site Content</h1>
        <p style={{ color: '#64748b' }}>Manage the promotional videos displayed on the customer Home Page. You can paste a YouTube, Facebook, or .mp4 link.</p>
        <div style={{ marginTop: '0.9rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <span style={{
            fontSize: '0.85rem',
            color: syncError ? '#b91c1c' : '#475569',
            background: syncError ? '#fee2e2' : '#f8fafc',
            border: `1px solid ${syncError ? '#fecaca' : '#cbd5e1'}`,
            borderRadius: '9999px',
            padding: '0.45rem 0.8rem',
          }}
          >
            {syncError
              ? `Sync warning: ${syncError}`
              : (lastSyncedAt
                ? `Last synced: ${new Date(lastSyncedAt).toLocaleString()}`
                : (isLoadingFromDB ? 'Syncing from cloud...' : 'Cloud sync ready.'))}
          </span>
          <button
            type="button"
            onClick={handleSyncRefresh}
            disabled={isRefreshing || isLoadingFromDB}
            style={{
              background: '#0f172a',
              color: 'white',
              border: 'none',
              padding: '0.5rem 0.95rem',
              borderRadius: '0.65rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh Content'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
        {safeSiteVideos.map((video) => (
          <div key={video?.id} style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PlayCircle size={24} color="#f97316" />
                <h3 style={{ margin: 0 }}>Section {video?.id}</h3>
              </div>
              {editingId !== video?.id ? (
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
              <MediaEmbed
                url={editingId === video?.id ? formData.src : video?.src}
                title={`Section ${video?.id} preview`}
              />
            </div>

            {editingId === video?.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Video URL (YouTube, Facebook, MP4)</label>
                  <input 
                    name="src" 
                    value={formData.src || ''} 
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Title</label>
                  <input 
                    name="title" 
                    value={formData.title || ''}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>Description Text</label>
                  <textarea 
                    name="text" 
                    value={formData.text || ''}
                    onChange={handleChange}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', minHeight: '100px', resize: 'vertical' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button 
                    onClick={() => handleSave(video?.id)}
                    disabled={savingId === video?.id}
                    style={{ flex: 1, background: '#10b981', color: 'white', border: 'none', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  >
                    <Save size={18} /> {savingId === video?.id ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button 
                    onClick={() => setEditingId(null)}
                    disabled={savingId === video?.id}
                    style={{ flex: 1, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.75rem', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#1e293b' }}>{video?.title || `Section ${video?.id}`}</h4>
                <p style={{ color: '#64748b', fontSize: '0.95rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>{video?.text || 'No description provided yet.'}</p>
                
                <button 
                  onClick={() => handleReset(video?.id)}
                  disabled={savingId === video?.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: '#f97316', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}
                >
                  <RefreshCw size={14} /> {savingId === video?.id ? 'Saving...' : 'Restore Default Video'}
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
