import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, CircleAlert, Info, Link2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { isProfileImageUrl, readImageFileAsDataUrl, validateImageFile } from '../utils/profileImages';
import './AdminProfilePhoto.css';

const AdminProfilePhoto = ({ triggerRef, onClose }) => {
  const { profile, session, updateMyProfile } = useAuth();
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const selectionVersion = useRef(0);
  const savingRef = useRef(false);
  const [draft, setDraft] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const logoUrl = resolveAssetUrl('logo.png');
  const savedPhoto = profile?.avatarUrl || logoUrl;
  const previewUrl = draft || savedPhoto;
  const username = profile?.username || profile?.fullName || 'Administrator';
  const hasAccess = profile?.role === 'admin' && profile?.id === session?.user?.id && Boolean(session?.access_token);
  const previewReady = previewResult?.source === previewUrl && previewResult?.loaded;
  const previewFailed = previewResult?.source === previewUrl && !previewResult?.loaded;

  useEffect(() => {
    const panel = dialogRef.current;
    const trigger = triggerRef.current;
    const selection = selectionVersion;
    if (!panel || !trigger || !hasAccess) return undefined;

    const positionPanel = () => {
      const anchor = trigger.closest('.admin-user-info').getBoundingClientRect();
      const gutter = 12;
      const width = Math.min(380, window.innerWidth - gutter * 2);
      const isDesktop = window.innerWidth > 1024;
      const left = isDesktop
        ? Math.min(anchor.right + 16, window.innerWidth - width - gutter)
        : (window.innerWidth - width) / 2;
      const top = isDesktop
        ? Math.max(gutter, Math.min(anchor.top, window.innerHeight - panel.offsetHeight - gutter))
        : Math.max(gutter, Math.min(anchor.bottom + 10, window.innerHeight - 160));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${window.innerHeight - top - gutter}px`;
    };
    const closeAndRestoreFocus = () => {
      onClose();
      trigger.focus({ preventScroll: true });
    };
    const handleOutside = (event) => {
      if (!panel.contains(event.target) && !trigger.contains(event.target)) onClose();
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeAndRestoreFocus();
      }
    };
    const handleFocus = (event) => {
      if (!panel.contains(event.target) && !trigger.contains(event.target)) onClose();
    };
    const observer = new ResizeObserver(positionPanel);
    observer.observe(panel);
    positionPanel();
    panel.focus({ preventScroll: true });
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
    return () => {
      selection.current++;
      observer.disconnect();
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', positionPanel);
      window.removeEventListener('scroll', positionPanel, true);
    };
  }, [hasAccess, onClose, triggerRef]);

  if (!hasAccess) return null;

  const clearDraft = () => {
    selectionVersion.current++;
    setDraft(null);
    setImageUrl('');
    setIsReading(false);
    setError('');
    setNotice('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const selectFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const version = ++selectionVersion.current;
    setError('');
    setNotice('');
    setIsReading(true);
    try {
      validateImageFile(file);
      const result = await readImageFileAsDataUrl(file);
      if (version !== selectionVersion.current) return;
      setDraft(result);
      setImageUrl('');
    } catch (nextError) {
      if (version !== selectionVersion.current) return;
      setDraft(null);
      setImageUrl('');
      setError(nextError.message || 'Unable to read the selected image.');
      if (fileRef.current) fileRef.current.value = '';
    } finally {
      if (version === selectionVersion.current) setIsReading(false);
    }
  };

  const savePhoto = async (event) => {
    event.preventDefault();
    if (savingRef.current || isReading || !draft) return;
    setError('');
    setNotice('');
    if (!draft.startsWith('data:image/') && !isProfileImageUrl(draft)) {
      setError('Enter a valid HTTP or HTTPS image URL.');
      return;
    }
    if (!previewReady) {
      setError('Choose an image that loads in the preview before saving.');
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
      const saved = await updateMyProfile({ avatarUrl: draft.trim() });
      if (!saved?.id) throw new Error('Please sign in again before saving your photo.');
      clearDraft();
      setNotice('Your profile photo was saved.');
    } catch (nextError) {
      setError(nextError.message || 'Unable to save your profile photo. Please try again.');
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  return createPortal(
    <section id="admin-profile-photo" ref={dialogRef} className="admin-profile-photo" role="dialog" aria-labelledby="admin-profile-photo-title" tabIndex={-1}>
      <header className="admin-profile-photo-heading">
        <span className="admin-profile-photo-camera"><Camera size={21} aria-hidden="true" /></span>
        <h2 id="admin-profile-photo-title">Admin Profile Photo</h2>
        <button type="button" className="admin-profile-photo-close" aria-label="Close admin profile photo" onClick={() => {
          onClose();
          triggerRef.current?.focus({ preventScroll: true });
        }}><X size={20} aria-hidden="true" /></button>
      </header>

      <div className="admin-profile-photo-account">
        <img src={savedPhoto} alt={`${username}'s saved profile`} onError={(event) => {
          if (event.currentTarget.getAttribute('src') !== logoUrl) event.currentTarget.src = logoUrl;
        }} />
        <div><strong>{username}</strong><span>Administrator</span></div>
      </div>
      <p className="admin-profile-photo-instructions">Upload a PNG/JPG or paste an image link.</p>

      <form onSubmit={savePhoto} noValidate aria-busy={isSaving}>
        <div className="admin-profile-photo-preview">
          {previewFailed ? <Camera size={32} aria-label="Image preview unavailable" /> : (
            <img key={previewUrl} src={previewUrl} alt="Selected profile photo preview"
              onLoad={() => setPreviewResult({ source: previewUrl, loaded: true })}
              onError={() => setPreviewResult({ source: previewUrl, loaded: false })} />
          )}
        </div>
        <label htmlFor="admin-photo-upload">Upload Image</label>
        <input ref={fileRef} id="admin-photo-upload" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={selectFile} disabled={isSaving} aria-describedby="admin-photo-file-help" />
        <small id="admin-photo-file-help">PNG or JPG/JPEG (Max 2 MB)</small>

        <label htmlFor="admin-photo-url">Image URL</label>
        <div className="admin-profile-photo-url">
          <Link2 size={17} aria-hidden="true" />
          <input id="admin-photo-url" type="url" placeholder="Paste image URL here" value={imageUrl} disabled={isSaving} onChange={(event) => {
            selectionVersion.current++;
            const value = event.target.value;
            const valid = isProfileImageUrl(value.trim());
            setImageUrl(value);
            setDraft(valid ? value.trim() : null);
            setIsReading(false);
            setError(value.trim() && !valid ? 'Enter a valid HTTP or HTTPS image URL.' : '');
            setNotice('');
            if (fileRef.current) fileRef.current.value = '';
          }} />
        </div>

        {(error || (draft && previewFailed)) && <p className="admin-profile-photo-error" role="alert"><CircleAlert size={16} aria-hidden="true" />{error || 'This image could not be loaded. Try another image or URL.'}</p>}
        {notice && <p className="admin-profile-photo-success" role="status"><CheckCircle2 size={16} aria-hidden="true" />{notice}</p>}
        {isReading && <p className="admin-profile-photo-instructions" role="status">Reading image...</p>}

        <div className="admin-profile-photo-actions">
          <button type="button" className="admin-profile-photo-clear" onClick={clearDraft} disabled={isSaving}>Clear</button>
          <button type="submit" className="admin-profile-photo-save" disabled={isSaving || isReading || !draft || !previewReady}>{isSaving ? 'Saving...' : 'Save Photo'}</button>
        </div>
      </form>
      <p className="admin-profile-photo-help"><Info size={15} aria-hidden="true" />Supported formats: PNG, JPG, JPEG. Max file size: 2 MB.</p>
    </section>,
    document.body,
  );
};

export default AdminProfilePhoto;
