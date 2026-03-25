import React, { useEffect, useState } from 'react';
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
  MonitorPlay,
  Menu,
  X
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import './AdminLayout.css';

const getInitials = (profile, userRole) => {
  const source = profile?.fullName || profile?.username || (userRole === 'admin' ? 'Administrator' : 'Staff Member');
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
};

const formatMobileTimestamp = (date) => {
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${weekdays[date.getDay()]} ${months[date.getMonth()]} ${String(date.getDate()).padStart(2, '0')} ${date.getFullYear()} ${hours}:${minutes}`;
};

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, userRole, profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileTimestamp, setMobileTimestamp] = useState(() => formatMobileTimestamp(new Date()));

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsSidebarOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [location.pathname]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMobileTimestamp(formatMobileTimestamp(new Date()));
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isSidebarOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isSidebarOpen]);

  const handleLogout = () => {
    setIsSidebarOpen(false);
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
  const activeMenuItem = menuItems.find((item) => location.pathname === item.path);
  const panelLabel = userRole === 'admin' ? 'Admin Panel' : 'Staff Panel';
  const profileName = profile?.fullName || profile?.username || (userRole === 'admin' ? 'Administrator' : 'Staff Member');

  return (
    <div className={`admin-layout ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <div
        className={`admin-sidebar-backdrop ${isSidebarOpen ? 'visible' : ''}`}
        aria-hidden="true"
        onClick={() => setIsSidebarOpen(false)}
      />

      <header className="admin-mobile-topbar">
        <button
          type="button"
          className="admin-mobile-toggle"
          aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isSidebarOpen}
          onClick={() => setIsSidebarOpen((prev) => !prev)}
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <div className="admin-mobile-summary">
          <img src={resolveAssetUrl('logo.png')} alt="V&G Lecheflan" className="admin-mobile-logo" />
          <div className="admin-mobile-summary-copy">
            <strong>{activeMenuItem?.name || panelLabel}</strong>
            <span>{mobileTimestamp}</span>
          </div>
        </div>

        <button
          type="button"
          className="admin-mobile-logout"
          aria-label="Logout"
          onClick={handleLogout}
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-mobile-head">
          <span>{panelLabel}</span>
          <button
            type="button"
            className="admin-sidebar-close"
            aria-label="Close navigation menu"
            onClick={() => setIsSidebarOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="admin-brand">
          <h2>V&G LECHEFLAN</h2>
          <span>{panelLabel}</span>
        </div>

        <div className="admin-user-info">
          <div className="admin-avatar" style={{ background: userRole === 'admin' ? 'linear-gradient(135deg, #f97316, #fb923c)' : 'linear-gradient(135deg, #6366f1, #818cf8)' }}>
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.fullName || profile.username || 'Profile'} className="admin-avatar-image" />
            ) : (
              getInitials(profile, userRole)
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{profileName}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>{userRole}</div>
          </div>
        </div>

        <nav className="admin-nav">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              className={`admin-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => setIsSidebarOpen(false)}
            >
              <div className="nav-icon-wrapper" style={{ color: location.pathname === item.path ? 'white' : item.color }}>
                <item.icon size={20} />
              </div>
              {item.name}
            </Link>
          ))}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link to="/" className="admin-nav-item" onClick={() => setIsSidebarOpen(false)}>
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
