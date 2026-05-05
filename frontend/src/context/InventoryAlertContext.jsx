/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { useProducts } from './ProductContext';
import {
  DEFAULT_EXPIRY_WARNING_DAYS,
  annotateInventoryBatch,
  buildInventoryAlert,
  clampWarningDays,
  compareInventoryBatches,
} from '../utils/inventoryBatches';

const WARNING_DAYS_STORAGE_KEY = 'vng_inventory_warning_days';
const InventoryAlertContext = createContext();

const resolveInventoryType = (item, knownProductNames) => {
  const explicitType = String(item.inventoryType || item.itemType || item.type || '').trim().toLowerCase();
  if (explicitType === 'product' || explicitType === 'ingredient') {
    return explicitType;
  }

  const normalizedBatchId = String(item.batchId || item.batch_id || '').trim().toUpperCase();
  if (normalizedBatchId.startsWith('ING-')) {
    return 'ingredient';
  }

  if (normalizedBatchId.startsWith('TRAY-') || normalizedBatchId.startsWith('BATCH-')) {
    return 'product';
  }

  const normalizedName = String(item.productName || item.name || '').trim().toLowerCase();
  return knownProductNames.has(normalizedName) ? 'product' : 'ingredient';
};

const safeStorage = {
  getItem(key) {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore localStorage write failures.
    }
  },
};

export const useInventoryAlerts = () => {
  const context = useContext(InventoryAlertContext);
  if (!context) {
    throw new Error('useInventoryAlerts must be used within an InventoryAlertProvider');
  }
  return context;
};

export const InventoryAlertProvider = ({ children }) => {
  const { inventoryItems, products } = useProducts();
  const { userRole } = useAuth();
  const [warningDays, setWarningDaysState] = useState(() => (
    clampWarningDays(safeStorage.getItem(WARNING_DAYS_STORAGE_KEY) || DEFAULT_EXPIRY_WARNING_DAYS)
  ));
  const [clock, setClock] = useState(() => Date.now());
  const [popupAlerts, setPopupAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const previousAlertSignaturesRef = useRef(new Map());

  useEffect(() => {
    safeStorage.setItem(WARNING_DAYS_STORAGE_KEY, String(warningDays));
  }, [warningDays]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const knownProductNames = new Set(
    (products || [])
      .filter((item) => item.type === 'product' || !item.type)
      .map((item) => String(item.name || item.productName || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const referenceDate = new Date(clock);
  const inventoryBatches = (inventoryItems || [])
    .map((item) => {
      const annotatedItem = annotateInventoryBatch(item, warningDays, referenceDate);

      return {
        ...annotatedItem,
        inventoryType: resolveInventoryType(annotatedItem, knownProductNames),
      };
    })
    .sort(compareInventoryBatches);

  const activeAlerts = userRole === 'admin'
    ? inventoryBatches
      .filter((item) => item.inventoryType === 'product')
      .map((item) => buildInventoryAlert(item))
      .filter(Boolean)
    : [];
  const activeAlertSignature = activeAlerts.map((alert) => alert.signature).join('|');

  useEffect(() => {
    if (userRole !== 'admin') {
      previousAlertSignaturesRef.current = new Map();
      setPopupAlerts([]);
      setAlertHistory([]);
      return;
    }

    const nextAlertMap = new Map(activeAlerts.map((alert) => [alert.itemId, alert.signature]));
    const newAlerts = activeAlerts.filter((alert) => (
      previousAlertSignaturesRef.current.get(alert.itemId) !== alert.signature
    ));

    if (newAlerts.length > 0) {
      setPopupAlerts((currentAlerts) => {
        const currentSignatures = new Set(currentAlerts.map((alert) => alert.signature));
        const additions = newAlerts.filter((alert) => !currentSignatures.has(alert.signature));
        return additions.length > 0
          ? [...additions, ...currentAlerts].slice(0, 6)
          : currentAlerts;
      });

      setAlertHistory((currentHistory) => (
        [
          ...newAlerts.map((alert) => ({
            ...alert,
            detectedAt: new Date().toISOString(),
          })),
          ...currentHistory,
        ].slice(0, 20)
      ));
    }

    setPopupAlerts((currentAlerts) => (
      currentAlerts.filter((alert) => nextAlertMap.get(alert.itemId) === alert.signature)
    ));

    previousAlertSignaturesRef.current = nextAlertMap;
  }, [activeAlertSignature, userRole]);

  const dismissPopupAlert = (alertId) => {
    setPopupAlerts((currentAlerts) => currentAlerts.filter((alert) => alert.id !== alertId));
  };

  const clearAlertHistory = () => {
    setAlertHistory([]);
  };

  const setWarningDays = (value) => {
    setWarningDaysState(clampWarningDays(value));
  };

  return (
    <InventoryAlertContext.Provider
      value={{
        warningDays,
        setWarningDays,
        inventoryBatches,
        activeAlerts,
        popupAlerts,
        alertHistory,
        dismissPopupAlert,
        clearAlertHistory,
      }}
    >
      {children}
    </InventoryAlertContext.Provider>
  );
};
