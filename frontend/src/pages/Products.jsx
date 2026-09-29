import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Search, Plus, Minus, Sparkles, X, Send, ShoppingBag } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useAI } from '../context/AIContext';
import { useAuth } from '../context/AuthContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import { formatCurrency } from '../utils/orderAnalytics';
import { formatCurrencyText } from '../utils/currency';
import { getPreOrderUnavailableReason as getProductPreOrderUnavailableReason } from '../utils/preOrders';
import useDialogFocus from '../hooks/useDialogFocus';
import PreOrderModal from '../components/PreOrderModal';
import ShopProductCard from '../components/ShopProductCard';
import './Products.css';

const Products = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const { products, isProductsLoading } = useProducts();
  const { addToCart, cartItems } = useCart();
  const { queryProductAI } = useAI();
  const { loggedInCustomer } = useAuth();
  const { isShopOpen, isShopSettingsLoading, shopSettingsError, operatingHoursLabel, closingTimeLabel } = useShopSettings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [chatProduct, setChatProduct] = useState(null);
  const [preOrderProduct, setPreOrderProduct] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [detailQuantity, setDetailQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [purchaseMessage, setPurchaseMessage] = useState('');
  const [purchaseError, setPurchaseError] = useState(false);
  const messagesEndRef = useRef(null);
  const chatRequestRef = useRef(0);

  const storeProducts = products.filter((product) => !product.type || product.type === 'product');
  const categories = ['All Categories', ...new Set(storeProducts.map((product) => product.category).filter(Boolean))];
  const detailProduct = storeProducts.find((product) => String(product.id) === searchParams.get('product')) || null;
  const filteredProducts = storeProducts.filter((product) => {
    const query = searchTerm.trim().toLowerCase();
    const matchesSearch = product.name.toLowerCase().includes(query)
      || (product.description || '').toLowerCase().includes(query);
    return matchesSearch && (selectedCategory === 'All Categories' || product.category === selectedCategory);
  });

  const remainingStock = (product) => Math.max(0,
    (Number(product?.stock) || 0)
    - (cartItems.find((item) => String(item.id) === String(product?.id))?.quantity || 0),
  );
  const areShopHoursKnown = !isShopSettingsLoading && !shopSettingsError;
  const getPreOrderUnavailableReason = (product) => getProductPreOrderUnavailableReason(product, {
    isShopOpen, isShopSettingsLoading, shopSettingsError,
  });
  const canAddProductToCart = (product) => remainingStock(product) > 0
    && product?.availability !== 'expired'
    && product?.availability !== 'hidden'
    && !product?.isExpired
    && areShopHoursKnown && isShopOpen;
  const getAvailability = (product) => product.availability === 'expired' || product.availability === 'hidden'
    ? 'Unavailable' : Number(product.stock) > 0 ? `${product.stock} available` : 'Out of stock';
  const purchaseLabel = (product) => isShopSettingsLoading ? 'Checking hours'
    : shopSettingsError ? 'Hours unavailable' : !isShopOpen ? 'Shop closed'
    : getAvailability(product) === 'Unavailable' ? 'Unavailable'
      : Number(product.stock) <= 0 ? 'Out of stock'
        : remainingStock(product) <= 0 ? 'Cart limit reached' : 'Add to Cart';

  function closeDetails() {
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.delete('product');
      return next;
    }, { replace: true });
  }

  function openDetails(product) {
    setDetailQuantity(1);
    setPurchaseMessage('');
    setSearchParams((params) => {
      const next = new URLSearchParams(params);
      next.set('product', product.id);
      return next;
    });
  }

  function closeChat() {
    chatRequestRef.current += 1;
    setChatProduct(null);
    setMessages([]);
    setInputValue('');
    setIsSending(false);
  }

  const detailDialogRef = useDialogFocus({ isOpen: Boolean(detailProduct), onClose: closeDetails });
  const chatDialogRef = useDialogFocus({ isOpen: Boolean(chatProduct), onClose: closeChat });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, isSending]);

  function openChat(product) {
    closeDetails();
    chatRequestRef.current += 1;
    setChatProduct(product);
    setMessages([{ role: 'ai', text: `Hi! Ask me about ${product.name}, ingredients, delivery, or our shop.` }]);
    setInputValue('');
    setPurchaseMessage('');
  }

  function openPreOrder(product) {
    if (getPreOrderUnavailableReason(product)) return;
    closeDetails();
    if (!loggedInCustomer) {
      navigate('/login');
      return;
    }
    setPreOrderProduct(product);
  }

  async function purchaseProduct(product, quantity = 1) {
    if (!canAddProductToCart(product) || isAdding) return;
    setIsAdding(true);
    setPurchaseMessage('');
    setPurchaseError(false);
    try {
      await addToCart(product, quantity);
      setPurchaseMessage(`${quantity === 1 ? 'Item' : `${quantity} items`} added to your cart.`);
    } catch (error) {
      setPurchaseError(true);
      setPurchaseMessage(error.message || 'Could not add this item. Please try again.');
    } finally {
      setIsAdding(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = inputValue.trim();
    if (!text || isSending) return;
    const requestId = chatRequestRef.current;
    setInputValue('');
    setMessages((previous) => [...previous, { role: 'user', text }]);
    setIsSending(true);
    try {
      const reply = await queryProductAI(chatProduct, text);
      if (requestId === chatRequestRef.current) setMessages((previous) => [...previous, { role: 'ai', text: reply }]);
    } catch {
      if (requestId === chatRequestRef.current) setMessages((previous) => [...previous, { role: 'ai', text: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      if (requestId === chatRequestRef.current) setIsSending(false);
    }
  }

  const selectedQuantity = Math.max(1, Math.min(detailQuantity, remainingStock(detailProduct)));

  return (
    <div className="products-page">
      <header className="products-heading">
        <div>
          <span className="products-eyebrow">Sweet moments start here</span>
          <h1>Our desserts</h1>
          <p>Ordering hours: {operatingHoursLabel}.</p>
          {shopSettingsError && <p role="status">We cannot confirm shop hours right now. Please try again shortly.</p>}
        </div>
        <span className={`shop-hours-tag${isShopOpen ? '' : ' is-closed'}`} role="status">
          <span aria-hidden="true" />{isShopSettingsLoading ? 'Checking shop hours' : shopSettingsError ? 'Hours unavailable' : isShopOpen ? `Open until ${closingTimeLabel}` : 'Currently closed'}
        </span>
      </header>

      <div className="catalog-controls" role="search" aria-label="Find desserts">
        <div className="catalog-search-group">
          <label htmlFor="dessert-search">Search desserts</label>
          <div className="catalog-search-field">
            <Search size={20} aria-hidden="true" />
            <input
              id="dessert-search"
              type="search"
              placeholder="Search your favorites"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>
        <div className="catalog-category-group">
          <label htmlFor="dessert-category">Category</label>
          <select id="dessert-category" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </div>
      </div>

      <p className="catalog-result-count" role="status" aria-live="polite">
        {isProductsLoading ? 'Finding your treats…' : `${filteredProducts.length} ${filteredProducts.length === 1 ? 'dessert' : 'desserts'} to explore`}
      </p>
      <div className="shop-product-grid">
        {isProductsLoading ? [1, 2, 3, 4, 5, 6].map((item) => (
          <div className="catalog-skeleton" key={item} aria-hidden="true">
            <div className="skeleton catalog-skeleton-image" />
            <div className="skeleton skeleton-title" />
            <div className="skeleton skeleton-text" />
          </div>
        )) : filteredProducts.map((product) => (
          <ShopProductCard
            key={product.id}
            product={product}
            onDetails={openDetails}
            onPreOrder={openPreOrder}
            preOrderUnavailableReason={getPreOrderUnavailableReason(product)}
          />
        ))}
      </div>
      {!isProductsLoading && filteredProducts.length === 0 && (
        <div className="catalog-empty">
          <ShoppingBag size={32} aria-hidden="true" />
          <h2>{storeProducts.length ? 'No desserts found' : 'Our menu is on its way'}</h2>
          <p>{storeProducts.length ? 'Try another search or browse all categories.' : 'Please check back shortly for available desserts.'}</p>
          {(searchTerm || selectedCategory !== 'All Categories') && <button type="button" onClick={() => { setSearchTerm(''); setSelectedCategory('All Categories'); }}>Clear filters</button>}
        </div>
      )}

      {detailProduct && createPortal(
        <div className="dessert-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeDetails(); }}>
          <section className="dessert-detail-dialog" ref={detailDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dessert-detail-title">
            <header className="dessert-dialog-header">
              <span>Made for sweet moments</span>
              <button type="button" className="dessert-icon-button" onClick={closeDetails} aria-label="Close product details"><X size={22} /></button>
            </header>
            <div className="dessert-detail-scroll">
              <img className="dessert-detail-image" src={detailProduct.image} alt={detailProduct.name} />
              <div className="dessert-detail-info">
                <span className="products-eyebrow">{detailProduct.category}</span>
                <h2 id="dessert-detail-title">{detailProduct.name}</h2>
                <div className="dessert-detail-price">{formatCurrency(detailProduct.price)}</div>
                <p className="dessert-detail-stock">{getAvailability(detailProduct)}</p>
                <p className="dessert-detail-description">{detailProduct.description || 'A sweet treat from V & G Leche Flan.'}</p>
                <p className="dessert-hours-note">Ordering hours: {operatingHoursLabel}.</p>
                <div className="dessert-detail-extras">
                  <button type="button" onClick={() => openChat(detailProduct)}><Sparkles size={17} aria-hidden="true" /> Ask about this dessert</button>
                  <button
                    type="button"
                    disabled={Boolean(getPreOrderUnavailableReason(detailProduct))}
                    aria-describedby={getPreOrderUnavailableReason(detailProduct) ? 'dessert-preorder-reason' : undefined}
                    onClick={() => openPreOrder(detailProduct)}
                  ><CalendarDays size={17} aria-hidden="true" /> Pre-order for later</button>
                </div>
                {getPreOrderUnavailableReason(detailProduct) && (
                  <p className="shop-preorder-reason" id="dessert-preorder-reason">{getPreOrderUnavailableReason(detailProduct)}</p>
                )}
              </div>
            </div>
            <footer className="dessert-detail-footer">
              <div className="dessert-purchase-row">
                <div className="dessert-quantity" role="group" aria-label="Quantity">
                  <button type="button" aria-label="Decrease quantity" disabled={selectedQuantity <= 1 || isAdding} onClick={() => setDetailQuantity(selectedQuantity - 1)}><Minus size={18} /></button>
                  <output aria-live="polite">{selectedQuantity}</output>
                  <button type="button" aria-label="Increase quantity" disabled={selectedQuantity >= remainingStock(detailProduct) || isAdding || !canAddProductToCart(detailProduct)} onClick={() => setDetailQuantity(selectedQuantity + 1)}><Plus size={18} /></button>
                </div>
                <button className="shop-add-button" type="button" disabled={!canAddProductToCart(detailProduct) || isAdding} onClick={() => void purchaseProduct(detailProduct, selectedQuantity)}>
                  {isAdding ? 'Adding…' : purchaseLabel(detailProduct)}{canAddProductToCart(detailProduct) && <span>{formatCurrency(detailProduct.price * selectedQuantity)}</span>}
                </button>
              </div>
              <p className={`dessert-purchase-message${purchaseError ? ' has-error' : ''}`} role="status">{purchaseMessage}</p>
            </footer>
          </section>
        </div>, document.body,
      )}

      {chatProduct && createPortal(
        <div className="dessert-dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) closeChat(); }}>
          <section className="dessert-chat-dialog" ref={chatDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dessert-chat-title">
            <header className="dessert-chat-header">
              <div><h2 id="dessert-chat-title"><Sparkles size={20} aria-hidden="true" /> Dessert assistant</h2><p>{chatProduct.name}</p></div>
              <button type="button" className="dessert-icon-button" onClick={closeChat} aria-label="Close dessert assistant"><X size={22} /></button>
            </header>
            <div className="dessert-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
              {messages.map((message, index) => <div key={index} className={`dessert-chat-message ${message.role === 'user' ? 'from-user' : 'from-assistant'}`}>{message.role === 'user' ? message.text : formatCurrencyText(message.text)}</div>)}
              {isSending && <p className="dessert-chat-thinking">Finding an answer…</p>}
              <div ref={messagesEndRef} />
            </div>
            <form className="dessert-chat-form" onSubmit={sendMessage}>
              <input type="text" aria-label="Ask about this dessert" value={inputValue} onChange={(event) => setInputValue(event.target.value)} placeholder="Ask about this dessert…" disabled={isSending} />
              <button type="submit" className="dessert-icon-button" aria-label="Send message" disabled={isSending || !inputValue.trim()}><Send size={20} /></button>
            </form>
            <footer className="dessert-chat-footer">
              <button className="shop-add-button" type="button" disabled={!canAddProductToCart(chatProduct) || isAdding} onClick={() => void purchaseProduct(chatProduct)}>{isAdding ? 'Adding…' : purchaseLabel(chatProduct)} · {formatCurrency(chatProduct.price)}</button>
              <p className={`dessert-purchase-message${purchaseError ? ' has-error' : ''}`} role="status">{purchaseMessage}</p>
            </footer>
          </section>
        </div>, document.body,
      )}

      <PreOrderModal product={preOrderProduct} isOpen={Boolean(preOrderProduct)} onClose={() => setPreOrderProduct(null)} />
    </div>
  );
};

export default Products;
