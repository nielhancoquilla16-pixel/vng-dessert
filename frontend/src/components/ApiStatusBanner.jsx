import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import {
  clearApiResponseStatus,
  getApiStatus,
  probeApiHealth,
  subscribeToApiStatus,
} from '../lib/api';

const ApiStatusBanner = () => {
  const location = useLocation();
  const [status, setStatus] = useState(getApiStatus());
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    if (previousPathRef.current !== location.pathname) {
      previousPathRef.current = location.pathname;
      clearApiResponseStatus();
    }
  }, [location.pathname]);

  useEffect(() => (
    subscribeToApiStatus(setStatus)
  ), []);

  useEffect(() => {
    if (!status?.message || status.source !== 'network') {
      return undefined;
    }

    let isActive = true;
    const intervalId = window.setInterval(async () => {
      try {
        await probeApiHealth();
      } catch {
        if (!isActive) {
          return;
        }
      }
    }, 3000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [status]);

  if (!status?.message || status.level === 'idle') {
    return null;
  }

  return (
    <div className="api-status-banner" role="alert">
      <AlertTriangle size={20} aria-hidden="true" />
      <div className="api-status-banner-copy">
        <strong>Error {status.code || 503}</strong>
        <span>{status.message}</span>
      </div>
      <button type="button" className="api-status-retry" onClick={() => window.location.reload()}>
        Try Again
      </button>
    </div>
  );
};

export default ApiStatusBanner;
