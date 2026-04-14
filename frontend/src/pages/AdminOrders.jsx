import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BellRing,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Loader2,
  PackageCheck,
  PencilLine,
  Plus,
  Minus,
  Trash2,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useOrders } from '../context/OrderContext';
import {
  buildOrderWorkflowProgress,
  canStaffCancelOrder,
  getOrderStatusLabel,
  getReviewStatusLabel,
  isWalkInOrder,
  normalizeReviewStatus,
} from '../utils/orderWorkflow';
const STATUS_FILTERS = [
  'all',
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out-for-delivery',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'under_review',
];

const STATUS_PRIORITY = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  'out-for-delivery': 4,
  delivered: 5,
  completed: 6,
  cancelled: 7,
  refunded: 8,
};

const STATUS_BADGE_BASE_CLASS = 'inline-flex items-center justify-center rounded-full border px-[1rem] py-[0.48rem] text-[0.72rem] font-bold leading-none tracking-[-0.01em]';

const STATUS_BADGE_CLASSES = {
  pending: 'border-[#efd470] bg-[#fff1bf] text-[#9a6a00]',
  confirmed: 'border-[#c7dcfb] bg-[#ebf4ff] text-[#386faf]',
  preparing: 'border-[#d9cef8] bg-[#f3edff] text-[#7353b3]',
  ready: 'border-[#d9edb5] bg-[#f1f9da] text-[#5b7b1d]',
  'out-for-delivery': 'border-[#c7dcfb] bg-[#ebf4ff] text-[#386faf]',
  delivered: 'border-[#c7dcfb] bg-[#dcecff] text-[#245bdf]',
  completed: 'border-[#bfdacb] bg-[#e7f6ec] text-[#2b7752]',
  cancelled: 'border-[#f4c1c5] bg-[#feeaec] text-[#b04855]',
  refunded: 'border-[#ffd18d] bg-[#fff5e4] text-[#cc6a11]',
  review: 'border-[#ffd18d] bg-[#fff5e4] text-[#cc6a11]',
};

const SURFACE_CARD_CLASS = 'rounded-[1.95rem] border border-[#dbe5f1] bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] shadow-[0_10px_24px_rgba(225,233,244,0.26)]';
const TILE_CLASS = 'rounded-[1.25rem] border border-[#dbe5f1] bg-white px-5 py-[0.9rem]';
const TILE_LABEL_CLASS = 'mb-[0.28rem] block text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-[#91a4c4]';
const TILE_VALUE_CLASS = 'text-[0.98rem] font-black tracking-[-0.02em] text-[#11254e]';
const ORDER_KICKER_CLASS = 'm-0 text-[0.82rem] font-extrabold uppercase tracking-[0.12em] text-[#ff6a00]';
const SECTION_KICKER_CLASS = 'm-0 text-[0.86rem] font-medium tracking-[-0.01em] text-[#5d7294]';
const DETAIL_BLOCK_CLASS = 'grid gap-4 rounded-[1.4rem] border border-[#dbe5f1] bg-[#fcfdff] p-4';
const DETAIL_BLOCK_HEADER_CLASS = 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between';
const ACTIONS_CLASS = 'flex flex-col gap-3 md:flex-row md:flex-wrap';
const EMPTY_INLINE_CLASS = 'rounded-[1.15rem] border border-dashed border-[#ccd7e6] bg-[#f8fbff] px-4 py-[0.95rem] leading-[1.5] text-[#64748b]';
const TEXT_INPUT_CLASS = 'w-full rounded-[1.15rem] border border-[#d4deeb] bg-white px-4 py-[1rem] text-[0.98rem] text-[#0f254d] focus:border-[#f4a64d] focus:outline-none focus:shadow-[0_0_0_4px_rgba(255,175,76,0.14)]';
const SEARCH_INPUT_WRAP_CLASS = 'flex items-center gap-[0.95rem] rounded-[1.25rem] border border-[#d4deeb] bg-[#fbfcfe] px-5 py-[0.85rem] text-[#91a4c4]';
const SEARCH_INPUT_CLASS = 'min-w-0 flex-1 border-none bg-transparent text-[#4d6387] outline-none placeholder:text-[#6f84a8]';
const ACTION_BUTTON_BASE_CLASS = 'inline-flex w-full items-center justify-center gap-[0.55rem] rounded-[1.15rem] border px-[1.2rem] py-[0.95rem] font-extrabold transition-[transform,box-shadow,background] duration-200 ease-[ease] hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-75 disabled:transform-none md:w-auto';
const EDIT_ITEM_BUTTON_CLASS = 'inline-flex h-8 w-8 items-center justify-center rounded-[0.8rem] border border-[#d4deeb] bg-white text-[#0f254d] transition-colors duration-200 ease-[ease] hover:bg-[#f7faff]';

const cx = (...classes) => classes.filter(Boolean).join(' ');

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeFilterValue = (value) => String(value || 'all').toLowerCase();

const getStatusBadgeClass = (status) => (
  cx(
    STATUS_BADGE_BASE_CLASS,
    STATUS_BADGE_CLASSES[String(status || '').toLowerCase()] || 'border-[#e2e8f0] bg-[#f8fafc] text-[#475569]',
  )
);

const getActionButtonClass = (variant, { active = false } = {}) => {
  if (variant === 'primary') {
    return cx(
      ACTION_BUTTON_BASE_CLASS,
      'border-transparent bg-[linear-gradient(135deg,_#ff8a3d,_#f26d21)] text-white shadow-[0_14px_26px_rgba(255,138,61,0.28)]',
    );
  }

  if (variant === 'secondary') {
    return cx(
      ACTION_BUTTON_BASE_CLASS,
      'border-[#ffd18d] bg-[#fff7eb] text-[#d56310] hover:bg-[#ffeed6]',
    );
  }

  if (variant === 'ghost') {
    return cx(
      ACTION_BUTTON_BASE_CLASS,
      'border-[#d8e3f1] bg-white text-[#0f254d] hover:bg-[#f7faff]',
    );
  }

  return cx(
    ACTION_BUTTON_BASE_CLASS,
    active ? 'border-[#f4c1c5] bg-[#feeaec] text-[#b04855]' : 'border-[#f2c7cb] bg-white text-[#b04855] hover:bg-[#fff4f5]',
  );
};

const getNextWorkflowAction = (order) => {
  const status = String(order?.status || '').toLowerCase();
  const deliveryMethod = String(order?.deliveryMethod || '').toLowerCase();

  if (status === 'pending') {
    return { label: 'Confirm Order', nextStatus: 'confirmed', icon: BadgeCheck };
  }

  if (status === 'confirmed') {
    return { label: 'Start Preparing', nextStatus: 'preparing', icon: Clock3 };
  }

  if (status === 'preparing') {
    return { label: 'Mark Ready', nextStatus: 'ready', icon: PackageCheck };
  }

  if (status === 'ready' && deliveryMethod === 'delivery') {
    return { label: 'Out for Delivery', nextStatus: 'out-for-delivery', icon: Truck };
  }

  if (status === 'ready' && deliveryMethod === 'pickup') {
    return { label: 'Mark Delivered', nextStatus: 'delivered', icon: CheckCircle2 };
  }

  if (status === 'out-for-delivery') {
    return { label: 'Mark Delivered', nextStatus: 'delivered', icon: CheckCircle2 };
  }

  return null;
};

const formatIssueType = (value) => String(value || 'damage').replace(/_/g, ' ');

const AdminOrders = () => {
  const { orders, updateOrderStatus, updateOrderItems, cancelOrder } = useOrders();
  const { products, validateStockAvailability } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [pageError, setPageError] = useState('');
  const [loadingAction, setLoadingAction] = useState(null);
  const [cancelDrafts, setCancelDrafts] = useState({});
  const [openCancelOrderId, setOpenCancelOrderId] = useState('');
  const [openEditOrderId, setOpenEditOrderId] = useState('');
  const [editDraft, setEditDraft] = useState(null);
  const [editSearchTerm, setEditSearchTerm] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    if (!selectedOrderId && orders.length > 0) {
      setSelectedOrderId(orders[0].id);
    }
  }, [orders, selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    const filterValue = normalizeFilterValue(selectedFilter);

    return [...orders]
      .filter((order) => {
        const displayId = String(order.displayId || order.orderCode || order.id || '').toLowerCase();
        const customer = String(order.customer || '').toLowerCase();
        const items = String(order.items || '').toLowerCase();
        const reviewStatus = normalizeReviewStatus(order.reviewStatus);
        const statusMatches = filterValue === 'all'
          || String(order.status || '').toLowerCase() === filterValue
          || (filterValue === 'under_review' && reviewStatus === 'under_review');
        const searchMatches = !search
          || displayId.includes(search)
          || customer.includes(search)
          || items.includes(search);

        return statusMatches && searchMatches;
      })
      .sort((left, right) => {
        const leftPriority = STATUS_PRIORITY[left.status] ?? 99;
        const rightPriority = STATUS_PRIORITY[right.status] ?? 99;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return new Date(right.createdAt || right.date || 0).getTime()
          - new Date(left.createdAt || left.date || 0).getTime();
      });
  }, [orders, searchTerm, selectedFilter]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      return;
    }

    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedOrderId]);

  const selectedOrder = useMemo(() => (
    filteredOrders.find((order) => order.id === selectedOrderId) || filteredOrders[0] || null
  ), [filteredOrders, selectedOrderId]);

  const summaryCards = useMemo(() => {
    const underReviewCount = orders.filter((order) => normalizeReviewStatus(order.reviewStatus) === 'under_review').length;
    const pendingCount = orders.filter((order) => String(order.status || '').toLowerCase() === 'pending').length;
    const activeCount = orders.filter((order) => !['completed', 'cancelled', 'refunded'].includes(String(order.status || '').toLowerCase())).length;

    return [
      { label: 'Active Queue', value: activeCount, helper: 'Orders still in motion' },
      { label: 'Pending', value: pendingCount, helper: 'Waiting for confirmation' },
      { label: 'Under Review', value: underReviewCount, helper: 'Discrepancy or refund review' },
      { label: 'All Orders', value: orders.length, helper: 'Total records in the system' },
    ];
  }, [orders]);

  useEffect(() => {
    if (!selectedOrder) {
      if (openEditOrderId) {
        setOpenEditOrderId('');
        setEditDraft(null);
        setEditSearchTerm('');
      }
      return;
    }

    if (selectedOrder.id !== openEditOrderId) {
      setOpenEditOrderId('');
      setEditDraft(null);
      setEditSearchTerm('');
    }
  }, [selectedOrder, openEditOrderId]);

  const selectedOrderIsWalkIn = selectedOrder ? Boolean(selectedOrder?.isWalkInOrder ?? isWalkInOrder(selectedOrder)) : false;

  const canEditSelectedOrder = Boolean(
    selectedOrder
    && selectedOrderIsWalkIn
    && ['pending', 'confirmed'].includes(String(selectedOrder.status || '').toLowerCase())
    && normalizeReviewStatus(selectedOrder.reviewStatus) !== 'under_review',
  );

  const loadingEdit = loadingAction?.type === 'edit' && loadingAction.orderId === selectedOrder?.id;
  const isEditOpen = openEditOrderId === selectedOrder?.id;

  const editableProducts = useMemo(() => {
    const search = editSearchTerm.trim().toLowerCase();

    return products
      .filter((product) => (product.type === 'product' || !product.type))
      .filter((product) => {
        if (!search) {
          return true;
        }

        return String(product.name || '').toLowerCase().includes(search)
          || String(product.category || '').toLowerCase().includes(search);
      })
      .slice(0, 12);
  }, [products, editSearchTerm]);

  const buildEditDraft = (order) => ({
    customerName: order?.customer || '',
    phoneNumber: order?.phoneNumber || '',
    address: order?.address || '',
    deliveryMethod: order?.deliveryMethod || 'pickup',
    paymentMethod: order?.paymentMethod || 'cash',
    deliveryDistanceKm: Number.isFinite(Number(order?.deliveryDistanceKm))
      ? Number(order?.deliveryDistanceKm)
      : '',
    lineItems: (order?.lineItems || []).map((item) => {
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const price = Number(item.price) || 0;

      return {
        id: item.id || item.productId || item.name,
        productId: item.productId || item.id,
        name: item.name || item.product?.productName || 'Unknown Product',
        category: item.category || item.product?.category || 'Uncategorized',
        quantity,
        price,
        lineTotal: price * quantity,
      };
    }),
  });

  const formatStockShortageSummary = (shortages = []) => (
    shortages
      .map((item) => `${item.name} (${item.available} left, requested ${item.requested})`)
      .join(', ')
  );

  const syncEditLineItems = (nextLineItems) => {
    const normalizedItems = nextLineItems.map((item) => ({
      ...item,
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Number(item.price) || 0,
      lineTotal: (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1),
    }));
    const stockCheck = validateStockAvailability(normalizedItems);

    if (!stockCheck.isAvailable) {
      setEditError(`Not enough stock for: ${formatStockShortageSummary(stockCheck.shortages)}.`);
      return false;
    }

    setEditError('');
    setEditDraft((current) => (current ? { ...current, lineItems: normalizedItems } : current));
    return true;
  };

  const startEditOrder = (order) => {
    setOpenCancelOrderId('');
    setEditSearchTerm('');
    setEditError('');
    setPageError('');
    setOpenEditOrderId(order.id);
    setEditDraft(buildEditDraft(order));
  };

  const stopEditOrder = () => {
    setOpenEditOrderId('');
    setEditDraft(null);
    setEditSearchTerm('');
    setEditError('');
  };

  const addProductToEditDraft = (product) => {
    if (!editDraft) {
      return;
    }

    const existing = editDraft.lineItems.find((item) => String(item.productId) === String(product.id));
    const nextLineItems = existing
      ? editDraft.lineItems.map((item) => {
          if (String(item.productId) !== String(product.id)) {
            return item;
          }

          const nextQuantity = Number(item.quantity) + 1;
          return {
            ...item,
            quantity: nextQuantity,
            lineTotal: (Number(item.price) || 0) * nextQuantity,
          };
        })
      : [
          ...editDraft.lineItems,
          {
            id: product.id,
            productId: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            quantity: 1,
            price: Number(product.price) || 0,
            lineTotal: Number(product.price) || 0,
          },
        ];

    syncEditLineItems(nextLineItems);
  };

  const updateEditQuantity = (productId, delta) => {
    if (!editDraft) {
      return;
    }

    const nextLineItems = editDraft.lineItems
      .map((item) => {
        if (String(item.productId) !== String(productId)) {
          return item;
        }

        const nextQuantity = Number(item.quantity) + delta;
        if (nextQuantity <= 0) {
          return null;
        }

        return {
          ...item,
          quantity: nextQuantity,
          lineTotal: (Number(item.price) || 0) * nextQuantity,
        };
      })
      .filter(Boolean);

    syncEditLineItems(nextLineItems);
  };

  const removeEditItem = (productId) => {
    if (!editDraft) {
      return;
    }

    syncEditLineItems(editDraft.lineItems.filter((item) => String(item.productId) !== String(productId)));
  };

  const handleSaveEditOrder = async () => {
    if (!selectedOrder || !editDraft) {
      return;
    }

    const normalizedItems = editDraft.lineItems.map((item) => ({
      ...item,
      quantity: Math.max(1, Number(item.quantity) || 1),
      price: Number(item.price) || 0,
      lineTotal: (Number(item.price) || 0) * Math.max(1, Number(item.quantity) || 1),
    }));

    if (normalizedItems.length === 0) {
      setEditError('Add at least one item before saving this order.');
      return;
    }

    const stockCheck = validateStockAvailability(normalizedItems);
    if (!stockCheck.isAvailable) {
      setEditError(`Not enough stock for: ${formatStockShortageSummary(stockCheck.shortages)}.`);
      return;
    }

    setLoadingAction({ type: 'edit', orderId: selectedOrder.id });
    setPageError('');

    try {
      const updated = await updateOrderItems(selectedOrder.id, {
        customer: editDraft.customerName,
        phoneNumber: editDraft.phoneNumber || selectedOrder.phoneNumber || '',
        address: editDraft.address || selectedOrder.address || '',
        deliveryMethod: editDraft.deliveryMethod || selectedOrder.deliveryMethod || 'pickup',
        paymentMethod: editDraft.paymentMethod || selectedOrder.paymentMethod || 'cash',
        deliveryDistanceKm: editDraft.deliveryDistanceKm,
        lineItems: normalizedItems,
      });

      setPageNotice(`Order ${selectedOrder.displayId || selectedOrder.orderCode || selectedOrder.id} was updated.`);
      if (updated?.status === 'cancelled') {
        setPageNotice(`Order ${selectedOrder.displayId || selectedOrder.orderCode || selectedOrder.id} was updated, but it was also cancelled because of a delivery restriction.`);
      }
      stopEditOrder();
    } catch (error) {
      setEditError(error.message || 'Unable to update this order right now.');
      setPageError(error.message || 'Unable to update this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const updateStatus = async (order, nextStatus) => {
    setLoadingAction({ type: 'status', orderId: order.id, status: nextStatus });
    setPageError('');

    try {
      await updateOrderStatus(order.id, nextStatus);
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} moved to ${getOrderStatusLabel(nextStatus, 'admin')}.`);
    } catch (error) {
      setPageError(error.message || 'Unable to update this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const setCancelDraft = (orderId, patch) => {
    setCancelDrafts((current) => ({
      ...current,
      [orderId]: {
        ...(current[orderId] || {
          reason: '',
          error: '',
        }),
        ...patch,
      },
    }));
  };

  const handleCancel = async (order) => {
    const draft = cancelDrafts[order.id] || {};
    const reason = String(draft.reason || '').trim();

    setLoadingAction({ type: 'cancel', orderId: order.id });
    setPageError('');

    try {
      await cancelOrder(order.id, reason);
      setCancelDraft(order.id, {
        reason: '',
        error: '',
      });
      setOpenCancelOrderId('');
      setPageNotice(`Order ${order.displayId || order.orderCode || order.id} was cancelled.`);
    } catch (error) {
      setCancelDraft(order.id, {
        error: error.message || 'Unable to cancel this order right now.',
      });
      setPageError(error.message || 'Unable to cancel this order right now.');
    } finally {
      setLoadingAction(null);
    }
  };

  const renderStatusRibbon = (order) => (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-5 rounded-[1.7rem] border border-[#f1cf69] bg-[radial-gradient(circle_at_top_center,_rgba(255,205,126,0.18),_transparent_45%),linear-gradient(180deg,_#fffaf0_0%,_#ffffff_100%)] px-6 py-5 min-[520px]:grid-cols-3 min-[1101px]:grid-cols-5"
      aria-label={`Workflow for ${order.displayId || order.id}`}
    >
      {buildOrderWorkflowProgress(order.status).map((step) => (
        <div
          key={step.status}
          className="grid justify-items-center gap-[0.6rem] text-center text-[#5c7092]"
        >
          <span
            className={cx(
              'h-[1.02rem] w-[1.02rem] rounded-full bg-[#dbe4ef]',
              step.isComplete && 'bg-[#ff983c]',
              step.isCurrent && 'bg-[#f4741f] shadow-[0_0_0_7px_rgba(255,152,60,0.18)]',
            )}
          />
          <strong className="text-[0.78rem] font-bold leading-[1.2] text-[#5f7397]">{step.label}</strong>
        </div>
      ))}
    </div>
  );

  const renderCancelPanel = (order, isOpen) => {
    if (!canStaffCancelOrder(order) || !isOpen) {
      return null;
    }

    const draft = cancelDrafts[order.id] || {
      reason: '',
      error: '',
    };
    const isLoading = loadingAction?.type === 'cancel' && loadingAction.orderId === order.id;

    return (
      <div className="grid gap-4 rounded-[1.55rem] border border-[#f2c7cb] bg-[linear-gradient(180deg,_#fff7f8_0%,_#ffffff_100%)] p-5 shadow-[0_14px_34px_rgba(232,214,219,0.24)]">
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={ORDER_KICKER_CLASS}>Cancel order</p>
          </div>
          <button
            type="button"
            className={getActionButtonClass('ghost')}
            onClick={() => setOpenCancelOrderId('')}
          >
            Hide form
          </button>
        </div>

        <div className="grid gap-[0.45rem]">
          <label
            htmlFor={`cancel-reason-${order.id}`}
            className="text-[0.82rem] font-extrabold uppercase tracking-[0.08em] text-[#64748b]"
          >
            Reason (optional)
          </label>
          <textarea
            id={`cancel-reason-${order.id}`}
            className={cx(TEXT_INPUT_CLASS, 'min-h-[120px] resize-y')}
            value={draft.reason || ''}
            onChange={(event) => setCancelDraft(order.id, { reason: event.target.value, error: '' })}
            placeholder="Add a short reason for the cancellation."
          />
        </div>

        {draft.error && (
          <div className="rounded-[0.95rem] border border-[#fecaca] bg-[#fef2f2] px-[0.95rem] py-[0.85rem] font-semibold leading-[1.5] text-[#b91c1c]">
            {draft.error}
          </div>
        )}

        <div className={ACTIONS_CLASS}>
          <button
            type="button"
            className={getActionButtonClass('danger')}
            onClick={() => void handleCancel(order)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
            {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    );
  };

  const renderEditPanel = (order, isOpen) => {
    if (!canEditSelectedOrder || !isOpen || !editDraft) {
      return null;
    }

    const draftTotal = editDraft.lineItems.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    const draftItemCount = editDraft.lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    return (
      <div className="grid gap-4 rounded-[1.55rem] border border-[#ffd18d] bg-[linear-gradient(180deg,_#fff9f0_0%,_#ffffff_100%)] p-5 shadow-[0_14px_34px_rgba(243,224,196,0.28)]">
        <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className={ORDER_KICKER_CLASS}>Edit order</p>
            <h3 className="m-0 text-[1.18rem] font-extrabold tracking-[-0.02em] text-[#0f254d]">Walk-in pickup order</h3>
          </div>
          <button
            type="button"
            className={getActionButtonClass('ghost')}
            onClick={stopEditOrder}
          >
            Hide form
          </button>
        </div>

        <p className="m-0 leading-[1.6] text-[#64748b]">
          This order was created as a walk-in pickup order, so staff can update the item list and totals before fulfillment.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-[1.15rem] border border-[#f2d773] bg-white px-4 py-[0.95rem] shadow-[0_8px_18px_rgba(243,226,196,0.18)]">
            <span className={TILE_LABEL_CLASS}>Items</span>
            <strong className={TILE_VALUE_CLASS}>{draftItemCount}</strong>
          </div>
          <div className="rounded-[1.15rem] border border-[#f2d773] bg-white px-4 py-[0.95rem] shadow-[0_8px_18px_rgba(243,226,196,0.18)]">
            <span className={TILE_LABEL_CLASS}>Current total</span>
            <strong className={TILE_VALUE_CLASS}>{formatCurrency(draftTotal)}</strong>
          </div>
        </div>

        <div className="grid gap-[0.45rem]">
          <label htmlFor={`edit-customer-${order.id}`} className={TILE_LABEL_CLASS}>Customer name</label>
          <input
            id={`edit-customer-${order.id}`}
            className={TEXT_INPUT_CLASS}
            type="text"
            value={editDraft.customerName || ''}
            onChange={(event) => setEditDraft((current) => (
              current
                ? { ...current, customerName: event.target.value }
                : current
            ))}
            placeholder="Customer name"
          />
        </div>

        <div className="grid gap-[0.85rem] rounded-[1rem] border border-[#e2e8f0] bg-white p-[0.95rem]">
          <div className={DETAIL_BLOCK_HEADER_CLASS}>
            <h3 className="m-0 text-[1rem] text-[#0f172a]">Current items</h3>
          </div>

          {editDraft.lineItems.length === 0 ? (
            <div className={EMPTY_INLINE_CLASS}>
              No items yet. Add products below to rebuild the order.
            </div>
          ) : (
            <div className="grid gap-3">
              {editDraft.lineItems.map((item) => (
                <div
                  key={`${item.productId}-${item.name}`}
                  className="flex flex-col gap-4 rounded-[1rem] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-[0.9rem] md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <strong className="text-[#0f172a]">{item.name}</strong>
                    <p className="mt-[0.2rem] mb-0 leading-[1.4] text-[#64748b]">{item.quantity} x {formatCurrency(item.price)}</p>
                  </div>

                  <div className="inline-flex shrink-0 items-center gap-[0.35rem]">
                    <button type="button" className={EDIT_ITEM_BUTTON_CLASS} onClick={() => updateEditQuantity(item.productId, -1)}><Minus size={14} /></button>
                    <span className="min-w-6 text-center font-extrabold text-[#0f172a]">{item.quantity}</span>
                    <button type="button" className={EDIT_ITEM_BUTTON_CLASS} onClick={() => updateEditQuantity(item.productId, 1)}><Plus size={14} /></button>
                    <button
                      type="button"
                      className={cx(EDIT_ITEM_BUTTON_CLASS, 'border-[#fecaca] text-[#b91c1c]')}
                      onClick={() => removeEditItem(item.productId)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-[0.85rem] rounded-[1rem] border border-[#e2e8f0] bg-white p-[0.95rem]">
          <div className={DETAIL_BLOCK_HEADER_CLASS}>
            <h3 className="m-0 text-[1rem] text-[#0f172a]">Add more items</h3>
          </div>

          <div className="flex items-center gap-[0.65rem] rounded-[1rem] border border-[#e2e8f0] bg-[#f8fafc] px-[0.95rem] py-[0.8rem] text-[#94a3b8]">
            <Search size={16} />
            <input
              type="text"
              className={SEARCH_INPUT_CLASS}
              placeholder="Search products to add"
              value={editSearchTerm}
              onChange={(event) => setEditSearchTerm(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-[0.65rem]">
            {editableProducts.length === 0 ? (
              <div className={EMPTY_INLINE_CLASS}>
                No products match your search.
              </div>
            ) : (
              editableProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="cursor-pointer rounded-[1rem] border border-[#e2e8f0] bg-[linear-gradient(180deg,_#ffffff_0%,_#fff7ed_100%)] px-[0.9rem] py-[0.8rem] text-left transition-[transform,box-shadow,border-color] duration-200 ease-[ease] hover:-translate-y-px hover:border-[#fdba74] hover:shadow-[0_12px_22px_rgba(249,115,22,0.1)]"
                  onClick={() => addProductToEditDraft(product)}
                >
                  <span className="block font-bold leading-[1.4] text-[#0f172a]">{product.name}</span>
                  <strong className="mt-[0.35rem] block text-[#c2410c]">{formatCurrency(product.price)}</strong>
                </button>
              ))
            )}
          </div>
        </div>

        {editError && (
          <div className="rounded-[1rem] border border-[#fecaca] bg-[#fef2f2] px-4 py-[0.9rem] font-semibold leading-[1.5] text-[#b91c1c]">
            {editError}
          </div>
        )}

        <div className={ACTIONS_CLASS}>
          <button
            type="button"
            className={getActionButtonClass('primary')}
            onClick={() => void handleSaveEditOrder()}
            disabled={loadingEdit}
          >
            {loadingEdit ? <Loader2 size={16} className="animate-spin" /> : <PencilLine size={16} />}
            {loadingEdit ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            className={getActionButtonClass('ghost')}
            onClick={stopEditOrder}
            disabled={loadingEdit}
          >
            Cancel Edit
          </button>
        </div>
      </div>
    );
  };

  const selectedOrderNotifications = (selectedOrder?.notifications || [])
    .filter((notification) => {
      const audience = String(notification?.audience || '').toLowerCase();
      return audience === 'admin_staff' || audience === 'all';
    })
    .slice(0, 4);

  const selectedOrderReports = (selectedOrder?.issueReports || []).slice(0, 3);
  const nextAction = selectedOrder ? getNextWorkflowAction(selectedOrder) : null;
  const isCancelOpen = openCancelOrderId === selectedOrder?.id;
  const loadingStatus = loadingAction?.type === 'status' && loadingAction.orderId === selectedOrder?.id;
  const loadingCancel = loadingAction?.type === 'cancel' && loadingAction.orderId === selectedOrder?.id;
  const selectedOrderSourceLabel = selectedOrderIsWalkIn
    ? 'Walk-in'
    : String(selectedOrder?.paymentMethod || '').toLowerCase() === 'online'
      ? 'Online Customer'
      : 'Customer Order';

  return (
    <div className="grid w-full gap-6 text-[#0f254d]">
      <section className={cx(
        SURFACE_CARD_CLASS,
        'flex flex-col items-start gap-5 border-[rgba(255,176,93,0.45)] bg-[radial-gradient(circle_at_left_center,_rgba(255,226,184,0.3),_transparent_28%),_radial-gradient(circle_at_right_center,_rgba(255,224,182,0.38),_transparent_22%),_linear-gradient(180deg,_#fffaf3_0%,_#ffffff_100%)] px-10 py-9 md:flex-row md:items-center md:justify-between',
      )}>
        <div className="max-w-[56rem]">
          <h1 className="m-0 text-[clamp(2.6rem,4vw,4rem)] font-black tracking-[-0.05em] text-[#111c3d]">Orders</h1>
        </div>

        <div className="inline-flex min-h-[96px] min-w-[246px] shrink-0 items-center justify-center gap-4 rounded-[1.45rem] border border-[#ffc98f] bg-white px-6 py-5 text-[#e15a12] shadow-[0_16px_36px_rgba(234,221,204,0.28)]">
          <Sparkles size={21} strokeWidth={2.1} />
          <div>
            <strong className="block text-[1.55rem] font-black tracking-[-0.04em] text-[#10224a]">{orders.length}</strong>
            <span className="block text-[0.75rem] uppercase tracking-[0.17em] text-[#e15a12]">orders tracked</span>
          </div>
        </div>
      </section>

      {(pageNotice || pageError) && (
        <section className="grid gap-3" aria-live="polite">
          {pageNotice && (
            <div className="flex items-start gap-3 rounded-[1rem] border border-[#bbf7d0] bg-[#ecfdf5] px-4 py-[0.95rem] font-semibold leading-[1.5] text-[#166534]">
              <CheckCircle2 size={18} />
              <span>{pageNotice}</span>
            </div>
          )}
          {pageError && (
            <div className="flex items-start gap-3 rounded-[1rem] border border-[#fecaca] bg-[#fef2f2] px-4 py-[0.95rem] font-semibold leading-[1.5] text-[#b91c1c]">
              <XCircle size={18} />
              <span>{pageError}</span>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className={cx(SURFACE_CARD_CLASS, 'px-6 py-5')}
          >
            <p className="m-0 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-[#90a4c5]">{card.label}</p>
            <strong className="mt-2 block text-[2rem] font-black tracking-[-0.05em] text-[#0f254d]">{card.value}</strong>
            <span className="mt-1 block text-[0.9rem] leading-[1.45] text-[#64748b]">{card.helper}</span>
          </article>
        ))}
      </section>

      <section className={cx(SURFACE_CARD_CLASS, 'grid gap-4 rounded-[2rem] p-4 shadow-[0_12px_28px_rgba(223,232,244,0.24)]')}>
        <div className={SEARCH_INPUT_WRAP_CLASS}>
          <Search size={22} strokeWidth={2} />
          <input
            type="text"
            className={cx(SEARCH_INPUT_CLASS, 'text-[0.98rem] md:text-[1rem]')}
            placeholder="Search order ID, customer, or items"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-[0.65rem] md:flex-row md:flex-wrap">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className={cx(
                'cursor-pointer rounded-full border px-[1rem] py-[0.6rem] text-[0.82rem] font-extrabold tracking-[-0.01em] transition-[background,border-color,color] duration-200 ease-[ease]',
                normalizeFilterValue(selectedFilter) === filter
                  ? 'border-[#ffae57] bg-white text-[#d76516]'
                  : 'border-[#d6e1ef] bg-white text-[#36527c]',
              )}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter === 'all'
                ? 'All'
                : filter === 'under_review'
                  ? 'Under Review'
                  : getOrderStatusLabel(filter, 'admin')}
            </button>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-5 min-[1101px]:grid-cols-[minmax(0,1.14fr)_minmax(440px,0.94fr)]">
        <div className="grid gap-5">
          {filteredOrders.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center gap-[0.65rem] rounded-[1.6rem] border border-dashed border-[#ccd7e6] bg-[#f8fbff] p-8 text-center text-[#64748b]">
              <ShieldAlert size={28} />
              <p className="m-0 font-bold text-[#0f254d]">No orders match the current search or filter.</p>
              <span>Try another status or clear the search field.</span>
            </div>
          ) : (
            filteredOrders.map((order) => {
              const isSelected = selectedOrder?.id === order.id;
              const reviewStatus = normalizeReviewStatus(order.reviewStatus);

              return (
                <button
                  key={order.id}
                  type="button"
                  className={cx(
                    'grid min-h-[190px] cursor-pointer gap-[1.15rem] rounded-[2rem] border bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] px-6 py-5 text-left shadow-[0_10px_22px_rgba(225,233,244,0.22)] transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[#ffb05b]',
                    isSelected ? 'border-[#ffb05b] shadow-[0_10px_22px_rgba(243,220,190,0.22)]' : 'border-[#dbe5f1]',
                  )}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={ORDER_KICKER_CLASS}>Order</p>
                      <h3 className="mt-1.5 mb-0 text-[1.05rem] font-black tracking-[-0.03em] text-[#10224a] min-[420px]:text-[1.2rem]">
                        {order.displayId || order.orderCode || order.id}
                      </h3>
                      <span className="mt-[0.42rem] block text-[0.92rem] text-[#60779d]">
                        {order.customer || 'Customer'} - {formatDateTime(order.createdAt || order.date)}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <span className={getStatusBadgeClass(order.status)}>{getOrderStatusLabel(order.status, 'admin')}</span>
                      {reviewStatus === 'under_review' && (
                        <span className={getStatusBadgeClass('review')}>{getReviewStatusLabel(reviewStatus)}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 min-[560px]:grid-cols-3">
                    <div className={TILE_CLASS}>
                      <span className={TILE_LABEL_CLASS}>Total</span>
                      <strong className={TILE_VALUE_CLASS}>{order.total || formatCurrency(order.totalAmount)}</strong>
                    </div>
                    <div className={TILE_CLASS}>
                      <span className={TILE_LABEL_CLASS}>Method</span>
                      <strong className={TILE_VALUE_CLASS}>{order.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
                    </div>
                    <div className={TILE_CLASS}>
                      <span className={TILE_LABEL_CLASS}>Items</span>
                      <strong className={TILE_VALUE_CLASS}>{(order.lineItems || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1 text-[0.92rem] font-semibold text-[#60779d]">
                    <span>{order.containsLecheFlan ? 'Leche flan item' : 'Standard order'}</span>
                    <ChevronRight size={20} strokeWidth={2} />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <aside className="grid gap-5 rounded-[2rem] border border-[#dbe5f1] bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-6 shadow-[0_10px_24px_rgba(225,233,244,0.24)] min-[1101px]:sticky min-[1101px]:top-4">
          {!selectedOrder ? (
            <div className="grid min-h-[520px] place-items-center gap-3 p-8 text-center text-[#64748b]">
              <PackageCheck size={28} />
              <p className="m-0 font-bold text-[#0f254d]">Select an order to review the workflow, notes, and next action.</p>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={SECTION_KICKER_CLASS}>Selected order</p>
                  <h2 className="mt-1 mb-0 text-[1.75rem] font-black tracking-[-0.045em] text-[#10224a]">
                    {selectedOrder.displayId || selectedOrder.orderCode || selectedOrder.id}
                  </h2>
                  <p className="mt-[0.45rem] mb-0 text-[0.95rem] text-[#60779d]">
                    {selectedOrder.customer || 'Customer'} - {formatDateTime(selectedOrder.createdAt || selectedOrder.date)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <span className={getStatusBadgeClass(selectedOrder.status)}>{getOrderStatusLabel(selectedOrder.status, 'admin')}</span>
                  {normalizeReviewStatus(selectedOrder.reviewStatus) === 'under_review' && (
                    <span className={getStatusBadgeClass('review')}>Under Review</span>
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className={TILE_CLASS}>
                  <span className={TILE_LABEL_CLASS}>Delivery</span>
                  <strong className={TILE_VALUE_CLASS}>{selectedOrder.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'}</strong>
                </div>
                <div className={TILE_CLASS}>
                  <span className={TILE_LABEL_CLASS}>Payment</span>
                  <strong className={TILE_VALUE_CLASS}>{String(selectedOrder.paymentMethod || 'cash').toLowerCase() === 'online' ? 'Online' : 'Cash'}</strong>
                </div>
                <div className={TILE_CLASS}>
                  <span className={TILE_LABEL_CLASS}>Source</span>
                  <strong className={TILE_VALUE_CLASS}>{selectedOrderSourceLabel}</strong>
                </div>
                <div className={TILE_CLASS}>
                  <span className={TILE_LABEL_CLASS}>Distance</span>
                  <strong className={TILE_VALUE_CLASS}>{selectedOrder.deliveryDistanceKm != null ? `${Number(selectedOrder.deliveryDistanceKm).toFixed(1)} km` : 'N/A'}</strong>
                </div>
                <div className={TILE_CLASS}>
                  <span className={TILE_LABEL_CLASS}>Revenue</span>
                  <strong className={TILE_VALUE_CLASS}>{selectedOrder.total || formatCurrency(selectedOrder.totalAmount)}</strong>
                </div>
              </div>

              {renderStatusRibbon(selectedOrder)}

              {isEditOpen ? (
                renderEditPanel(selectedOrder, isEditOpen)
              ) : (
                <div className="grid gap-4 rounded-[1.4rem] border border-[#dbe5f1] bg-[#fbfdff] p-4">
                  <div className={DETAIL_BLOCK_HEADER_CLASS}>
                    <h3 className="m-0 text-[1.05rem] font-black tracking-[-0.02em] text-[#0f172a]">Items</h3>
                  </div>
                  <div className="grid gap-3">
                    {(selectedOrder.lineItems || []).map((item) => (
                      <div
                        key={`${selectedOrder.id}-${item.id || item.productId || item.name}`}
                        className="flex items-start justify-between gap-4 rounded-[1.15rem] border border-[#dbe5f1] bg-white px-4 py-4"
                      >
                        <div>
                          <strong className="text-[0.98rem] font-black tracking-[-0.02em] text-[#10224a]">{item.name}</strong>
                          <p className="mt-[0.24rem] mb-0 leading-[1.5] text-[#60779d]">{item.quantity} x {formatCurrency(item.price)}</p>
                        </div>
                        <span className="text-[0.98rem] font-medium text-[#10224a]">
                          {formatCurrency(item.lineTotal || ((Number(item.price) || 0) * (Number(item.quantity) || 0)))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedOrder.reviewStatus === 'under_review' && selectedOrder.latestIssueReport && (
                <div className="grid gap-[0.85rem] rounded-[1.15rem] border border-[#fdba74] bg-[linear-gradient(180deg,_#fff7ed_0%,_#ffffff_100%)] p-4">
                  <div className={DETAIL_BLOCK_HEADER_CLASS}>
                    <h3 className="m-0 text-[1rem] text-[#0f172a]">Issue report</h3>
                    <Link to="/admin/reports" className="font-extrabold text-[#ea580c] no-underline hover:underline">Open reports</Link>
                  </div>
                  <p className="mt-[0.2rem] mb-0 rounded-[1rem] border border-[#e2e8f0] bg-white px-4 py-[0.9rem] leading-[1.5] text-[#64748b]">
                    {selectedOrder.latestIssueReport.description}
                  </p>
                  <div>
                    <div className={TILE_CLASS}>
                      <span className={TILE_LABEL_CLASS}>Customer</span>
                      <strong className={TILE_VALUE_CLASS}>{selectedOrder.latestIssueReport.customerName || 'Customer'}</strong>
                    </div>
                    <div className={cx(TILE_CLASS, 'mt-3')}>
                      <span className={TILE_LABEL_CLASS}>Submitted</span>
                      <strong className={TILE_VALUE_CLASS}>{formatDateTime(selectedOrder.latestIssueReport.detectionDate || selectedOrder.latestIssueReport.createdAt)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {selectedOrderNotifications.length > 0 && (
                <div className={DETAIL_BLOCK_CLASS}>
                  <div className={DETAIL_BLOCK_HEADER_CLASS}>
                    <h3 className="m-0 text-[1rem] text-[#0f172a]">Notifications</h3>
                  </div>
                  <div className="grid gap-3">
                    {selectedOrderNotifications.map((notification, index) => (
                      <div
                        key={`${selectedOrder.id}-notification-${index}`}
                        className="flex items-start justify-between gap-4 rounded-[1rem] border border-[#e2e8f0] bg-white px-4 py-[0.9rem]"
                      >
                        <BellRing size={16} className="mt-[0.1rem] shrink-0 text-[#ea580c]" />
                        <div className="flex-1">
                          <strong className="text-[#0f172a]">{notification.message}</strong>
                          <p className="mt-[0.2rem] mb-0 leading-[1.5] text-[#64748b]">{formatDateTime(notification.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedOrderReports.length > 0 && normalizeReviewStatus(selectedOrder.reviewStatus) !== 'under_review' && (
                <div className={DETAIL_BLOCK_CLASS}>
                  <div className={DETAIL_BLOCK_HEADER_CLASS}>
                    <h3 className="m-0 text-[1rem] text-[#0f172a]">Recent reports</h3>
                  </div>
                  <div className="grid gap-3">
                    {selectedOrderReports.map((report) => (
                      <div key={report.id} className="rounded-[1rem] border border-[#e2e8f0] bg-white px-4 py-[0.9rem]">
                        <strong className="text-[#0f172a]">{formatIssueType(report.issueType)}</strong>
                        <p className="mb-[0.4rem] mt-[0.35rem] leading-[1.5] text-[#64748b]">{report.description}</p>
                        <span className="text-[0.82rem] font-extrabold text-[#c2410c]">{getReviewStatusLabel(report.reviewStatus)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className={ACTIONS_CLASS}>
                {nextAction && (
                  <button
                    type="button"
                    className={getActionButtonClass('primary')}
                    onClick={() => void updateStatus(selectedOrder, nextAction.nextStatus)}
                    disabled={loadingStatus || loadingCancel || loadingEdit}
                  >
                    {loadingStatus ? <Loader2 size={16} className="animate-spin" /> : <nextAction.icon size={16} />}
                    {loadingStatus ? 'Updating...' : nextAction.label}
                  </button>
                )}

                {canEditSelectedOrder && !isEditOpen && (
                  <button
                    type="button"
                    className={getActionButtonClass('secondary')}
                    onClick={() => startEditOrder(selectedOrder)}
                    disabled={loadingStatus || loadingCancel || loadingEdit}
                  >
                    <PencilLine size={16} />
                    Edit Order
                  </button>
                )}

                {canStaffCancelOrder(selectedOrder) && (
                  <button
                    type="button"
                    className={getActionButtonClass('danger', { active: isCancelOpen })}
                    onClick={() => setOpenCancelOrderId((current) => (current === selectedOrder.id ? '' : selectedOrder.id))}
                    disabled={loadingStatus || loadingCancel || loadingEdit}
                  >
                    {loadingCancel ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
                    {isCancelOpen ? 'Hide Cancel Form' : 'Cancel Order'}
                  </button>
                )}
              </div>

              {!canEditSelectedOrder && selectedOrderIsWalkIn && (
                <p className="-mt-1 mb-0 text-[0.9rem] leading-[1.55] text-[#64748b]">
                  Editing is only available while a walk-in order is still pending or confirmed.
                </p>
              )}

              {!selectedOrderIsWalkIn && canStaffCancelOrder(selectedOrder) && (
                <p className="-mt-1 mb-0 text-[0.9rem] leading-[1.55] text-[#64748b]">
                  This is an online order. Staff can cancel it, but it cannot be edited.
                </p>
              )}

              {renderCancelPanel(selectedOrder, isCancelOpen)}
            </>
          )}
        </aside>
      </section>
    </div>
  );
};

export default AdminOrders;
