import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AccessDenied from '../pages/AccessDenied';

const RequireRole = ({ allowedRoles = [], children }) => {
  const location = useLocation();
  const { isAuthLoading, profile } = useAuth();

  if (isAuthLoading) {
    return (
      <div className="access-denied-page">
        <div className="access-denied-card">
          <h1>Checking Access...</h1>
          <p>Please wait while we verify your session.</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowedRoles.includes(profile.role)) {
    return <AccessDenied />;
  }

  return children;
};

export default RequireRole;
