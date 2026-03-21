import React from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingBag, 
  Monitor, 
  ClipboardList, 
  BarChart3, 
  Camera, 
  Store, 
  LogOut,
  Users,
  MonitorPlay
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import './AdminLayout.css';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, userRole } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allMenuItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard, roles: ['admin'], color: '#6366f1' },
    { name: 'Products', path: '/admin/products', icon: Package, roles: ['admin', 'staff'], color: '#f97316' },
    { name: 'Orders', path: '/admin/orders', icon: ShoppingBag, roles: ['admin', 'staff'], color: '#8b5cf6' },
    { name: 'POS System', path: '/admin/pos', icon: Monitor, roles: ['admin', 'staff'], color: '#0ea5e9' },
    { name: 'Inventory', path: '/admin/inventory', icon: ClipboardList, roles: ['admin', 'staff'], color: '#ec4899' },
    { name: 'Reports', path: '/admin/reports', icon: BarChart3, roles: ['admin', 'staff'], color: '#3b82f6' },
    { name: 'QR Scanner', path: '/admin/qr', icon: Camera, roles: ['admin', 'staff'], color: '#475569' },
    { name: 'Staff Management', path: '/admin/staff', icon: Users, roles: ['admin'], color: '#10b981' },
    { name: 'Site Content', path: '/admin/content', icon: MonitorPlay, roles: ['admin'], color: '#eab308' },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(userRole));

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <h2>V&G LECHEFLAN</h2>
          <span>{userRole === 'admin' ? 'Admin Panel' : 'Staff Panel'}</span>
        </div>

        <div className="admin-user-info">
          <div className="admin-avatar" style={{ background: userRole === 'admin' ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'linear-gradient(135deg, #6366f1, #818cf8)' }}>
            {userRole === 'admin' ? 'AD' : 'ST'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{userRole === 'admin' ? 'Administrator' : 'Staff Member'}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>{userRole}</div>
          </div>
        </div>

        <nav className="admin-nav">
          {menuItems.map((item) => (
            <Link 
              key={item.name} 
              to={item.path} 
              className={`admin-nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <div className="nav-icon-wrapper" style={{ color: location.pathname === item.path ? 'white' : item.color }}>
                <item.icon size={20} />
              </div>
              {item.name}
            </Link>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link to="/" className="admin-nav-item">
            <div className="nav-icon-wrapper" style={{ color: '#000' }}><Store size={20} /></div>
            Back to Store
          </Link>
          <button 
            onClick={handleLogout} 
            className="admin-nav-item" 
            style={{ width: '100%', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            <div className="nav-icon-wrapper" style={{ color: '#ef4444' }}><LogOut size={20} /></div>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
