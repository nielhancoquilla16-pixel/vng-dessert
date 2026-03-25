import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  getApiStatus,
  isBackendUnavailableMessage,
  probeApiHealth,
  subscribeToApiStatus,
} from '../lib/api';

const ApiStatusBanner = () => {
  const [status, setStatus] = useState(getApiStatus());

  useEffect(() => (
    subscribeToApiStatus(setStatus)
  ), []);

  useEffect(() => {
    if (!status?.message || !isBackendUnavailableMessage(status.message)) {
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
    <div className="api-status-banner" role="status" aria-live="polite">
      <AlertTriangle size={18} />
      <span>{status.message}</span>
    </div>
  );
};

export default ApiStatusBanner;
