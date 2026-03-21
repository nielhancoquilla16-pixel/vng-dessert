import React, { useState } from 'react';
import { UserPlus, Trash2, Key, Calendar, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminStaff.css';

const AdminStaff = () => {
  const { staffAccounts, createStaffAccount, deleteStaffAccount } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStaff, setNewStaff] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: 'staff',
  });
  const [error, setError] = useState('');

  const handleAddStaff = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await createStaffAccount(newStaff);
      setIsModalOpen(false);
      setNewStaff({
        username: '',
        email: '',
        fullName: '',
        password: '',
        role: 'staff',
      });
    } catch (nextError) {
      setError(nextError.message || 'Unable to create the staff account right now.');
    }
  };

  return (
    <div className="admin-staff-container">
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Staff Management</h1>
          <p style={{ color: '#64748b' }}>Manage your team accounts and access</p>
        </div>

        <button className="btn-add-item" onClick={() => setIsModalOpen(true)}>
          <UserPlus size={20} /> Create Staff Account
        </button>
      </div>

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
                      <div className="admin-avatar" style={{ width: '32px', height: '32px', fontSize: '0.75rem' }}>
                        {(staff.username || staff.fullName || 'ST').substring(0, 2).toUpperCase()}
                      </div>
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
                    <button
                      className="btn-card-delete"
                      onClick={() => deleteStaffAccount(staff.id)}
                      style={{ padding: '0.4rem 0.8rem' }}
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ marginBottom: '1.5rem' }}>Create Staff Account</h2>
            <form onSubmit={handleAddStaff}>
              {error && (
                <div style={{ marginBottom: '1rem', color: '#b91c1c', fontWeight: 600, fontSize: '0.9rem' }}>
                  {error}
                </div>
              )}

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
                  <li>Staff can manage products, inventory, POS, and orders.</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button type="button" className="btn-pos-cancel" style={{ flex: 1 }} onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-add-item" style={{ flex: 1, justifyContent: 'center' }}>
                  <Key size={16} /> Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
