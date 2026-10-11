import { customerErrorMessage } from '../lib/publicErrors';
import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Check, Heart, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { formatCurrency } from '../utils/orderAnalytics';
import { getPreOrderUnavailableReason } from '../utils/preOrders';
import { getProductPricing } from '../../../dessert-ai-system/shared/productPricing.js';
import useProductFavorite from '../hooks/useProductFavorite';
import LazyProductImage from './LazyProductImage';
import PreOrderModal from './PreOrderModal';
import './ShopProductCard.css';

const ShopProductCard = ({ product, badge, onDetails, onPreOrder, preOrderUnavailableReason }) => {
  const { addToCart, cartItems } = useCart();
  const { loggedInCustomer, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { isShopOpen, isShopSettingsLoading, shopSettingsError } = useShopSettings();
  const [feedback, setFeedback] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isPreOrderOpen, setIsPreOrderOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const { isFavorite, toggleFavorite } = useProductFavorite(product.id);
  const preOrderReasonId = useId();
  const preOrderReason = preOrderUnavailableReason ?? getPreOrderUnavailableReason(product, {
    isShopOpen, isShopSettingsLoading, shopSettingsError,
  });
  const stock = Math.max(0, Number(product.stock) || 0);
  const cartQuantity = cartItems.find((item) => String(item.id) === String(product.id))?.quantity || 0;
  const isExpired = product.availability === 'expired' || product.isExpired;
  const unavailable = isExpired || product.availability === 'hidden';
  const canOrder = isShopOpen && !isShopSettingsLoading && !shopSettingsError;
  const remainingStock = Math.max(0, stock - cartQuantity);
  const quantityLimit = remainingStock > 0 ? remainingStock : 999;
  const selectedQuantity = Math.max(1, Math.min(quantity, quantityLimit));
  const pricing = getProductPricing(product, selectedQuantity);
  const canAdd = !isAdmin && canOrder && !unavailable && remainingStock >= selectedQuantity;
  const imageSrc = resolveAssetUrl(product.image || product.imageUrl, '');
  const availability = unavailable ? 'Unavailable' : stock > 0 ? `${stock} available` : 'Out of stock';
  const shopStatusLabel = isShopSettingsLoading ? 'Checking shop hours' : shopSettingsError ? 'Shop hours unavailable' : 'Shop closed';
  const buttonLabel = isAdmin ? 'Customer cart only' : isExpired ? 'Expired' : unavailable ? 'Unavailable' : !canOrder ? shopStatusLabel : stock <= 0 ? 'Out of stock'
    : cartQuantity >= stock ? 'Cart limit reached' : 'Add to Cart';
  const detailsProps = onDetails
    ? { as: 'button', type: 'button', onClick: () => onDetails(product) }
    : { as: Link, to: `/products?product=${encodeURIComponent(product.id)}` };
  const { as: DetailsControl, ...controlProps } = detailsProps;

  const handlePreOrder = () => {
    if (preOrderReason) return;
    if (onPreOrder) { onPreOrder(product, selectedQuantity); return; }
    if (!loggedInCustomer) { navigate('/login'); return; }
    setIsPreOrderOpen(true);
  };

  const handleAdd = () => {
    if (!canAdd) return;
    setFeedback('');
    setHasError(false);
    addToCart(product, selectedQuantity)
      .then(() => setFeedback('Added to your cart'))
      .catch((error) => {
        setHasError(true);
        setFeedback(customerErrorMessage(error, 'Could not add this item. Please try again.'));
      });
  };

  return (
    <article className="shop-product-card">
      <div className="shop-product-media">
        <DetailsControl {...controlProps} className="shop-product-image-link" aria-label={`View ${product.name}`}>
          <LazyProductImage key={imageSrc} src={imageSrc} alt={product.name} />
          {pricing.bulkPrice !== null && (
            <span className="shop-product-discount-badge">
              <strong>{formatCurrency(pricing.bulkPrice)} each</strong><span>{pricing.bulkQuantityLabel}</span>
            </span>
          )}
          {badge && <span className="shop-product-badge">{badge}</span>}
        </DetailsControl>
        <button type="button" className="shop-product-favorite" onClick={toggleFavorite}
          aria-pressed={isFavorite} aria-label={`${isFavorite ? 'Remove' : 'Save'} ${product.name} ${isFavorite ? 'from' : 'to'} favorites`}>
          <Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      </div>
      <div className="shop-product-body">
        <span className="shop-product-category">{product.category || 'Dessert'}</span>
        <h3 className="shop-product-name">
          <DetailsControl {...controlProps} title={product.name}>{product.name}</DetailsControl>
        </h3>
        <div className="shop-product-pricing">
          <div className="shop-product-price">
            <span>{formatCurrency(pricing.unitPrice)}</span>
            <span className="shop-product-price-unit">each{pricing.bulkPrice !== null
              ? ` · ${pricing.isBulkPrice ? pricing.bulkQuantityLabel : pricing.bulkMinQuantity === 2 ? '1 pack' : `1–${pricing.bulkMinQuantity - 1} packs`}`
              : ''}</span>
          </div>
        </div>
        <p className={`shop-product-availability${unavailable || stock === 0 ? ' is-unavailable' : ''}`}>
          <span aria-hidden="true" />{availability}
        </p>
        <div className="shop-product-quantity" role="group" aria-label={`Quantity in packs for ${product.name}`}>
          <button type="button" aria-label={`Decrease quantity of ${product.name}`} disabled={selectedQuantity <= 1}
            onClick={() => setQuantity(selectedQuantity - 1)}><Minus size={15} aria-hidden="true" /></button>
          <input type="number" inputMode="numeric" min="1" max={quantityLimit} step="1"
            aria-label={`Quantity of ${product.name} in packs`} value={quantity === '' ? '' : selectedQuantity}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') { setQuantity(''); return; }
              if (/^\d+$/.test(value)) setQuantity(Math.max(1, Math.min(Number(value), quantityLimit)));
            }} onBlur={() => setQuantity(selectedQuantity)} onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (!event.ctrlKey && !event.metaKey && !event.altKey
                && event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault();
            }} onPaste={(event) => {
              if (!/^\d+$/.test(event.clipboardData.getData('text'))) event.preventDefault();
            }} />
          <button type="button" aria-label={`Increase quantity of ${product.name}`} disabled={selectedQuantity >= quantityLimit}
            onClick={() => setQuantity(selectedQuantity + 1)}><Plus size={15} aria-hidden="true" /></button>
        </div>
        <div className="shop-product-actions">
          <button
            className="shop-add-button"
            type="button"
            disabled={!canAdd}
            onClick={handleAdd}
            aria-label={`${buttonLabel}: ${product.name}`}
          >
            {feedback && !hasError ? <Check size={16} aria-hidden="true" /> : <ShoppingCart size={16} aria-hidden="true" />}
            <span className="shop-action-label">{buttonLabel}</span>
          </button>
          <button
            className="shop-add-button shop-preorder-button"
            type="button"
            disabled={Boolean(preOrderReason)}
            onClick={handlePreOrder}
            aria-label={`Pre-order: ${product.name}`}
            aria-describedby={preOrderReason ? preOrderReasonId : undefined}
          >
            <CalendarDays size={17} aria-hidden="true" />
            <span className="shop-action-label">Pre-order</span>
          </button>
        </div>
        {preOrderReason && (
          <p className="shop-preorder-reason" id={preOrderReasonId}>{preOrderReason}</p>
        )}
        <p className={`shop-product-feedback${hasError ? ' has-error' : ''}`} role="status" aria-live="polite">
          {feedback}
        </p>
      </div>
      {isPreOrderOpen && <PreOrderModal product={product} initialQuantity={selectedQuantity} isOpen onClose={() => setIsPreOrderOpen(false)} />}
    </article>
  );
};

export default ShopProductCard;
