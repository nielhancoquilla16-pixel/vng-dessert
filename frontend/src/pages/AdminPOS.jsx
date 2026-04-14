import React, { useEffect, useRef, useState } from 'react';
import { Search, Plus, Minus, Trash2, Printer } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useOrders } from '../context/OrderContext';
import ReceiptSlip from '../components/ReceiptSlip';
import './AdminPOS.css';

const POS_AUTO_PRINT_STORAGE_KEY = 'vng-pos-auto-print';

const getInitialAutoPrintPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(POS_AUTO_PRINT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const AdminPOS = () => {
  const { products, validateStockAvailability, refreshProducts } = useProducts();
  const { addOrder, updateOrderItems } = useOrders();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customerName, setCustomerName] = useState('');
  const [submittedName, setSubmittedName] = useState('Customer');
  const [posCart, setPosCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState(null);
  const [cashAmount, setCashAmount] = useState('');
  const [saleError, setSaleError] = useState('');
  const [saleReceipt, setSaleReceipt] = useState(null);
  const [activeSaleOrderId, setActiveSaleOrderId] = useState(null);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(getInitialAutoPrintPreference);
  const autoPrintedReceiptKeyRef = useRef('');

  const categories = ['All', 'Leche Flan', 'Cakes', 'Special Desserts', 'Pastries', 'Cringkles'];

  const total = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  useEffect(() => {
    if (saleReceipt) {
      setSaleReceipt(null);
    }
  }, [posCart]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(POS_AUTO_PRINT_STORAGE_KEY, String(autoPrintEnabled));
    } catch {
      // Ignore localStorage write failures in restricted browser modes.
    }
  }, [autoPrintEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !saleReceipt?.autoPrintRequested) {
      return undefined;
    }

    const receiptPrintKey = `${saleReceipt.orderCode || saleReceipt.orderId || 'walk-in-sale'}:${saleReceipt.completedAt || ''}`;
    if (autoPrintedReceiptKeyRef.current === receiptPrintKey) {
      return undefined;
    }

    autoPrintedReceiptKeyRef.current = receiptPrintKey;
    const timer = window.setTimeout(() => {
      window.print();
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [saleReceipt]);

  const handleKeypadPress = (val) => {
    if (val === 'C') {
      setCashAmount('');
    } else if (val === '.') {
      if (!cashAmount.includes('.')) setCashAmount((prev) => prev + val);
    } else {
      setCashAmount((prev) => prev + val);
    }
  };

  const resetPaymentFlow = () => {
    setPaymentMode(null);
    setCashAmount('');
    setSaleError('');
    setShowNameWarning(false);
  };

  const handleAddMoreOrder = () => {
    setSaleReceipt(null);
    resetPaymentFlow();
  };

  const handleClearCart = () => {
    setPosCart([]);
    setActiveSaleOrderId(null);
    setSaleReceipt(null);
    resetPaymentFlow();
    setCustomerName('');
    setSubmittedName('Customer');
  };

  const handlePrintReceipt = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleCompleteSale = async () => {
    setSaleError('');

    if (posCart.length === 0) {
      setSaleError('Add items to the cart before completing the sale.');
      return;
    }

    const lineItems = posCart.map((item) => ({
      productId: item.id,
      name: item.name,
      category: item.category || 'Uncategorized',
      quantity: item.quantity,
      price: Number(item.price) || 0,
      lineTotal: (Number(item.price) || 0) * item.quantity,
    }));

    const stockCheck = validateStockAvailability(lineItems);
    if (!stockCheck.isAvailable) {
      const shortageSummary = stockCheck.shortages
        .map((item) => `${item.name} (${item.available} left, requested ${item.requested})`)
        .join(', ');

      setSaleError(`Not enough stock for: ${shortageSummary}.`);
      return;
    }

    const isCashSale = paymentMode === 'cash';
    const cashTendered = isCashSale ? Number.parseFloat(cashAmount) : total;

    if (isCashSale && (!Number.isFinite(cashTendered) || cashTendered < total)) {
      setSaleError(`Cash received must be at least PHP ${total.toFixed(2)}.`);
      return;
    }

    try {
      const orderPayload = {
        customer: submittedName,
        lineItems,
        totalAmount: total,
        total: `PHP ${total.toFixed(2)}`,
        paymentMethod: paymentMode,
        deliveryMethod: 'pickup',
        status: 'confirmed',
        subtext: `Walk-in / ${paymentMode === 'gcash' ? 'GCash' : 'Pay at Store'}`,
      };

      const savedOrder = activeSaleOrderId
        ? await updateOrderItems(activeSaleOrderId, orderPayload)
        : await addOrder(orderPayload);

      try {
        await refreshProducts();
      } catch (refreshError) {
        console.warn('Failed to refresh products after POS sale completion:', refreshError);
      }

      const savedOrderStatus = String(savedOrder?.status || savedOrder?.orderStatus || '').toLowerCase();
      const nextOrderId = savedOrder?.id || savedOrder?.orderId || activeSaleOrderId || null;
      setActiveSaleOrderId(nextOrderId);

      if (savedOrderStatus === 'cancelled') {
        setSaleReceipt(null);
        setSaleError(savedOrder?.cancellationReason || 'The order was cancelled by system rules.');
        return;
      }

      const changeDue = isCashSale
        ? Number((cashTendered - total).toFixed(2))
        : 0;
      const completedAt = savedOrder?.updatedAt || new Date().toISOString();
      const receiptOrderCode = savedOrder?.orderCode || savedOrder?.displayId || savedOrder?.orderId || savedOrder?.id || nextOrderId || 'POS order';
      const receiptOrder = {
        ...savedOrder,
        customer: savedOrder?.customer || savedOrder?.customerName || submittedName,
        lineItems: Array.isArray(savedOrder?.lineItems) && savedOrder.lineItems.length > 0 ? savedOrder.lineItems : lineItems,
        totalAmount: Number(savedOrder?.totalAmount ?? total) || total,
        total: savedOrder?.total || `PHP ${total.toFixed(2)}`,
        paymentMethod: savedOrder?.paymentMethod || paymentMode,
        deliveryMethod: savedOrder?.deliveryMethod || 'pickup',
        status: savedOrder?.status || 'confirmed',
        orderCode: receiptOrderCode,
        orderId: savedOrder?.orderId || nextOrderId || receiptOrderCode,
        paymentReceiptNumber: savedOrder?.paymentReceiptNumber || receiptOrderCode,
        createdAt: savedOrder?.createdAt || completedAt,
        updatedAt: completedAt,
      };

      setSaleReceipt({
        order: receiptOrder,
        orderId: receiptOrder.orderId,
        orderCode: receiptOrder.orderCode,
        paymentMode,
        total: receiptOrder.totalAmount,
        cashReceived: cashTendered,
        changeDue,
        completedAt,
        autoPrintRequested: autoPrintEnabled,
      });

      resetPaymentFlow();
      setSaleError('');
    } catch (error) {
      const shortageItems = error?.details?.shortages;
      if (Array.isArray(shortageItems) && shortageItems.length > 0) {
        setSaleError(shortageItems
          .map((item) => `${item.productName} (${item.available} left, requested ${item.requested})`)
          .join(', '));
      } else {
        setSaleError(error.message || 'Unable to complete the sale right now.');
      }
    }
  };

  const filteredProducts = products.filter((p) => {
    const isProduct = p.type === 'product' || !p.type;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return isProduct && matchesSearch && matchesCategory;
  });

  const [showNameWarning, setShowNameWarning] = useState(false);

  const addToPOSCart = (product) => {
    if (submittedName === 'Customer') {
      setShowNameWarning(true);
      return;
    }

    const currentQuantity = posCart.find((item) => item.id === product.id)?.quantity || 0;
    const availableStock = Math.max(0, Number(product.stock) || 0);

    if (availableStock === 0 || currentQuantity >= availableStock) {
      setSaleError(`${product.name} is out of stock or already at the maximum available quantity.`);
      return;
    }

    setSaleError('');
    setPosCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromPOSCart = (id) => {
    setPosCart((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id, delta) => {
    setSaleError('');
    setPosCart((prev) => prev.map((item) => {
      if (item.id === id) {
        const maxStock = Math.max(1, Number(item.stock) || item.quantity);
        const newQty = Math.min(maxStock, Math.max(1, item.quantity + delta));
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  return (
    <div className="pos-container">
      <div className="pos-left">
        <div className="pos-header-pill">POS System</div>

        <h2>Select Desserts</h2>
        <div className="admin-filters" style={{ margin: '1rem 0' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`filter-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search Dessert..."
            className="admin-search-input"
            style={{ width: '100%', maxWidth: 'none' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="pos-card-grid">
          {filteredProducts.map((product) => (
            <div key={product.id} className="pos-item-card" onClick={() => addToPOSCart(product)}>
              <img src={product.image} alt={product.name} className="pos-item-img" />
              <div className="pos-item-info">
                <div className="pos-item-name">{product.name}</div>
                <div className="pos-item-price">PHP {Number(product.price).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pos-right">
        <div className="pos-customer-section" style={{ background: 'white', padding: '1.25rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.75rem' }}>Customer Name</label>
          <div style={{ display: 'flex', gap: '0.75rem', height: '50px' }}>
            <input
              type="text"
              placeholder="Enter customer name"
              className="modal-input pos-input-highlight"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <button
              className="btn-pos-enter"
              onClick={() => {
                if (customerName.trim()) {
                  setSubmittedName(customerName);
                  setShowNameWarning(false);
                }
              }}
            >
              Enter
            </button>
          </div>
        </div>

        <h2 style={{ fontSize: '1.75rem', margin: '1rem 0' }}>
          Shopping Cart for: <span style={{ color: '#ea580c', textDecoration: 'underline' }}>{submittedName}</span>
        </h2>

        {showNameWarning && (
          <div className="pos-warning-alert">
            Enter a customer name before adding items.
          </div>
        )}

        {saleError && (
          <div className="pos-warning-alert" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
            {saleError}
          </div>
        )}

        <div className="pos-cart-list">
          {posCart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#94a3b8', background: 'white', borderRadius: '1rem', border: '1px solid #f1f5f9' }}>
              Cart is empty
            </div>
          ) : (
            posCart.map((item) => (
              <div key={item.id} className="pos-cart-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>PHP {Number(item.price).toFixed(2)} x {item.quantity}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', background: '#f8fafc', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                    <button onClick={() => updateQuantity(item.id, -1)} style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none' }}><Minus size={14} /></button>
                    <span style={{ padding: '0.25rem 0.5rem', fontWeight: 700, fontSize: '0.85rem' }}>{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, 1)} style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none' }}><Plus size={14} /></button>
                  </div>
                  <button onClick={() => removeFromPOSCart(item.id)} style={{ color: '#ef4444' }}><Trash2 size={18} /></button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pos-total-centered">
          <div style={{ color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>Total:</div>
          <span className="pos-total-price-large">PHP {total.toFixed(2)}</span>
        </div>

        <div className="pos-print-settings-card">
          <label className="pos-auto-print-toggle">
            <input
              type="checkbox"
              checked={autoPrintEnabled}
              onChange={(event) => setAutoPrintEnabled(event.target.checked)}
            />
            <span className="pos-auto-print-copy">
              <strong>Auto-print receipt</strong>
              <small>Open the print dialog right after the order is completed.</small>
            </span>
          </label>
        </div>

        {saleReceipt ? (
          <div className="pos-completion-card">
            <div className="pos-completion-badge">Sale completed</div>
            <h3 style={{ margin: '0.75rem 0 0.5rem' }}>Order {saleReceipt.orderCode}</h3>
            <p className="pos-completion-copy">
              Receipt preview is ready below. Print it now, or choose Add More Order if the customer still wants to keep this sale editable before starting a new one.
            </p>

            <div className="pos-completion-grid">
              <div className="pos-completion-metric">
                <span>Total</span>
                <strong>PHP {saleReceipt.total.toFixed(2)}</strong>
              </div>
              <div className="pos-completion-metric">
                <span>Payment received</span>
                <strong>PHP {saleReceipt.cashReceived.toFixed(2)}</strong>
              </div>
              <div className="pos-completion-metric pos-completion-change">
                <span>Change</span>
                <strong>PHP {saleReceipt.changeDue.toFixed(2)}</strong>
              </div>
            </div>

            <div className="pos-completion-actions pos-completion-actions--receipt">
              <button className="btn-pos-primary" onClick={handlePrintReceipt}>
                <Printer size={18} />
                Print Receipt
              </button>
              <button className="btn-pos-secondary" onClick={handleAddMoreOrder}>Add More Order</button>
              <button className="btn-pos-clear" onClick={handleClearCart}>Clear Cart</button>
            </div>

            <div className="pos-completion-preview">
              <div className="pos-completion-preview-header">
                <div>
                  <h4>Receipt Preview</h4>
                  <p>Use Print Receipt to print now or choose Save as PDF from the browser dialog.</p>
                </div>
                {saleReceipt.autoPrintRequested && (
                  <span className="pos-auto-print-badge">Auto print enabled</span>
                )}
              </div>

              <div className="pos-print-area">
                <ReceiptSlip
                  order={saleReceipt.order}
                  receiptNumber={saleReceipt.order.paymentReceiptNumber || saleReceipt.orderCode}
                  paidAt={saleReceipt.completedAt}
                  variant="thermal"
                  documentTitle="Walk-in Receipt"
                  documentSubtitle="POS order receipt"
                  statusLabel="Paid"
                  paymentMethodLabel={saleReceipt.paymentMode === 'gcash' ? 'GCash' : 'Cash'}
                  paymentSummary={{
                    receivedAmount: saleReceipt.cashReceived,
                    changeAmount: saleReceipt.changeDue,
                  }}
                />
              </div>
            </div>
          </div>
        ) : !paymentMode ? (
          <>
            <div className="pos-payment-grid" style={{ marginBottom: '1.5rem' }}>
              <button className="btn-payment-pill btn-payment-cash" onClick={() => setPaymentMode('cash')}>Cash</button>
              <button className="btn-payment-pill btn-payment-gcash-inactive" onClick={() => setPaymentMode('gcash')}>GCash</button>
            </div>
            <button className="btn-pos-clear" onClick={handleClearCart}>Clear Cart</button>
          </>
        ) : (
          <div className="pos-payment-logic">
            <div className="payment-type-tabs">
              <button className={`btn-payment-tab ${paymentMode === 'cash' ? 'active-cash' : ''}`} onClick={() => setPaymentMode('cash')}>Cash</button>
              <button className={`btn-payment-tab ${paymentMode === 'gcash' ? 'active-gcash' : ''}`} onClick={() => setPaymentMode('gcash')}>GCash</button>
            </div>

            {paymentMode === 'cash' ? (
              <div className="pos-cash-view">
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>Enter cash amount:</label>
                <div className="modal-input" style={{ width: '100%', marginTop: '0.5rem', minHeight: '50px', display: 'flex', alignItems: 'center', fontSize: '1.25rem', fontWeight: 700 }}>
                  {cashAmount}
                </div>

                <div className="cash-bill-summary">
                  <div className="bill-row">
                    <span>Customer bill</span>
                    <span style={{ fontWeight: 700 }}>PHP {total.toFixed(2)}</span>
                  </div>
                  <div className="bill-row">
                    <span>Paid</span>
                    <span style={{ fontWeight: 700 }}>PHP {cashAmount || '0'}</span>
                  </div>
                </div>

                <div className="keypad-grid">
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3, 0, '.', 'C'].map((btn) => (
                    <button key={btn} className="btn-keypad" onClick={() => handleKeypadPress(btn.toString())}>{btn}</button>
                  ))}
                </div>

                <button className="btn-complete-cash" onClick={handleCompleteSale}>Complete Order</button>
                <button className="btn-pos-cancel" onClick={resetPaymentFlow}>Cancel</button>
              </div>
            ) : (
              <div className="pos-gcash-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>GCash QR</h3>
                  <span style={{ fontWeight: 800, color: '#2563eb' }}>PHP {total.toFixed(2)}</span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Scan to pay.</p>

                <div className="qr-mock-container">
                  <div className="qr-image-mock">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ExamplePayment" alt="GCash QR" style={{ width: '100%' }} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>If you changed the cart/total, re-open GCash to refresh the QR.</p>
                </div>

                <button className="btn-complete-gcash" onClick={handleCompleteSale}>Complete Order</button>
                <button className="btn-pos-cancel" onClick={resetPaymentFlow}>Cancel</button>
              </div>
            )}
            <button className="btn-pos-clear" style={{ marginTop: '2rem' }} onClick={handleClearCart}>Clear Cart</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPOS;
