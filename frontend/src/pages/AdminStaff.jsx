import React, { useRef, useState } from 'react';
import { UserPlus, Trash2, Key, Calendar, ShieldCheck, Crown, Save, X, Edit2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PASSWORD_POLICY_MESSAGE, validatePassword } from '../utils/passwordValidation';
import LoadingButton from '../components/LoadingButton';
import { readImageFileAsDataUrl, validateImageFile } from '../utils/profileImages';
import './AdminStaff.css';

const emptyStaffForm = {
  username: '',
  email: '',
  fullName: '',
  password: '',
  role: 'staff',
  avatarUrl: '',
};
const emptyResetPasswordForm = {
  password: '',
  confirmPassword: '',
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
    isAuthLoading,
    profile,
    staffAccounts = [],
    createStaffAccount,
    updateStaffAccount,
    resetStaffPassword,
    deleteStaffAccount,
    transferSuperAdmin,
  } = useAuth();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState(null);
  const [confirmDeleteStaffInfo, setConfirmDeleteStaffInfo] = useState(null);
  const [newStaff, setNewStaff] = useState({ ...emptyStaffForm });
  const [editStaff, setEditStaff] = useState({ ...emptyStaffForm });
  const [formError, setFormError] = useState('');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const staffCreationInProgress = useRef(false);
  const [editFormError, setEditFormError] = useState('');
  const [isUpdatingStaff, setIsUpdatingStaff] = useState(false);
  const staffUpdateInProgress = useRef(false);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [resettingId, setResettingId] = useState('');
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetStaffInfo, setResetStaffInfo] = useState(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({ ...emptyResetPasswordForm });
  const [resetFormError, setResetFormError] = useState('');
  const [transferTarget, setTransferTarget] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const transferInProgress = useRef(false);
  const [transferError, setTransferError] = useState('');
  const editingAccount = staffAccounts.find((staff) => staff.id === editingStaffId);

  const canEditAccount = (staff) => staff?.role === 'staff'
    || (staff?.role === 'admin' && (staff.id === profile?.id || profile?.isSuperAdmin));

  const canDeleteAccount = (staff) => staff?.id !== profile?.id && !staff?.isSuperAdmin
    && (staff?.role === 'staff' || (staff?.role === 'admin' && profile?.isSuperAdmin));

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
    if (staffCreationInProgress.current) return;
    setFormError('');
    setActionError('');
    setActionNotice('');

    const passwordValidation = validatePassword(newStaff.password);
    if (!passwordValidation.valid) {
      setFormError(passwordValidation.message);
      return;
    }

    staffCreationInProgress.current = true;
    setIsCreatingStaff(true);
    try {
      await createStaffAccount(newStaff);
      setIsCreateModalOpen(false);
      setNewStaff({ ...emptyStaffForm });
      setActionNotice(newStaff.role === 'admin' ? 'new admin account created' : 'New staff account created.');
    } catch (nextError) {
      setFormError(nextError.message || 'Unable to create the staff account right now.');
    } finally {
      staffCreationInProgress.current = false;
      setIsCreatingStaff(false);
    }
  };

  const handleDeleteStaff = (staff) => {
    if (!staff?.id) {
      return;
    }

    setActionNotice('');

    if (staff.id === profile?.id) {
      setActionError('You cannot delete your own admin account.');
      return;
    }
    if (!canDeleteAccount(staff)) {
      setActionError(staff.isSuperAdmin
        ? 'Transfer Super Admin access before deleting this account.'
        : 'Only the Super Admin can delete another admin account.');
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
    setActionNotice('');
    setDeletingId(confirmDeleteStaffId);

    try {
      await deleteStaffAccount(confirmDeleteStaffId);
      setActionNotice(`${confirmDeleteStaffInfo?.role === 'admin' ? 'Admin' : 'Staff'} account deleted.`);
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
    setActionError('');
    setActionNotice('');
    if (!canEditAccount(staff)) {
      setActionError('Only the Super Admin can edit another admin account.');
      return;
    }
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

  const handleTransferSuperAdmin = async () => {
    if (!transferTarget?.id || transferInProgress.current) return;
    transferInProgress.current = true;
    setIsTransferring(true);
    setTransferError('');
    setActionError('');
    setActionNotice('');
    const name = transferTarget.fullName || transferTarget.username;
    try {
      await transferSuperAdmin(transferTarget.id);
      setTransferTarget(null);
      setActionNotice(`Super Admin access transferred to ${name}. They can now sign in and delete the former admin account if needed.`);
    } catch (error) {
      setTransferError(error.message || 'Unable to transfer Super Admin access. Please try again.');
    } finally {
      transferInProgress.current = false;
      setIsTransferring(false);
    }
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingStaffId(null);
    setEditStaff({ ...emptyStaffForm });
    setEditFormError('');
  };

  const handleEditStaff = async (e) => {
    e.preventDefault();
    if (staffUpdateInProgress.current || !editingStaffId) {
      return;
    }
    setEditFormError('');
    setActionError('');
    setActionNotice('');

    if (editStaff.password) {
      const passwordValidation = validatePassword(editStaff.password);
      if (!passwordValidation.valid) {
        setEditFormError(passwordValidation.message);
        return;
      }
    }

    staffUpdateInProgress.current = true;
    setIsUpdatingStaff(true);

    try {
      const previousRole = staffAccounts.find((staff) => staff.id === editingStaffId)?.role;
      await updateStaffAccount(editingStaffId, editStaff);
      handleCloseEditModal();
      setActionNotice(editStaff.role === 'admin' && previousRole !== 'admin'
        ? 'new admin account created'
        : `${editStaff.role === 'admin' ? 'Admin' : 'Staff'} account updated.`);
    } catch (nextError) {
      setEditFormError(nextError.message || 'Unable to update the staff account right now.');
    } finally {
      staffUpdateInProgress.current = false;
      setIsUpdatingStaff(false);
    }
  };

  const handleOpenResetModal = (staff) => {
    if (!staff?.id) {
      return;
    }

    setActionError('');
    setActionNotice('');

    if (staff.role !== 'staff') {
      setActionError('Only staff account passwords can be reset from this panel.');
      return;
    }

    setResetStaffInfo(staff);
    setResetPasswordForm({ ...emptyResetPasswordForm });
    setResetFormError('');
    setIsResetPasswordOpen(true);
  };

  const handleCloseResetModal = () => {
    setIsResetPasswordOpen(false);
    setResetStaffInfo(null);
    setResetPasswordForm({ ...emptyResetPasswordForm });
    setResetFormError('');
  };

  const handleResetStaffPassword = async (e) => {
    e.preventDefault();

    if (!resetStaffInfo?.id) {
      return;
    }

    const nextPassword = resetPasswordForm.password;
    const confirmation = resetPasswordForm.confirmPassword;

    setResetFormError('');
    setActionError('');
    setActionNotice('');

    if (!nextPassword.trim()) {
      setResetFormError('Enter a new temporary password.');
      return;
    }

    const passwordValidation = validatePassword(nextPassword);
    if (!passwordValidation.valid) {
      setResetFormError(passwordValidation.message);
      return;
    }

    if (nextPassword !== confirmation) {
      setResetFormError('The password confirmation does not match.');
      return;
    }

    const staffLabel = resetStaffInfo.fullName || resetStaffInfo.username || 'the staff member';
    setResettingId(resetStaffInfo.id);

    try {
      await resetStaffPassword(resetStaffInfo.id, nextPassword);
      handleCloseResetModal();
      setActionNotice(`Password reset for ${staffLabel}. Share the temporary password securely.`);
    } catch (nextError) {
      setResetFormError(nextError.message || 'Unable to reset that password right now.');
    } finally {
      setResettingId('');
    }
  };

  if (isAuthLoading) {
    return (
      <div className="recent-orders-card" style={{ marginTop: '2rem', padding: '2rem', color: '#475569' }}>
        Loading staff management access...
      </div>
    );
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="recent-orders-card" style={{ marginTop: '2rem', padding: '2rem' }}>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem', color: '#0f172a' }}>Admin Access Required</h1>
        <p style={{ margin: 0, color: '#64748b', lineHeight: 1.6 }}>
          Only admins can manage staff accounts and reset staff passwords.
        </p>
      </div>
    );
  }

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

      {actionError && (
        <div style={{ marginTop: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
          {actionError}
        </div>
      )}

      {actionNotice && (
        <div role="status" style={{ marginTop: actionError ? '0.5rem' : '1rem', color: '#15803d', fontWeight: 600, fontSize: '0.9rem' }}>
          {actionNotice}
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
                      {staff.isSuperAdmin ? 'Super Admin' : staff.role === 'admin' ? 'Admin Role' : 'Staff Role'}
                    </span>
                  </td>
                  <td style={{ color: '#64748b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={14} />
                      {staff.createdAt ? new Date(staff.createdAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </td>
                  <td style={{ paddingRight: '2rem' }}>
                    <div className="admin-staff-actions-row">
                      {profile.isSuperAdmin && staff.role === 'admin' && staff.id !== profile.id && (
                        <button type="button" className="btn-add-item"
                          onClick={() => { setTransferTarget(staff); setTransferError(''); }}
                          disabled={isTransferring || isUpdatingStaff || Boolean(deletingId)}
                          style={{ padding: '0.4rem 0.8rem', background: '#92400e', color: 'white' }}>
                          <Crown size={16} /> Make Super Admin
                        </button>
                      )}
                      {staff.role === 'staff' && (
                        <button
                          className="btn-add-item"
                          onClick={() => handleOpenResetModal(staff)}
                          disabled={resettingId === staff.id}
                          style={{ padding: '0.4rem 0.8rem', background: '#f59e0b', color: 'white' }}
                          title="Reset staff password"
                        >
                          <Key size={16} /> {resettingId === staff.id ? 'Resetting...' : 'Reset Password'}
                        </button>
                      )}
                      <button
                        className="btn-add-item"
                        onClick={() => handleOpenEditModal(staff)}
                        disabled={!canEditAccount(staff) || isTransferring}
                        style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', color: 'white' }}
                        title="Edit staff account"
                      >
                        <Edit2 size={16} /> Edit
                      </button>
                      <button
                        className="btn-card-delete"
                        onClick={() => handleDeleteStaff(staff)}
                        disabled={deletingId === staff.id || !canDeleteAccount(staff) || isTransferring}
                        style={{ padding: '0.4rem 0.8rem' }}
                      >
                        <Trash2 size={16} /> {staff.id === profile?.id ? 'Current Admin' : staff.isSuperAdmin ? 'Super Admin' : (deletingId === staff.id ? 'Deleting...' : 'Delete')}
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
                <div role="alert" style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
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
                  maxLength={20}
                  required
                />
                <p style={{
                  margin: '0.35rem 0 0',
                  color: newStaff.password && !validatePassword(newStaff.password).valid ? '#b91c1c' : '#64748b',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                }}>
                  {PASSWORD_POLICY_MESSAGE}
                </p>
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
                  <li>Staff can sign in securely using their account details.</li>
                  <li>Use unique email addresses for every staff member.</li>
                  <li>PNG and JPG/JPEG images up to 2MB are supported.</li>
                </ul>
              </div>

              <div className="admin-staff-modal-actions">
                <button
                  type="button"
                  className="btn-pos-cancel"
                  style={{ flex: 1 }}
                  disabled={isCreatingStaff}
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setFormError('');
                    setNewStaff({ ...emptyStaffForm });
                  }}
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  className="btn-add-item"
                  style={{ flex: 1, justifyContent: 'center' }}
                  isLoading={isCreatingStaff}
                  disabled={!validatePassword(newStaff.password).valid}
                >
                  <Key size={16} /> Create Account
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {isResetPasswordOpen && resetStaffInfo && (
        <div className="modal-overlay">
          <div className="modal-content admin-staff-modal">
            <h2 style={{ marginBottom: '0.5rem' }}>Reset Staff Password</h2>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', lineHeight: 1.6 }}>
              Set a new temporary password for <strong>{resetStaffInfo.fullName || resetStaffInfo.username}</strong>.
              Only the admin can do this from the staff management panel.
            </p>

            <form onSubmit={handleResetStaffPassword}>
              {resetFormError && (
                <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
                  {resetFormError}
                </div>
              )}

              <div className="modal-form-group">
                <label>Staff Account</label>
                <input
                  type="text"
                  className="modal-input"
                  value={`${resetStaffInfo.fullName || resetStaffInfo.username} (${resetStaffInfo.email || 'No email'})`}
                  readOnly
                />
              </div>

              <div className="modal-form-group">
                <label>New Temporary Password</label>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="Enter a temporary password"
                  value={resetPasswordForm.password}
                  onChange={(e) => setResetPasswordForm((current) => ({ ...current, password: e.target.value }))}
                  maxLength={20}
                  required
                />
                <p style={{
                  margin: '0.35rem 0 0',
                  color: resetPasswordForm.password && !validatePassword(resetPasswordForm.password).valid ? '#b91c1c' : '#64748b',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                }}>
                  {PASSWORD_POLICY_MESSAGE}
                </p>
              </div>

              <div className="modal-form-group">
                <label>Confirm Temporary Password</label>
                <input
                  type="password"
                  className="modal-input"
                  placeholder="Re-enter the temporary password"
                  value={resetPasswordForm.confirmPassword}
                  onChange={(e) => setResetPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))}
                  maxLength={20}
                  required
                />
              </div>

              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1.5rem', fontSize: '0.85rem', color: '#64748b', lineHeight: 1.6 }}>
                The new password takes effect immediately. Share it securely with the staff member so they can sign in again.
              </div>

              <div className="admin-staff-modal-actions">
                <button
                  type="button"
                  className="btn-pos-cancel"
                  style={{ flex: 1 }}
                  onClick={handleCloseResetModal}
                  disabled={
                    resettingId === resetStaffInfo.id
                    || !validatePassword(resetPasswordForm.password).valid
                    || resetPasswordForm.password !== resetPasswordForm.confirmPassword
                  }
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-add-item"
                  style={{ flex: 1, justifyContent: 'center', background: '#f59e0b' }}
                  disabled={resettingId === resetStaffInfo.id}
                >
                  <Key size={16} /> {resettingId === resetStaffInfo.id ? 'Resetting...' : 'Reset Password'}
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
            <form onSubmit={handleEditStaff} aria-busy={isUpdatingStaff}>
              <fieldset className="admin-staff-edit-fields" disabled={isUpdatingStaff}>
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
                  maxLength={20}
                />
                <p style={{
                  margin: '0.35rem 0 0',
                  color: editStaff.password && !validatePassword(editStaff.password).valid ? '#b91c1c' : '#64748b',
                  fontSize: '0.78rem',
                  lineHeight: 1.4,
                }}>
                  {PASSWORD_POLICY_MESSAGE}
                </p>
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
                  disabled={editingStaffId === profile?.id || editingAccount?.isSuperAdmin}
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

              <div className="admin-staff-modal-actions">
                <button
                  type="button"
                  className="btn-pos-cancel"
                  style={{ flex: 1 }}
                  onClick={handleCloseEditModal}
                  disabled={isUpdatingStaff}
                >
                  Cancel
                </button>
                <LoadingButton
                  type="submit"
                  className="btn-add-item"
                  style={{ flex: 1, justifyContent: 'center' }}
                  isLoading={isUpdatingStaff}
                  aria-label={isUpdatingStaff ? 'Updating account' : 'Update Account'}
                  disabled={Boolean(editStaff.password) && !validatePassword(editStaff.password).valid}
                >
                  <Save size={16} /> Update Account
                </LoadingButton>
              </div>
              </fieldset>
            </form>
            {isUpdatingStaff && (
              <p className="admin-staff-update-status" role="status">
                Updating account… Please wait.
              </p>
            )}
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
              <h2 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Delete {confirmDeleteStaffInfo.role === 'admin' ? 'Admin' : 'Staff'} Account?</h2>
              <p style={{ margin: '0', color: '#64748b', fontSize: '0.95rem' }}>
                Are you sure you want to delete <strong>{confirmDeleteStaffInfo.fullName || confirmDeleteStaffInfo.username}</strong>? 
                This action cannot be undone.
              </p>
            </div>

            <div className="admin-staff-modal-actions" style={{ marginTop: '1.5rem' }}>
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

      {transferTarget && (
        <div className="modal-overlay">
          <div className="modal-content admin-staff-modal" role="dialog" aria-modal="true" aria-labelledby="super-admin-transfer-title">
            <h2 id="super-admin-transfer-title">Transfer Super Admin access?</h2>
            <p style={{ margin: '1rem 0', color: '#475569', lineHeight: 1.6 }}>
              Make <strong>{transferTarget.fullName || transferTarget.username}</strong> the new Super Admin.
              You will remain an admin. The new Super Admin can manage admin accounts and can delete your account after signing in.
            </p>
            <p style={{ marginBottom: '1.5rem', color: '#64748b', lineHeight: 1.6 }}>
              There is one Super Admin at a time. You will need the new Super Admin to transfer access back to you.
            </p>
            {transferError && <p role="alert" style={{ color: '#b91c1c', marginBottom: '1rem' }}>{transferError}</p>}
            <div className="admin-staff-modal-actions">
              <button type="button" className="btn-pos-cancel" style={{ flex: 1 }}
                disabled={isTransferring} onClick={() => setTransferTarget(null)}>Cancel</button>
              <LoadingButton type="button" className="btn-add-item" style={{ flex: 1 }}
                isLoading={isTransferring} onClick={handleTransferSuperAdmin}>
                <Crown size={16} /> Transfer Access
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
