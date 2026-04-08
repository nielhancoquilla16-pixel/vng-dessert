import React, { useEffect, useState } from 'react';
import { UserPlus, Trash2, Key, Calendar, ShieldCheck, Camera, ImagePlus, Save, X, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminStaff.css';

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
const emptyStaffForm = {
  username: '',
  email: '',
  fullName: '',
  password: '',
  role: 'staff',
  avatarUrl: '',
};

const getInitials = (value = '') => (
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'ST'
);

const readImageFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

const validateImageFile = (file) => {
  if (!file) {
    return;
  }

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPG/JPEG profile pictures are supported.');
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile pictures must be 2MB or smaller.');
  }
};

const AvatarPreview = ({ avatarUrl, label, size = 52, fontSize = '1rem' }) => (
  <div
    className="admin-avatar"
    style={{
      width: `${size}px`,
      height: `${size}px`,
      fontSize,
      background: 'linear-gradient(135deg, #f97316, #fb923c)',
      overflow: 'hidden',
      flexShrink: 0,
    }}
  >
    {avatarUrl ? (
      <img
        src={avatarUrl}
        alt={label}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    ) : (
      getInitials(label)
    )}
  </div>
);

const AdminStaff = () => {
  const {
    profile,
    staffAccounts = [],
    createStaffAccount,
    updateStaffAccount,
    deleteStaffAccount,
    updateMyProfile,
  } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState(null);
  const [confirmDeleteStaffInfo, setConfirmDeleteStaffInfo] = useState(null);
  const [newStaff, setNewStaff] = useState({ ...emptyStaffForm });
  const [editStaff, setEditStaff] = useState({ ...emptyStaffForm });
  const [adminAvatarDraft, setAdminAvatarDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [editFormError, setEditFormError] = useState('');
  const [actionError, setActionError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [isSavingProfilePhoto, setIsSavingProfilePhoto] = useState(false);

  useEffect(() => {
    setAdminAvatarDraft(profile?.avatarUrl || '');
  }, [profile?.avatarUrl]);

  const handleImageFileSelection = async (file, onResolved, onError) => {
    try {
      validateImageFile(file);
      const nextDataUrl = await readImageFileAsDataUrl(file);
      onResolved(nextDataUrl);
    } catch (error) {
      onError(error.message || 'Unable to use that image file.');
    }
  };

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setFormError('');
    setActionError('');

    try {
      await createStaffAccount(newStaff);
      setIsCreateModalOpen(false);
      setNewStaff({ ...emptyStaffForm });
    } catch (nextError) {
      setFormError(nextError.message || 'Unable to create the staff account right now.');
    }
  };

  const handleDeleteStaff = (staff) => {
    if (!staff?.id) {
      return;
    }

    if (staff.id === profile?.id) {
      setActionError('You cannot delete your own admin account.');
      return;
    }

    setConfirmDeleteStaffId(staff.id);
    setConfirmDeleteStaffInfo(staff);
    setIsConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteStaffId) {
      return;
    }

    setActionError('');
    setDeletingId(confirmDeleteStaffId);

    try {
      await deleteStaffAccount(confirmDeleteStaffId);
      setIsConfirmDeleteOpen(false);
      setConfirmDeleteStaffId(null);
      setConfirmDeleteStaffInfo(null);
    } catch (nextError) {
      setActionError(nextError.message || 'Unable to delete that staff account right now.');
    } finally {
      setDeletingId('');
    }
  };

  const handleCancelDelete = () => {
    setIsConfirmDeleteOpen(false);
    setConfirmDeleteStaffId(null);
    setConfirmDeleteStaffInfo(null);
  };

  const handleOpenEditModal = (staff) => {
    setEditStaff({
      username: staff.username || '',
      email: staff.email || '',
      fullName: staff.fullName || '',
      password: '',
      role: staff.role || 'staff',
      avatarUrl: staff.avatarUrl || '',
    });
    setEditingStaffId(staff.id);
    setEditFormError('');
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingStaffId(null);
    setEditStaff({ ...emptyStaffForm });
    setEditFormError('');
  };

  const handleEditStaff = async (e) => {
    e.preventDefault();
    setEditFormError('');
    setActionError('');

    try {
      await updateStaffAccount(editingStaffId, editStaff);
      handleCloseEditModal();
    } catch (nextError) {
      setEditFormError(nextError.message || 'Unable to update the staff account right now.');
    }
  };

  const handleSaveAdminPhoto = async () => {
    setProfileError('');
    setProfileNotice('');
    setIsSavingProfilePhoto(true);

    try {
      await updateMyProfile({
        avatarUrl: adminAvatarDraft,
      });
      setProfileNotice('Your profile picture was updated.');
    } catch (error) {
      setProfileError(error.message || 'Unable to update your profile picture right now.');
    } finally {
      setIsSavingProfilePhoto(false);
    }
  };

  return (
    <div className="admin-staff-container">
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Staff Management</h1>
        </div>

        <button className="btn-add-item" onClick={() => setIsCreateModalOpen(true)}>
          <UserPlus size={20} /> Create Staff Account
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1.25rem',
            padding: '1.5rem',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)',
            border: '1px solid rgba(148, 163, 184, 0.14)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Camera size={18} color="#f97316" />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Admin Profile Photo</h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <AvatarPreview
              avatarUrl={adminAvatarDraft}
              label={profile?.fullName || profile?.username || 'Admin'}
              size={72}
              fontSize="1.25rem"
            />
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>{profile?.fullName || profile?.username || 'Administrator'}</div>
              <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Upload a PNG/JPG or paste an image link.</div>
            </div>
          </div>

          <div className="modal-form-group">
            <label>Upload PNG or JPG</label>
            <input
              type="file"
              className="modal-input"
              accept="image/png,image/jpeg"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  return;
                }

                setProfileError('');
                setProfileNotice('');
                handleImageFileSelection(
                  file,
                  setAdminAvatarDraft,
                  setProfileError,
                );
                e.target.value = '';
              }}
            />
          </div>

          <div className="modal-form-group">
            <label>Or paste image link</label>
            <input
              type="url"
              className="modal-input"
              placeholder="https://example.com/admin-photo.jpg"
              value={adminAvatarDraft.startsWith('data:') ? '' : adminAvatarDraft}
              onChange={(e) => {
                setProfileError('');
                setProfileNotice('');
                setAdminAvatarDraft(e.target.value);
              }}
            />
          </div>

          {adminAvatarDraft.startsWith('data:') && (
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569' }}>
              Uploaded image selected. Save changes to apply it.
            </div>
          )}

          {profileError && (
            <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
              {profileError}
            </div>
          )}

          {profileNotice && (
            <div style={{ marginBottom: '1rem', color: '#15803d', fontWeight: 600, fontSize: '0.9rem' }}>
              {profileNotice}
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-pos-cancel"
              style={{ flex: 1 }}
              onClick={() => {
                setAdminAvatarDraft('');
                setProfileError('');
                setProfileNotice('');
              }}
            >
              <X size={16} /> Clear
            </button>
            <button
              type="button"
              className="btn-add-item"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSaveAdminPhoto}
              disabled={isSavingProfilePhoto}
            >
              <Save size={16} /> {isSavingProfilePhoto ? 'Saving...' : 'Save Photo'}
            </button>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.6 }}>
            PNG and JPG/JPEG files are supported. Keep uploads at 2MB or smaller for best results.
          </div>
        </div>

        <div
          style={{
            background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)',
            borderRadius: '1.25rem',
            padding: '1.5rem',
            border: '1px solid rgba(251, 146, 60, 0.18)',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <ImagePlus size={18} color="#ea580c" />
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Staff Photos Enabled</h2>
          </div>
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.7 }}>
            New staff accounts can now be created with either an uploaded PNG/JPG photo or an image link.
            Their picture will appear in the staff list and the admin panel profile views.
          </p>
        </div>
      </div>

      {actionError && (
        <div style={{ marginTop: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
          {actionError}
        </div>
      )}

      <div className="recent-orders-card" style={{ padding: '0', marginTop: '2rem' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '2rem' }}>STAFF ACCOUNT</th>
              <th>EMAIL</th>
              <th>ACCESS LEVEL</th>
              <th>CREATED AT</th>
              <th style={{ paddingRight: '2rem' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {staffAccounts.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                  No staff accounts created yet.
                </td>
              </tr>
            ) : (
              staffAccounts.map((staff) => (
                <tr key={staff.id}>
                  <td style={{ paddingLeft: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <AvatarPreview
                        avatarUrl={staff.avatarUrl}
                        label={staff.fullName || staff.username || 'Staff'}
                        size={38}
                        fontSize="0.8rem"
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{staff.fullName || staff.username}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>@{staff.username || 'staff'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{staff.email || 'No email set'}</td>
                  <td>
                    <span className="status-badge status-active" style={{ background: '#fef3c7', color: '#d97706' }}>
                      <ShieldCheck size={14} style={{ marginRight: '4px' }} />
                      {staff.role === 'admin' ? 'Admin Role' : 'Staff Role'}
                    </span>
                  </td>
                  <td style={{ color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={14} />
                      {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </td>
                  <td style={{ paddingRight: '2rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn-add-item"
                        onClick={() => handleOpenEditModal(staff)}
                        disabled={staff.id === profile?.id}
                        style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', color: 'white' }}
                        title="Edit staff account"
                      >
                        <Edit2 size={16} /> Edit
                      </button>
                      <button
                        className="btn-card-delete"
                        onClick={() => handleDeleteStaff(staff)}
                        disabled={deletingId === staff.id || staff.id === profile?.id}
                        style={{ padding: '0.4rem 0.8rem' }}
                      >
                        <Trash2 size={16} /> {staff.id === profile?.id ? 'Current Admin' : (deletingId === staff.id ? 'Deleting...' : 'Delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content admin-staff-modal">
            <h2 style={{ marginBottom: '1.5rem' }}>Create Staff Account</h2>
            <form onSubmit={handleAddStaff}>
              {formError && (
                <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <AvatarPreview
                  avatarUrl={newStaff.avatarUrl}
                  label={newStaff.fullName || newStaff.username || 'Staff'}
                  size={66}
                  fontSize="1.1rem"
                />
                <div style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Add a staff picture using a PNG/JPG upload or an image link.
                </div>
              </div>

              <div className="modal-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Jane Cruz"
                  value={newStaff.fullName}
                  onChange={(e) => setNewStaff({ ...newStaff, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Username</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. staff_member"
                  value={newStaff.username}
                  onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="modal-input"
                  placeholder="staff@example.com"
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Initial Password</label>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="Enter temporary password"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Upload Staff Photo</label>
                <input
                  type="file"
                  className="modal-input"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    setFormError('');
                    handleImageFileSelection(
                      file,
                      (nextAvatarUrl) => setNewStaff((current) => ({ ...current, avatarUrl: nextAvatarUrl })),
                      setFormError,
                    );
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="modal-form-group">
                <label>Or paste image link</label>
                <input
                  type="url"
                  className="modal-input"
                  placeholder="https://example.com/staff-photo.jpg"
                  value={newStaff.avatarUrl.startsWith('data:') ? '' : newStaff.avatarUrl}
                  onChange={(e) => setNewStaff({ ...newStaff, avatarUrl: e.target.value })}
                />
              </div>

              {newStaff.avatarUrl.startsWith('data:') && (
                <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569' }}>
                  Uploaded image selected. It will be saved when the account is created.
                </div>
              )}

              <div className="modal-form-group">
                <label>Role</label>
                <select
                  className="modal-input"
                  value={newStaff.role}
                  onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>Account Notes:</p>
                <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
                  <li>Supabase Auth will handle the secure login.</li>
                  <li>Use unique email addresses for every staff member.</li>
                  <li>PNG and JPG/JPEG images up to 2MB are supported.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  className="btn-pos-cancel"
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setFormError('');
                    setNewStaff({ ...emptyStaffForm });
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-add-item" style={{ flex: 1, justifyContent: 'center' }}>
                  <Key size={16} /> Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content admin-staff-modal">
            <h2 style={{ marginBottom: '1.5rem' }}>Edit Staff Account</h2>
            <form onSubmit={handleEditStaff}>
              {editFormError && (
                <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
                  {editFormError}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <AvatarPreview
                  avatarUrl={editStaff.avatarUrl}
                  label={editStaff.fullName || editStaff.username || 'Staff'}
                  size={66}
                  fontSize="1.1rem"
                />
                <div style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  Update staff picture using a PNG/JPG upload or an image link.
                </div>
              </div>

              <div className="modal-form-group">
                <label>Full Name</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Jane Cruz"
                  value={editStaff.fullName}
                  onChange={(e) => setEditStaff({ ...editStaff, fullName: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Username</label>
                <input
                  type="text"
                  className="modal-input"
                  placeholder="e.g. staff_member"
                  value={editStaff.username}
                  onChange={(e) => setEditStaff({ ...editStaff, username: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Email</label>
                <input
                  type="email"
                  className="modal-input"
                  placeholder="staff@example.com"
                  value={editStaff.email}
                  onChange={(e) => setEditStaff({ ...editStaff, email: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Update Password (leave blank to keep current)</label>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="Leave blank to keep current password"
                  value={editStaff.password}
                  onChange={(e) => setEditStaff({ ...editStaff, password: e.target.value })}
                />
              </div>

              <div className="modal-form-group">
                <label>Upload Staff Photo</label>
                <input
                  type="file"
                  className="modal-input"
                  accept="image/png,image/jpeg"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) {
                      return;
                    }

                    setEditFormError('');
                    handleImageFileSelection(
                      file,
                      (nextAvatarUrl) => setEditStaff((current) => ({ ...current, avatarUrl: nextAvatarUrl })),
                      setEditFormError,
                    );
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="modal-form-group">
                <label>Or paste image link</label>
                <input
                  type="url"
                  className="modal-input"
                  placeholder="https://example.com/staff-photo.jpg"
                  value={editStaff.avatarUrl.startsWith('data:') ? '' : editStaff.avatarUrl}
                  onChange={(e) => setEditStaff({ ...editStaff, avatarUrl: e.target.value })}
                />
              </div>

              {editStaff.avatarUrl.startsWith('data:') && (
                <div style={{ marginBottom: '1rem', fontSize: '0.85rem', color: '#475569' }}>
                  Uploaded image selected. It will be saved when updated.
                </div>
              )}

              <div className="modal-form-group">
                <label>Role</label>
                <select
                  className="modal-input"
                  value={editStaff.role}
                  onChange={(e) => setEditStaff({ ...editStaff, role: e.target.value })}
                >
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                <p style={{ margin: 0, fontWeight: 600, color: '#475569' }}>Update Notes:</p>
                <ul style={{ margin: '0.5rem 0 0 1.25rem' }}>
                  <li>Leave password blank to keep the current password.</li>
                  <li>PNG and JPG/JPEG images up to 2MB are supported.</li>
                  <li>Changes take effect immediately.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  className="btn-pos-cancel"
                  style={{ flex: 1 }}
                  onClick={handleCloseEditModal}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-add-item" style={{ flex: 1, justifyContent: 'center' }}>
                  <Save size={16} /> Update Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isConfirmDeleteOpen && confirmDeleteStaffInfo && (
        <div className="modal-overlay">
          <div 
            className="modal-content"
            style={{
              maxWidth: '400px',
              padding: '2rem',
              textAlign: 'center',
            }}
          >
            <div style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  background: '#fecaca',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1rem',
                }}
              >
                <Trash2 size={32} style={{ color: '#dc2626' }} />
              </div>
              <h2 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Delete Staff Account?</h2>
              <p style={{ margin: '0', color: '#64748b', fontSize: '0.95rem' }}>
                Are you sure you want to delete <strong>{confirmDeleteStaffInfo.fullName || confirmDeleteStaffInfo.username}</strong>? 
                This action cannot be undone.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-pos-cancel"
                style={{ flex: 1 }}
                onClick={handleCancelDelete}
                disabled={deletingId === confirmDeleteStaffId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-card-delete"
                style={{ flex: 1 }}
                onClick={handleConfirmDelete}
                disabled={deletingId === confirmDeleteStaffId}
              >
                {deletingId === confirmDeleteStaffId ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
