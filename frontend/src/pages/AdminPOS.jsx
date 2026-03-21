import React, { useState } from 'react';
import { Search, Plus, Minus, Trash2 } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import './AdminPOS.css';

const AdminPOS = () => {
  const { products } = useProducts();
  const { completeOrder } = useCart();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customerName, setCustomerName] = useState('');
  const [submittedName, setSubmittedName] = useState('Customer');
  const [posCart, setPosCart] = useState([]);
  const [paymentMode, setPaymentMode] = useState(null); // null, 'cash', 'gcash'
  const [cashAmount, setCashAmount] = useState('');

  const categories = ['All', 'Leche Flan', 'Cakes', 'Special Desserts', 'Pastries', 'Cringkles'];

  const total = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handleKeypadPress = (val) => {
    if (val === 'C') {
      setCashAmount('');
    } else if (val === '.') {
      if (!cashAmount.includes('.')) setCashAmount(prev => prev + val);
    } else {
      setCashAmount(prev => prev + val);
    }
  };

  const handleCompleteSale = () => {
    completeOrder({
      customer: submittedName,
      items: posCart,
      total: total,
      paymentMethod: paymentMode
    });
    alert(`Sale completed for ${submittedName}! Total: ₱${total}.00`);
    setPosCart([]);
    setPaymentMode(null);
    setCashAmount('');
    setCustomerName('');
    setSubmittedName('Customer');
  };

  const filteredProducts = products.filter(p => {
    const isProduct = p.type === 'product' || !p.type; // Default to product if type is missing
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
    setPosCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromPOSCart = (id) => {
    setPosCart(prev => prev.filter(item => item.id !== id));
  };

  const updateQuantity = (id, delta) => {
    setPosCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  return (
    <div className="pos-container">
      {/* Left Panel - Inventory Selection */}
      <div className="pos-left">
        <div className="pos-header-pill">POS System</div>
        
        <h2>Select Desserts</h2>
        <div className="admin-filters" style={{ margin: '1rem 0' }}>
          {categories.map(cat => (
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
          {filteredProducts.map(product => (
            <div key={product.id} className="pos-item-card" onClick={() => addToPOSCart(product)}>
              <img src={product.image} alt={product.name} className="pos-item-img" />
              <div className="pos-item-info">
                <div className="pos-item-name">{product.name}</div>
                <div className="pos-item-price">₱{product.price}.00</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel - Shopping Cart */}
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
                if(customerName.trim()) {
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

        <div className="pos-cart-list">
          {posCart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem 0', color: '#94a3b8', background: 'white', borderRadius: '1rem', border: '1px solid #f1f5f9' }}>
               Cart is empty
            </div>
          ) : (
            posCart.map(item => (
              <div key={item.id} className="pos-cart-item">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{item.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>₱{item.price}.00 × {item.quantity}</div>
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
          <span className="pos-total-price-large">₱{total}.00</span>
        </div>

        {!paymentMode ? (
          <>
            <div className="pos-payment-grid" style={{ marginBottom: '1.5rem' }}>
              <button className="btn-payment-pill btn-payment-cash" onClick={() => setPaymentMode('cash')}>Cash</button>
              <button className="btn-payment-pill btn-payment-gcash-inactive" onClick={() => setPaymentMode('gcash')}>GCash</button>
            </div>
            <button className="btn-pos-clear" onClick={() => setPosCart([])}>Clear Cart</button>
          </>
        ) : (
          <div className="pos-payment-logic">
             {/* Payment views below */}
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
                    <span style={{ fontWeight: 700 }}>₱{total}.00</span>
                  </div>
                  <div className="bill-row">
                    <span>Paid</span>
                    <span style={{ fontWeight: 700 }}>₱{cashAmount || '0'}</span>
                  </div>
                </div>

                <div className="keypad-grid">
                  {[7, 8, 9, 4, 5, 6, 1, 2, 3, 0, '.', 'C'].map(btn => (
                    <button key={btn} className="btn-keypad" onClick={() => handleKeypadPress(btn.toString())}>{btn}</button>
                  ))}
                </div>

                <button className="btn-complete-cash" onClick={handleCompleteSale}>Complete Cash Sale</button>
                <button className="btn-pos-cancel" onClick={() => setPaymentMode(null)}>Cancel</button>
              </div>
            ) : (
              <div className="pos-gcash-view">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>GCash QR</h3>
                  <span style={{ fontWeight: 800, color: '#2563eb' }}>₱{total}.00</span>
                </div>
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Scan to pay.</p>

                <div className="qr-mock-container">
                  <div className="qr-image-mock">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ExamplePayment" alt="GCash QR" style={{ width: '100%' }} />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>If you changed the cart/total, re-open GCash to refresh the QR.</p>
                </div>

                <button className="btn-complete-gcash" onClick={handleCompleteSale}>Complete GCash Sale</button>
                <button className="btn-pos-cancel" onClick={() => setPaymentMode(null)}>Cancel</button>
              </div>
            )}
            <button className="btn-pos-clear" style={{ marginTop: '2rem' }} onClick={() => { setPosCart([]); setPaymentMode(null); }}>Clear Cart</button>
          </div>
        )}
      </div>

    </div>
  );
};

export default AdminPOS;
