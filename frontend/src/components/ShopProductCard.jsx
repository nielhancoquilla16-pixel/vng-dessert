import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Check, Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import { resolveAssetUrl } from '../lib/publicUrl';
import { formatCurrency } from '../utils/orderAnalytics';
import { getPreOrderUnavailableReason } from '../utils/preOrders';
import LazyProductImage from './LazyProductImage';
import PreOrderModal from './PreOrderModal';
import './ShopProductCard.css';

const ShopProductCard = ({ product, badge, onDetails, onPreOrder, preOrderUnavailableReason }) => {
  const { addToCart, cartItems } = useCart();
  const { loggedInCustomer } = useAuth();
  const navigate = useNavigate();
  const { isShopOpen, isShopSettingsLoading, shopSettingsError } = useShopSettings();
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [hasError, setHasError] = useState(false);
  const [isPreOrderOpen, setIsPreOrderOpen] = useState(false);
  const preOrderReasonId = useId();
  const preOrderReason = preOrderUnavailableReason ?? getPreOrderUnavailableReason(product, {
    isShopOpen, isShopSettingsLoading, shopSettingsError,
  });
  const stock = Math.max(0, Number(product.stock) || 0);
  const cartQuantity = cartItems.find((item) => String(item.id) === String(product.id))?.quantity || 0;
  const isExpired = product.availability === 'expired' || product.isExpired;
  const unavailable = isExpired || product.availability === 'hidden';
  const areShopHoursKnown = !isShopSettingsLoading && !shopSettingsError;
  const canAdd = !unavailable && stock > cartQuantity && areShopHoursKnown && isShopOpen;
  const imageSrc = resolveAssetUrl(product.image || product.imageUrl, '');
  const availability = unavailable ? 'Unavailable' : stock > 0 ? `${stock} available` : 'Out of stock';
  const buttonLabel = isExpired ? 'Expired' : unavailable ? 'Unavailable' : stock <= 0 ? 'Out of stock'
    : isShopSettingsLoading ? 'Checking hours' : shopSettingsError ? 'Hours unavailable'
      : !isShopOpen ? 'Shop closed' : cartQuantity >= stock ? 'Cart limit reached' : 'Add to Cart';
  const detailsProps = onDetails
    ? { as: 'button', type: 'button', onClick: () => onDetails(product) }
    : { as: Link, to: `/products?product=${encodeURIComponent(product.id)}` };
  const { as: DetailsControl, ...controlProps } = detailsProps;

  const handlePreOrder = () => {
    if (preOrderReason) return;
    if (onPreOrder) { onPreOrder(product); return; }
    if (!loggedInCustomer) { navigate('/login'); return; }
    setIsPreOrderOpen(true);
  };

  const handleAdd = async () => {
    if (!canAdd || isAdding) return;
    setIsAdding(true);
    setFeedback('');
    setHasError(false);
    try {
      await addToCart(product);
      setFeedback('Added to your cart');
    } catch (error) {
      setHasError(true);
      setFeedback(error.message || 'Could not add this item. Please try again.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article className="shop-product-card">
      <DetailsControl {...controlProps} className="shop-product-image-link" aria-label={`View ${product.name}`}>
        <LazyProductImage
          key={imageSrc}
          src={imageSrc}
          alt={product.name}
        />
        {badge && <span className="shop-product-badge">{badge}</span>}
      </DetailsControl>
      <div className="shop-product-body">
        <span className="shop-product-category">{product.category || 'Dessert'}</span>
        <h3 className="shop-product-name">
          <DetailsControl {...controlProps} title={product.name}>{product.name}</DetailsControl>
        </h3>
        <div className="shop-product-price">{formatCurrency(product.price)}</div>
        <p className={`shop-product-availability${unavailable || stock === 0 ? ' is-unavailable' : ''}`}>
          <span aria-hidden="true" />{availability}
        </p>
        <div className="shop-product-actions">
          <button
            className="shop-add-button"
            type="button"
            disabled={!canAdd || isAdding}
            onClick={handleAdd}
            aria-label={`${buttonLabel}: ${product.name}`}
          >
            {feedback && !hasError ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
            <span className="shop-action-label">{isAdding ? 'Adding…' : buttonLabel}</span>
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
      {isPreOrderOpen && <PreOrderModal product={product} isOpen onClose={() => setIsPreOrderOpen(false)} />}
    </article>
  );
};

export default ShopProductCard;
