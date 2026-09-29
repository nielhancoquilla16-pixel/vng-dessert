import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRound, LayoutDashboard, ClipboardList, MapPin, Phone, Heart, LogOut, ChevronRight, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Account.css';

function AccountLink({ to, icon, title, description }) {
  return <Link to={to} className="account-row"><span className="account-row-icon">{React.createElement(icon, { size: 21 })}</span><span><strong>{title}</strong><small>{description}</small></span><ChevronRight size={18} aria-hidden="true" /></Link>;
}

export default function Account() {
  const { profile, isAuthLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState('');
  const name = profile?.fullName || profile?.username || 'Your account';
  const role = profile?.role;
  const dashboard = role === 'admin' ? '/admin/dashboard' : role === 'staff' ? '/staff/dashboard' : '/customer/dashboard';
  const handleLogout = async () => {
    setIsSigningOut(true);
    setError('');
    try { await logout(); navigate('/account', { replace: true }); }
    catch { setError('Unable to sign out. Please try again.'); }
    finally { setIsSigningOut(false); }
  };

  return (
    <div className="account-page">
      <div className="account-heading"><p>V & G LecheFlan</p><h1>Account</h1><span>Your details, orders, and a little help.</span></div>
      <section className="account-welcome" aria-label="Account information">
        <span className="account-avatar">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <UserRound size={28} />}</span>
        <div><h2>{isAuthLoading ? 'Loading your account…' : profile ? name : 'Welcome, dessert lover'}</h2><p>{profile ? profile.email : 'Sign in to manage your orders and delivery details.'}</p></div>
        {!profile && !isAuthLoading && <Link to="/login" className="account-signin"><LogIn size={18} /> Sign in / Sign up</Link>}
      </section>
      <div className="account-sections">
        {profile && <section className="account-section"><h2>My account</h2>
          {role === 'customer' && <>
            <AccountLink to="/profile" icon={UserRound} title="Profile & addresses" description="Edit your details and saved delivery addresses" />
            <AccountLink to="/orders" icon={ClipboardList} title="My orders" description="Track orders and view your purchase history" />
          </>}
          {['customer', 'staff', 'admin'].includes(role) && <AccountLink to={dashboard} icon={LayoutDashboard} title={role === 'admin' ? 'Admin dashboard' : role === 'staff' ? 'Staff dashboard' : 'My dashboard'} description={role === 'customer' ? 'Your shopping overview' : 'Open your workspace'} />}
        </section>}
        <section className="account-section"><h2>Here to help</h2>
          <AccountLink to="/contact" icon={Phone} title="Contact us" description="Get in touch with the shop" />
          <AccountLink to="/about" icon={Heart} title="About V & G" description="Meet your local dessert shop" />
          <AccountLink to="/contact" icon={MapPin} title="Visit our shop" description="Find our location and opening hours" />
        </section>
      </div>
      {error && <p className="account-error" role="alert">{error}</p>}
      {profile && <button className="account-logout" type="button" onClick={handleLogout} disabled={isSigningOut}><LogOut size={19} />{isSigningOut ? 'Signing out…' : 'Logout'}</button>}
    </div>
  );
}
