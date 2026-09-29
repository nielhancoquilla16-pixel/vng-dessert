import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AccessDenied.css';

const AccessDenied = () => {
  const { userRole } = useAuth();
  const dashboardPath = userRole === 'admin'
    ? '/admin/dashboard'
    : userRole === 'staff'
      ? '/staff/dashboard'
      : '/customer/dashboard';

  return (
    <div className="access-denied-page">
      <div className="access-denied-card">
        <div className="access-denied-icon">
          <ShieldAlert size={28} />
        </div>
        <h1>403 Access Denied</h1>
        <p>This account cannot access that page.</p>
        <Link to={dashboardPath} className="access-denied-link">
          Go to My Dashboard
        </Link>
      </div>
    </div>
  );
};

export default AccessDenied;
