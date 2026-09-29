/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL, apiRequest } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import { useAuth } from './AuthContext';
import { formatShopTime, hasValidShopHours, isWithinOperatingHours, normalizeShopSettings, shouldAcceptShopSettings } from '../utils/shopHours';

const ShopSettingsContext = createContext();
const UNVERIFIED_HOURS = 'Unable to verify current shop hours. Reconnecting…';
const emptySettings = normalizeShopSettings();

export const useShopSettings = () => {
  const context = useContext(ShopSettingsContext);
  if (!context) throw new Error('useShopSettings must be used within a ShopSettingsProvider');
  return context;
};

export const ShopSettingsProvider = ({ children }) => {
  const { session, userRole } = useAuth();
  const [shopSettings, setShopSettings] = useState(emptySettings);
  const [isShopSettingsLoading, setIsShopSettingsLoading] = useState(true);
  const [shopSettingsError, setShopSettingsError] = useState('');
  const [clock, setClock] = useState(Date.now);
  const [streamBase, setStreamBase] = useState(API_BASE_URL);
  const settingsRef = useRef(emptySettings);
  const sequenceRef = useRef(0);
  const acceptedSequenceRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const streamConnectedRef = useRef(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const acceptSettings = useCallback((response, sequence) => {
    const incoming = normalizeShopSettings(response);
    if (!hasValidShopHours(incoming)) {
      throw new Error('Shop operating hours are unavailable.');
    }
    if (!shouldAcceptShopSettings(settingsRef.current, incoming, acceptedSequenceRef.current, sequence)) {
      return settingsRef.current;
    }
    acceptedSequenceRef.current = sequence;
    settingsRef.current = incoming;
    const serverTime = Date.parse(incoming.serverTime);
    if (Number.isFinite(serverTime)) clockOffsetRef.current = serverTime - Date.now();
    if (mountedRef.current) {
      setShopSettings((previous) => JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming);
      setClock(Date.now() + clockOffsetRef.current);
      setShopSettingsError('');
      setIsShopSettingsLoading(false);
    }
    return incoming;
  }, []);

  const refreshShopSettings = useCallback(async () => {
    const sequence = ++sequenceRef.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await apiRequest('/api/shop-settings', { cache: 'no-store', signal: controller.signal });
      const normalized = acceptSettings(response, sequence);
      if (mountedRef.current) setStreamBase(API_BASE_URL);
      return normalized;
    } catch (error) {
      if (mountedRef.current && sequence >= acceptedSequenceRef.current) {
        setShopSettingsError(UNVERIFIED_HOURS);
        setIsShopSettingsLoading(false);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }, [acceptSettings]);

  useEffect(() => {
    let disposed = false;
    let timeout;
    let refreshing = false;
    const refresh = async () => {
      if (disposed || refreshing) return;
      refreshing = true;
      window.clearTimeout(timeout);
      try { await refreshShopSettings(); } catch { /* Keep retrying; consumers display verification state. */ }
      finally {
        refreshing = false;
        if (!disposed) timeout = window.setTimeout(refresh, streamConnectedRef.current ? 15000 : 3000);
      }
    };
    const resume = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    void refresh();
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [refreshShopSettings]);

  useEffect(() => {
    if (typeof EventSource === 'undefined' || !streamBase) return undefined;
    const stream = new EventSource(`${streamBase.replace(/\/$/, '')}/api/shop-settings/events`);
    const receive = (event) => {
      try {
        acceptSettings(JSON.parse(event.data), ++sequenceRef.current);
        streamConnectedRef.current = true;
      } catch { void refreshShopSettings().catch(() => {}); }
    };
    const unavailable = () => {
      streamConnectedRef.current = false;
      setShopSettingsError(UNVERIFIED_HOURS);
      void refreshShopSettings().catch(() => {});
    };
    const reconnect = () => {
      streamConnectedRef.current = false;
      // EventSource retries automatically; HTTP polling covers unsupported proxies.
      void refreshShopSettings().catch(() => {});
    };
    stream.addEventListener('shop-settings', receive);
    stream.addEventListener('shop-settings-unavailable', unavailable);
    stream.addEventListener('error', reconnect);
    return () => {
      streamConnectedRef.current = false;
      stream.close();
    };
  }, [acceptSettings, refreshShopSettings, streamBase]);

  useEffect(() => subscribeToDatabaseChanges({
    channelName: 'shop-settings-sync', tables: ['shop_settings'], onChange: refreshShopSettings,
  }), [refreshShopSettings]);

  useEffect(() => {
    let timeout;
    const tick = () => {
      window.clearTimeout(timeout);
      const now = Date.now() + clockOffsetRef.current;
      setClock(now);
      // Times are stored to the minute; update exactly at the next minute boundary.
      timeout = window.setTimeout(tick, 60000 - (now % 60000) + 20);
    };
    tick();
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [shopSettings]);

  const updateShopSettings = useCallback(async (updates) => {
    const sequence = ++sequenceRef.current;
    const response = await apiRequest('/api/shop-settings', {
      method: 'PATCH', cache: 'no-store', body: JSON.stringify(updates),
    }, { auth: true, accessToken: session?.access_token });
    return acceptSettings(response, sequence);
  }, [acceptSettings, session?.access_token]);

  const value = useMemo(() => ({
    shopSettings,
    isShopSettingsLoading,
    shopSettingsError,
    refreshShopSettings,
    updateShopSettings,
    canEditShopSettings: userRole === 'admin',
    isShopOpen: !isShopSettingsLoading && !shopSettingsError && isWithinOperatingHours(shopSettings, new Date(clock)),
    closingTimeLabel: formatShopTime(shopSettings.closingTime),
    operatingHoursLabel: shopSettings.openingTime && shopSettings.closingTime
      ? `${formatShopTime(shopSettings.openingTime)} – ${formatShopTime(shopSettings.closingTime)}${shopSettings.closingTime < shopSettings.openingTime ? ' (next day)' : ''} PHT`
      : 'Hours unavailable',
  }), [clock, isShopSettingsLoading, shopSettingsError, refreshShopSettings, shopSettings, updateShopSettings, userRole]);

  return <ShopSettingsContext.Provider value={value}>{children}</ShopSettingsContext.Provider>;
};
