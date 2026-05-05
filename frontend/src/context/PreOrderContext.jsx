/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import { useAuth } from './AuthContext';
import { normalizePreOrderStatus } from '../utils/preOrders';

const PreOrderContext = createContext();

const normalizeNotifications = (notifications = []) => (
  Array.isArray(notifications)
    ? notifications.map((notification) => ({
        audience: String(notification?.audience || 'customer').toLowerCase(),
        type: String(notification?.type || 'info').toLowerCase(),
        message: String(notification?.message || '').trim(),
        createdAt: notification?.createdAt || notification?.created_at || new Date().toISOString(),
      }))
    : []
);

const normalizePreOrder = (preOrder) => {
  if (!preOrder || typeof preOrder !== 'object') {
    return null;
  }

  const deliveryMethod = String(preOrder.deliveryMethod || preOrder.delivery_method || 'cod').toLowerCase();
  const preferredOrderDate = preOrder.preferredOrderDate || preOrder.preferred_order_date || '';
  const preferredOrderTime = preOrder.preferredOrderTime || preOrder.preferred_order_time || '';
  const pickupDate = preOrder.pickupDate || preOrder.pickup_date || '';
  const pickupTime = preOrder.pickupTime || preOrder.pickup_time || '';
  const scheduledDate = preOrder.scheduledDate || preOrder.scheduled_date || preferredOrderDate || pickupDate || '';
  const scheduledTime = preOrder.scheduledTime || preOrder.scheduled_time || preferredOrderTime || pickupTime || '';

  return {
    ...preOrder,
    id: preOrder.id,
    userId: preOrder.userId || preOrder.user_id || '',
    productId: preOrder.productId || preOrder.product_id || '',
    productName: preOrder.productName || preOrder.product_name || '',
    productCategory: preOrder.productCategory || preOrder.product_category || '',
    productImageUrl: preOrder.productImageUrl || preOrder.product_image_url || '',
    productPrice: Number(preOrder.productPrice || preOrder.product_price || 0) || 0,
    customerName: preOrder.customerName || preOrder.customer_name || '',
    phoneNumber: preOrder.phoneNumber || preOrder.phone_number || '',
    address: preOrder.address || '',
    quantity: Number(preOrder.quantity) || 0,
    preferredOrderDate,
    preferredOrderTime,
    pickupDate,
    pickupTime,
    scheduledDate,
    scheduledTime,
    deliveryMethod,
    status: normalizePreOrderStatus(preOrder.status || preOrder.pre_order_status || 'pending'),
    rejectionReason: preOrder.rejectionReason || preOrder.rejection_reason || '',
    notifications: normalizeNotifications(preOrder.notifications || []),
    statusTimestamps: preOrder.statusTimestamps || preOrder.status_timestamps || {},
    createdAt: preOrder.createdAt || preOrder.created_at || '',
    updatedAt: preOrder.updatedAt || preOrder.updated_at || preOrder.createdAt || preOrder.created_at || '',
  };
};

export const usePreOrders = () => {
  const context = useContext(PreOrderContext);
  if (!context) {
    throw new Error('usePreOrders must be used within a PreOrderProvider');
  }
  return context;
};

export const PreOrderProvider = ({ children }) => {
  const { session, userRole, isAuthLoading } = useAuth();
  const [preOrders, setPreOrders] = useState([]);
  const [isPreOrdersLoading, setIsPreOrdersLoading] = useState(true);

  const refreshPreOrders = useCallback(async () => {
    if (!session?.access_token) {
      setPreOrders([]);
      return [];
    }

    const endpoint = ['admin', 'staff'].includes(userRole) ? '/api/pre-orders' : '/api/pre-orders/mine';
    const response = await apiRequest(endpoint, {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalized = (response || []).map(normalizePreOrder).filter(Boolean);
    setPreOrders(normalized);
    return normalized;
  }, [session, userRole]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadPreOrders = async () => {
      try {
        setIsPreOrdersLoading(true);
        const nextPreOrders = await refreshPreOrders();
        if (isActive) {
          setPreOrders(nextPreOrders);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Pre-orders are temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load pre-orders:', error);
        }
        if (isActive) {
          setPreOrders([]);
        }
      } finally {
        if (isActive) {
          setIsPreOrdersLoading(false);
        }
      }
    };

    loadPreOrders();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, refreshPreOrders]);

  useEffect(() => {
    if (isAuthLoading || !session?.access_token) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: `pre-orders-sync-${userRole || 'guest'}`,
      tables: ['pre_orders'],
      onChange: refreshPreOrders,
    });
  }, [isAuthLoading, refreshPreOrders, session?.access_token, userRole]);

  const createPreOrder = useCallback(async (preOrderData) => {
    const createdPreOrder = await apiRequest('/api/pre-orders', {
      method: 'POST',
      body: JSON.stringify({
        product_id: preOrderData.productId,
        customer_name: preOrderData.customerName,
        address: preOrderData.address,
        phone_number: preOrderData.phoneNumber,
        quantity: Number(preOrderData.quantity) || 0,
        preferred_order_date: preOrderData.preferredOrderDate,
        preferred_order_time: preOrderData.preferredOrderTime,
        delivery_method: preOrderData.deliveryMethod || 'cod',
        pickup_date: preOrderData.pickupDate || null,
        pickup_time: preOrderData.pickupTime || null,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalized = normalizePreOrder(createdPreOrder);
    if (normalized) {
      setPreOrders((prev) => {
        const nextItems = prev.filter((item) => item.id !== normalized.id);
        return [normalized, ...nextItems];
      });
    }
    return normalized;
  }, [session]);

  const syncPreOrderFromResponse = (response) => normalizePreOrder(response?.preOrder || response);

  const updatePreOrderStatus = useCallback(async (preOrderId, status, reason = '') => {
    const updatedPreOrder = await apiRequest(`/api/pre-orders/${preOrderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: normalizePreOrderStatus(status),
        ...(reason ? { reason } : {}),
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalized = syncPreOrderFromResponse(updatedPreOrder);
    if (normalized) {
      setPreOrders((prev) => prev.map((item) => (
        item.id === normalized.id ? normalized : item
      )));
    }
    return normalized;
  }, [session]);

  return (
    <PreOrderContext.Provider
      value={{
        preOrders,
        isPreOrdersLoading,
        createPreOrder,
        updatePreOrderStatus,
        refreshPreOrders,
      }}
    >
      {children}
    </PreOrderContext.Provider>
  );
};
