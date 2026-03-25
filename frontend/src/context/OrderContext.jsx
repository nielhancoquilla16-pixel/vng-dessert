/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, isBackendIssueError } from '../lib/api';
import { useAuth } from './AuthContext';

const OrderContext = createContext();

const parseCurrencyAmount = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;

  const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLineItems = (items = []) => (
  items.map((item) => ({
    ...item,
    productId: item.productId || item.product_id || item.id,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
    lineTotal: Number(item.lineTotal) || (Number(item.price) || 0) * (Number(item.quantity) || 0),
  }))
);

const buildItemsText = (lineItems = []) => (
  lineItems.map((item) => `${item.quantity}x ${item.name || item.product?.productName || 'Unknown Product'}`).join(', ')
);

const getPaymentLabel = (value = 'cash') => {
  const normalized = String(value || 'cash').toLowerCase();

  if (normalized === 'gcash') {
    return 'GCash';
  }

  if (normalized === 'online') {
    return 'Online Payment';
  }

  return 'Cash';
};

const normalizeOrder = (order) => {
  const lineItems = normalizeLineItems(order.lineItems || order.items || []);
  const totalAmount = Number(order.totalAmount ?? order.totalPrice) || parseCurrencyAmount(order.total);
  const createdAt = order.createdAt || order.created_at || new Date().toISOString();
  const paymentLabel = getPaymentLabel(order.paymentMethod);
  const itemsText = typeof order.items === 'string'
    ? order.items
    : (order.itemsText || buildItemsText(lineItems));

  return {
    ...order,
    id: order.id,
    displayId: order.displayId || order.display_id || order.id,
    orderCode: order.orderCode || order.order_code || order.displayId || order.display_id || order.id,
    createdAt,
    date: order.date || createdAt.split('T')[0],
    status: (order.status || order.orderStatus || 'pending').toLowerCase(),
    orderStatus: (order.orderStatus || order.status || 'pending').toLowerCase(),
    totalAmount,
    totalPrice: totalAmount,
    total: typeof order.total === 'string' ? order.total : `PHP ${totalAmount.toFixed(2)}`,
    lineItems,
    items: itemsText,
    itemsText,
    subtext: order.subtext || (order.deliveryMethod === 'delivery'
      ? order.address
      : `Walk-in / ${paymentLabel}${paymentLabel === 'Cash' ? ' on Pickup' : ''}`),
    qrClaimedAt: order.qrClaimedAt || order.qr_claimed_at || null,
    readyNotifiedAt: order.readyNotifiedAt || order.ready_notified_at || null,
    readyNotificationMessage: order.readyNotificationMessage || order.ready_notification_message || '',
    receiptImageUrl: order.receiptImageUrl || order.receipt_image_url || '',
    receiptReceivedAt: order.receiptReceivedAt || order.receipt_received_at || null,
    qrActive: Boolean(order.qrActive ?? order.qr_active ?? (
      String(order.deliveryMethod || '').toLowerCase() === 'pickup'
      && String(order.paymentMethod || '').toLowerCase() === 'cash'
      && !order.qrClaimedAt
      && !order.qr_claimed_at
      && !['completed', 'received', 'cancelled'].includes((order.status || order.orderStatus || 'pending').toLowerCase())
    )),
  };
};

export const useOrders = () => {
  const context = useContext(OrderContext);
  if (!context) {
    throw new Error('useOrders must be used within an OrderProvider');
  }
  return context;
};

export const OrderProvider = ({ children }) => {
  const { session, userRole, isAuthLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(true);

  const refreshOrders = useCallback(async () => {
    if (!session?.access_token) {
      setOrders([]);
      return [];
    }

    const endpoint = ['admin', 'staff'].includes(userRole) ? '/api/orders' : '/api/orders/mine';
    const response = await apiRequest(endpoint, {}, {
      auth: true,
      accessToken: session.access_token,
    });

    const normalizedOrders = (response || []).map(normalizeOrder);
    setOrders(normalizedOrders);
    return normalizedOrders;
  }, [session, userRole]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    let isActive = true;

    const loadOrders = async () => {
      try {
        setIsOrdersLoading(true);
        const nextOrders = await refreshOrders();
        if (isActive) {
          setOrders(nextOrders);
        }
      } catch (error) {
        if (isBackendIssueError(error)) {
          console.warn('Orders are temporarily unavailable:', error.message);
        } else {
          console.error('Failed to load orders:', error);
        }
        if (isActive) {
          setOrders([]);
        }
      } finally {
        if (isActive) {
          setIsOrdersLoading(false);
        }
      }
    };

    loadOrders();

    return () => {
      isActive = false;
    };
  }, [isAuthLoading, refreshOrders]);

  const addOrder = useCallback(async (orderData) => {
    const payload = {
      customer_name: orderData.customer || '',
      phone_number: orderData.phoneNumber || '',
      address: orderData.address || '',
      delivery_method: orderData.deliveryMethod || 'pickup',
      payment_method: orderData.paymentMethod || 'cash',
      total_price: Number(orderData.totalAmount) || parseCurrencyAmount(orderData.total),
      order_status: (orderData.status || 'pending').toLowerCase(),
      items: (orderData.lineItems || []).map((item) => ({
        product_id: item.productId || item.product_id || item.id,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
      })),
    };

    const createdOrder = await apiRequest('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = normalizeOrder(createdOrder);
    setOrders((prev) => [normalizedOrder, ...prev]);
    return normalizedOrder;
  }, [session]);

  const updateOrderStatus = useCallback(async (orderId, newStatus) => {
    const updatedOrder = await apiRequest(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ order_status: newStatus.toLowerCase() }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = normalizeOrder(updatedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  const markOrderAsReceived = useCallback(async (orderId, receiptImageDataUrl = '') => {
    const receivedOrder = await apiRequest(`/api/orders/${orderId}/receive`, {
      method: 'POST',
      body: JSON.stringify({
        receiptImageDataUrl,
      }),
    }, {
      auth: true,
      accessToken: session?.access_token,
    });

    const normalizedOrder = normalizeOrder(receivedOrder);
    setOrders((prev) => prev.map((order) => (
      order.id === normalizedOrder.id ? normalizedOrder : order
    )));
    return normalizedOrder;
  }, [session]);

  return (
    <OrderContext.Provider
      value={{
        orders,
        isOrdersLoading,
        addOrder,
        updateOrderStatus,
        markOrderAsReceived,
        refreshOrders,
      }}
    >
      {children}
    </OrderContext.Provider>
  );
};
