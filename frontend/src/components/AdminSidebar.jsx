import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Shield, X } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { resolveAssetUrl } from '../lib/publicUrl';
import { getNavigationSections } from './adminNavigation';
import AdminProfilePhoto from './AdminProfilePhoto';

const AdminSidebar = ({ userRole, profile, isOpen, onClose, onLogout }) => {
  const { pathname } = useLocation();
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const photoTriggerRef = useRef(null);
  const closePhoto = useCallback(() => setIsPhotoOpen(false), []);
  const canEditPhoto = userRole === 'admin' && profile?.role === 'admin';
  const roleLabel = userRole === 'admin' ? 'Admin' : 'Staff';
  const profileName = profile?.username || profile?.fullName || (userRole === 'admin' ? 'Administrator' : 'Staff Member');
  const profileAvatar = profile?.avatarUrl;
  const logoUrl = resolveAssetUrl('logo.png');

  useEffect(() => {
    const timer = window.setTimeout(closePhoto, 0);
    return () => window.clearTimeout(timer);
  }, [closePhoto, pathname, isOpen, profile?.id]);

  return (
    <aside id="admin-sidebar" className={`admin-sidebar ${isOpen ? 'open' : ''}`} aria-label={`${roleLabel} sidebar`}>
      <div className="admin-sidebar-mobile-head">
        <span>{roleLabel} Panel</span>
        <button type="button" className="admin-sidebar-close" aria-label="Close navigation menu" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="admin-user-info">
        <div className="admin-profile-images">
          <div className="admin-avatar">
            {profileAvatar ? (
              <img
                key={profileAvatar}
                src={profileAvatar}
                alt={`${profileName}'s profile`}
                className="admin-avatar-image"
                onError={(event) => {
                  if (event.currentTarget.getAttribute('src') !== logoUrl) {
                    event.currentTarget.src = logoUrl;
                  }
                }}
              />
            ) : (
              <img src={logoUrl} alt="V&G LecheFlan" className="admin-avatar-image" />
            )}
          </div>
          {profileAvatar && <img src={logoUrl} alt="V&G LecheFlan" className="admin-profile-brand-badge" />}
        </div>
        <div className="admin-profile-copy">
          <span className="admin-profile-brand">V&G LecheFlan</span>
          <strong className="admin-profile-name" title={profileName}>{profileName}</strong>
          <span className="admin-profile-role"><Shield size={17} strokeWidth={2.5} aria-hidden="true" />{roleLabel}</span>
        </div>
        {canEditPhoto && (
          <button ref={photoTriggerRef} type="button" className="admin-profile-photo-toggle" aria-label="Admin profile photo"
            aria-haspopup="dialog" aria-expanded={isPhotoOpen} aria-controls={isPhotoOpen ? 'admin-profile-photo' : undefined}
            onClick={() => setIsPhotoOpen((current) => !current)}>
            <ChevronDown size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      {canEditPhoto && isPhotoOpen && <AdminProfilePhoto key={profile.id} triggerRef={photoTriggerRef} onClose={closePhoto} />}

      <nav className="admin-nav" aria-label={`${roleLabel} navigation`}>
        {getNavigationSections(userRole).map((section) => (
          <section key={section.id} className="admin-nav-section" aria-labelledby={`admin-nav-${section.id}`}>
            <h2 id={`admin-nav-${section.id}`} className="admin-nav-heading">{section.label}</h2>
            <div className="admin-nav-items">
              {section.items.map((item) => {
                const content = (
                  <>
                    <span className="nav-icon-wrapper"><item.icon size={26} strokeWidth={2.3} aria-hidden="true" /></span>
                    <span className="admin-nav-label">{item.name}</span>
                    <ChevronRight className="admin-nav-chevron" size={15} strokeWidth={1.8} aria-hidden="true" />
                  </>
                );

                return item.action === 'logout' ? (
                  <button key={item.name} type="button" className="admin-nav-item" style={{ '--nav-accent': item.color }} onClick={onLogout}>
                    {content}
                  </button>
                ) : (
                  <NavLink
                    key={item.name}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
                    style={{ '--nav-accent': item.color }}
                    onClick={onClose}
                  >
                    {content}
                  </NavLink>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
};

export default AdminSidebar;
