import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Search, Plus, Sparkles, X, Send } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useAI } from '../context/AIContext';
import './Products.css';

const Products = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const { products, isProductsLoading } = useProducts();
  const { addToCart } = useCart();
  const { queryProductAI } = useAI();

  // AI Chat State
  const [chatProduct, setChatProduct] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (chatProduct) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [messages, chatProduct]);

  const storeProducts = products.filter(p => !p.type || p.type === 'product');
  const categories = ['All Categories', ...new Set(storeProducts.map(p => p.category))];

  const filteredProducts = storeProducts.filter(product => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All Categories' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  function openChat(product) {
    setChatProduct(product);
    setMessages([
      {
        role: 'ai',
        text: `Hi! I'm your Llama AI assistant for V&G. Ask me anything about **${product.name}** or our shop — location, hours, delivery, ingredients, and more!`
      }
    ]);
    setInputValue('');
  }

  function closeChat() {
    setChatProduct(null);
    setMessages([]);
    setInputValue('');
  }

  async function sendMessage(e) {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text || isSending) return;

    setInputValue('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setIsSending(true);

    try {
      const reply = await queryProductAI(chatProduct, text);
      setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Our Products</h1>
        <p className="page-subtitle">Browse our delicious selection of Filipino desserts.</p>
      </div>

      <div className="controls-bar">
        <div className="control-group">
          <label>Search Products</label>
          <div className="input-with-icon">
            <Search className="input-icon" size={20} />
            <input
              type="text"
              className="text-input"
              style={{ paddingLeft: '3rem' }}
              placeholder="Search by name or description..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="control-group">
          <label>Filter by Category</label>
          <select
            className="select-input"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="product-grid">
        {isProductsLoading ? (
          [1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="skeleton-card" style={{ height: '380px', padding: '0', overflow: 'hidden' }}>
              <div className="skeleton skeleton-image" style={{ height: '220px', borderRadius: '0', margin: '0' }}></div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div className="skeleton skeleton-title" style={{ width: '70%', height: '24px', marginBottom: 'auto' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '1rem' }}>
                  <div>
                    <div className="skeleton" style={{ width: '60px', height: '22px', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ width: '80px', height: '16px' }}></div>
                  </div>
                  <div className="skeleton" style={{ width: '100px', height: '40px', borderRadius: '8px' }}></div>
                </div>
              </div>
            </div>
          ))
        ) : (
          filteredProducts.map(product => (
            <div key={product.id} className="product-card">
              <div className="product-image-container" style={{ position: 'relative' }}>
                <span className="category-badge">{product.category}</span>
                <img src={product.image} alt={product.name} className="product-image" />
                {/* Ask AI button — inline style for guaranteed visibility */}
                <button
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    zIndex: 20,
                    background: 'rgba(99, 102, 241, 0.95)',
                    color: 'white',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
                    pointerEvents: 'auto',
                  }}
                  onClick={() => openChat(product)}
                >
                  <Sparkles size={13} /> Ask AI
                </button>
              </div>

              <div className="product-info">
                <h3 className="product-title">{product.name}</h3>
                <div className="product-meta">
                  <div>
                    <div className="product-price">₱{product.price}</div>
                    <div className="product-stock">Stock: {product.stock}</div>
                  </div>
                  <div className="product-actions">
                    <button
                      className="btn-primary btn-icon"
                      style={{ padding: '0.5rem 1rem', width: '100%' }}
                      onClick={() => addToCart(product)}
                    >
                      <Plus size={16} /> Add to Cart
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* AI Chat Modal */}
      {chatProduct && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeChat(); }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1.5rem',
              width: '100%',
              maxWidth: '540px',
              height: '75vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
              animation: 'modalSlide 0.3s ease',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  width: 40, height: 40,
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '0.75rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white'
                }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>Llama AI Assistant</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem' }}>{chatProduct.name}</div>
                </div>
              </div>
              <button
                onClick={closeChat}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none', color: 'white',
                  width: 36, height: 36,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              background: '#f8fafc',
            }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '0.875rem 1.125rem',
                  borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                  background: msg.role === 'user' ? '#6366f1' : 'white',
                  color: msg.role === 'user' ? 'white' : '#334155',
                  fontSize: '0.9rem',
                  lineHeight: 1.5,
                  boxShadow: msg.role === 'user' ? '0 4px 12px rgba(99,102,241,0.25)' : '0 2px 8px rgba(0,0,0,0.06)',
                  border: msg.role === 'ai' ? '1px solid #e2e8f0' : 'none',
                }}>
                  {msg.text}
                </div>
              ))}

              {isSending && (
                <div style={{
                  alignSelf: 'flex-start',
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '1rem 1rem 1rem 0.25rem',
                  padding: '0.875rem 1.25rem',
                  display: 'flex', gap: '4px',
                }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6,
                      background: '#94a3b8',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: `typingDot 1.4s ${i * 0.2}s infinite`,
                    }} />
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={sendMessage}
              style={{
                padding: '1rem 1.5rem',
                background: 'white',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                gap: '0.75rem',
              }}
            >
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="Ask anything — location, price, ingredients..."
                disabled={isSending}
                style={{
                  flex: 1,
                  padding: '0.7rem 1rem',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  outline: 'none',
                  fontSize: '0.9rem',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="submit"
                disabled={isSending || !inputValue.trim()}
                style={{
                  width: 42, height: 42,
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.75rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isSending || !inputValue.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSending || !inputValue.trim() ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                <Send size={18} />
              </button>
            </form>

            {/* Add to Cart footer */}
            <div style={{ padding: '0 1.5rem 1.25rem' }}>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem' }}
                onClick={() => { addToCart(chatProduct); closeChat(); }}
              >
                Add to Cart • ₱{chatProduct.price}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Products;
