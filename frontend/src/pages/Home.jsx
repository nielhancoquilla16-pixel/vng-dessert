import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MapPin, Sparkles, ShoppingCart } from 'lucide-react';
import ReactPlayer from 'react-player';
import { useProducts } from '../context/ProductContext';
import { useAI } from '../context/AIContext';
import { useContent } from '../context/ContentContext';
import { apiRequest } from '../lib/api';
import { resolveAssetUrl } from '../lib/publicUrl';
import { formatCurrency } from '../utils/orderAnalytics';
import './Home.css';

const BEST_SELLER_LIMIT = 3;

const VideoEmbed = ({ url }) => {
  if (!url) return null;

  if (url.includes('facebook.com') || url.includes('fb.watch')) {
    const fbIframeSrc = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0`;
    return (
      <iframe
        src={fbIframeSrc}
        width="100%"
        height="100%"
        style={{ border: 'none', overflow: 'hidden' }}
        scrolling="no"
        frameBorder="0"
        allowFullScreen
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
      />
    );
  }

  return <ReactPlayer url={url} controls width="100%" height="100%" />;
};

const normalizeBestSeller = (product = {}, fallbackRank = 1) => ({
  id: product.id,
  name: product.name || product.productName || product.product_name || 'Dessert Item',
  productName: product.productName || product.product_name || product.name || 'Dessert Item',
  description: product.description || 'Freshly prepared dessert made with care.',
  price: Number(product.price) || 0,
  category: product.category || 'Dessert',
  imageUrl: resolveAssetUrl(product.imageUrl || product.image_url || product.image, 'logo.png'),
  image: resolveAssetUrl(product.imageUrl || product.image_url || product.image, 'logo.png'),
  soldCount: Number(product.soldCount) || 0,
  orderCount: Number(product.orderCount) || 0,
  averageUnitsPerOrder: Number(product.averageUnitsPerOrder) || 0,
  rank: Number(product.rank) || fallbackRank,
});

const buildFallbackBestSellers = (products = []) => (
  products
    .filter((product) => !product.type || product.type === 'product')
    .slice(0, BEST_SELLER_LIMIT)
    .map((product, index) => normalizeBestSeller({
      ...product,
      soldCount: 0,
      orderCount: 0,
      averageUnitsPerOrder: 0,
      rank: index + 1,
    }, index + 1))
);

const getAverageUnitsLabel = (product) => {
  const explicitAverage = Number(product.averageUnitsPerOrder);
  if (explicitAverage > 0) {
    return `${explicitAverage} pcs/order`;
  }

  if (product.orderCount > 0 && product.soldCount > 0) {
    return `${(product.soldCount / product.orderCount).toFixed(1)} pcs/order`;
  }

  return 'Fresh Daily';
};

const ProductPreviewCollage = ({ product, variant = 'card' }) => (
  <div className={`preview-collage preview-collage-${variant}`}>
    <div className="preview-collage-main">
      <img src={product.image} alt={product.name} />
    </div>
  </div>
);

const Home = () => {
  const location = useLocation();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [bestSellers, setBestSellers] = useState([]);
  const [isBestSellersLoading, setIsBestSellersLoading] = useState(true);
  const { products, isProductsLoading } = useProducts();
  const { getSmartRecommendations } = useAI();
  const { siteVideos } = useContent();

  useEffect(() => {
    if (location.state?.welcomeMessage) {
      setWelcomeMessage(location.state.welcomeMessage);
      setShowWelcome(true);

      const timer = setTimeout(() => setShowWelcome(false), 5000);
      window.history.replaceState({}, document.title);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [location]);

  useEffect(() => {
    let isActive = true;

    const loadBestSellers = async () => {
      try {
        setIsBestSellersLoading(true);
        const response = await apiRequest('/api/orders/best-sellers');
        const nextBestSellers = (response?.items || []).map((product, index) => (
          normalizeBestSeller(product, index + 1)
        ));

        if (!isActive) {
          return;
        }

        setBestSellers(nextBestSellers);
      } catch (error) {
        console.warn('Failed to load bestseller rankings:', error);
        if (isActive) {
          setBestSellers([]);
        }
      } finally {
        if (isActive) {
          setIsBestSellersLoading(false);
        }
      }
    };

    loadBestSellers();

    return () => {
      isActive = false;
    };
  }, []);

  const storeProducts = products.filter((product) => !product.type || product.type === 'product');
  const fallbackBestSellers = buildFallbackBestSellers(storeProducts);
  const hasLiveBestSellers = bestSellers.length > 0;
  const displayedBestSellers = hasLiveBestSellers ? bestSellers : fallbackBestSellers;
  const featuredProduct = displayedBestSellers[0] || null;
  const recommendationSeedId = featuredProduct?.id || storeProducts[0]?.id;
  const aiRecommendations = getSmartRecommendations(recommendationSeedId).slice(0, 3);

  const isHeroLoading = isProductsLoading || (isBestSellersLoading && !hasLiveBestSellers);

  return (
    <div className="home-container">
      {showWelcome && (
        <div className="welcome-banner">
          {welcomeMessage}
          <button
            onClick={() => setShowWelcome(false)}
            className="welcome-banner-close"
          >
            &times;
          </button>
        </div>
      )}

      <section className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            Welcome to <span className="highlight">V &amp; G</span> Leche Flan
          </h1>

          <p className="hero-description">
            Leche Flan is our pambansang dessert, and this homepage now puts your real best sellers first.
            The featured product and the top ranked cards below stay synced to actual customer orders, so the desserts
            people keep buying are always the ones we highlight.
          </p>

          <div className="hero-proof-strip">
            <span className="hero-proof-pill">Fresh Daily Batches</span>
          </div>

          <div className="hero-actions">
            <Link to="/products" className="btn-primary hero-cta">Order Now</Link>
            <Link to="/about" className="btn-secondary hero-cta">Learn More About Us</Link>
          </div>
        </div>

        <div className="hero-spotlight-card">
          {isHeroLoading ? (
            <div className="skeleton-card hero-skeleton-card">
              <div className="skeleton skeleton-image" style={{ height: '360px', marginBottom: '1rem' }}></div>
              <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div className="skeleton" style={{ width: '126px', height: '34px', borderRadius: '999px' }}></div>
                <div className="skeleton" style={{ width: '110px', height: '34px', borderRadius: '999px' }}></div>
              </div>
              <div className="skeleton skeleton-title" style={{ width: '70%' }}></div>
              <div className="skeleton skeleton-text"></div>
              <div className="skeleton skeleton-text" style={{ width: '50%' }}></div>
            </div>
          ) : featuredProduct ? (
            <>
              <ProductPreviewCollage
                product={featuredProduct}
                variant="featured"
              />

              <div className="spotlight-body">
                <div className="product-card-heading">
                  <h3 className="hero-image-title">{featuredProduct.name}</h3>
                  <span className="premium-price">{formatCurrency(featuredProduct.price)}</span>
                </div>

                <p className="hero-image-copy">{featuredProduct.description}</p>

                <div className="spotlight-metrics">
                  <span className="metric-pill metric-pill-highlight">
                    {hasLiveBestSellers ? '#1 Best Seller' : 'Fresh Pick'}
                  </span>
                  <span className="metric-pill">Fresh Daily</span>
                  <span className="metric-pill metric-pill-soft">{featuredProduct.category}</span>
                </div>

                {hasLiveBestSellers ? (
                  <>
                    <p className="spotlight-note">
                      Synced to total customer orders
                    </p>

                    <p className="spotlight-summary">
                      {`${featuredProduct.soldCount} total units sold across ${featuredProduct.orderCount} customer orders.`}
                    </p>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </section>

      <section className="best-sellers-section">
        <div className="section-header">
          <span className="section-eyebrow">Best Sellers</span>
          <h2>Customer favorites</h2>
        
          </div>

        <div className="best-sellers-grid">
          {(isProductsLoading || (isBestSellersLoading && !displayedBestSellers.length)) ? (
            [1, 2, 3].map((item) => (
              <div key={item} className="skeleton-card">
                <div className="skeleton" style={{ width: '120px', height: '24px', borderRadius: '999px', marginBottom: '1rem' }}></div>
                <div className="skeleton skeleton-image" style={{ height: '260px', marginBottom: '1rem' }}></div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div className="skeleton" style={{ width: '116px', height: '34px', borderRadius: '999px' }}></div>
                  <div className="skeleton" style={{ width: '102px', height: '34px', borderRadius: '999px' }}></div>
                </div>
                <div className="skeleton skeleton-title" style={{ width: '75%' }}></div>
                <div className="skeleton skeleton-text"></div>
                <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                  <div className="skeleton" style={{ width: '110px', height: '34px', borderRadius: '999px' }}></div>
                  <div className="skeleton" style={{ width: '110px', height: '34px', borderRadius: '999px' }}></div>
                  <div className="skeleton" style={{ width: '140px', height: '34px', borderRadius: '999px' }}></div>
                </div>
              </div>
            ))
          ) : (
            displayedBestSellers.map((product, index) => (
              <div key={product.id || `${product.name}-${index}`} className="best-seller-card">
                <div className="rank-badge">#{index + 1} Best Seller</div>

                <ProductPreviewCollage product={product} />

                <div className="premium-card-content">
                  <div className="product-card-heading">
                    <h3>{product.name}</h3>
                    <span className="premium-price">{formatCurrency(product.price)}</span>
                  </div>

                  <p>{product.description}</p>

                  <div className="metric-pill-row">
                    <span className="metric-pill metric-pill-highlight">
                      {hasLiveBestSellers ? `${product.soldCount} units sold` : 'Fresh Daily'}
                    </span>
                    <span className="metric-pill">
                      {hasLiveBestSellers ? `${product.orderCount} orders` : 'Made fresh'}
                    </span>
                    <span className="metric-pill metric-pill-soft">
                      {hasLiveBestSellers ? `Avg ${getAverageUnitsLabel(product)}` : 'Ready to order'}
                    </span>
                  </div>

                  <Link to="/products" className="btn-primary best-seller-cta">
                    View in Shop
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {(!isProductsLoading && products.length > 0) && (
        <section className="ai-home-recommendations">
          <div className="section-header">
            <div className="ai-section-label">
              <Sparkles size={18} style={{ color: '#b45309' }} />
              <span>AI Powered</span>
            </div>
            <h2>Personalized Picks for You</h2>
            <p>Our AI looked at your dessert catalog and paired treats that fit the current bestseller spotlight.</p>
          </div>

          <div className="best-sellers-grid">
            {aiRecommendations.map((product) => (
              <div key={product.id} className="best-seller-card ai-card">
                <ProductPreviewCollage product={normalizeBestSeller(product)} />

                <div className="premium-card-content">
                  <div className="product-card-heading">
                    <h3>{product.name}</h3>
                    <span className="premium-price ai-price">{formatCurrency(product.price)}</span>
                  </div>

                  <p>{product.description}</p>

                  <div className="metric-pill-row">
                    <span className="metric-pill metric-pill-soft">Pairs well with best sellers</span>
                    <span className="metric-pill">Fresh Daily</span>
                  </div>

                  <Link to="/products" className="btn-primary ai-card-cta">
                    <ShoppingCart size={18} /> Shop Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="visit-shop-section">
        <div className="section-header">
          <span className="section-eyebrow">Visit Our Shop</span>
          <h2>Find V &amp; G easily</h2>
          <p>Stop by the shop, pick up your desserts, or use the map below to plan your visit.</p>
        </div>

        <div className="visit-shop-layout">
          <div className="location-card">
            <div className="map-pin-icon">
              <MapPin size={32} />
            </div>
            <div>
              <h3 style={{ marginBottom: '0.5rem' }}>Map Location</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem' }}>OpenStreetMap</p>
            </div>
            <a
              href="https://www.openstreetmap.org/#map=15/14.455378/120.974665"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-rose"
            >
              Open in OpenStreetMap
            </a>
          </div>

          <div className="map-container">
            <iframe
              title="Shop Location"
              src="https://www.openstreetmap.org/export/embed.html?bbox=120.974665,14.455378,120.974665,14.455378&layer=mapnik&marker=14.455378,120.974665"
            ></iframe>
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', color: '#64748b' }}>
              View on <a href="https://www.openstreetmap.org/" style={{ color: '#0ea5e9' }}>OpenStreetMap</a>
            </div>
          </div>
        </div>
      </section>

      <section className="experience-section">
        <div className="section-header">
          <span className="section-eyebrow">Experience V &amp; G</span>
          <h2>Watch the desserts people love</h2>
          <p>See the story behind the brand and the moments that make your desserts worth coming back for.</p>
        </div>

        <div className="video-grid">
          {(siteVideos || []).map((video) => {
            const isReel = video.src && (video.src.includes('/share/r/') || video.src.includes('/reel/'));
            return (
              <div key={video.id} className="video-card">
                <div
                  className="video-player-container"
                  style={isReel ? { aspectRatio: '9/16', maxHeight: '550px', maxWidth: '310px', margin: '0 auto' } : {}}
                >
                  <VideoEmbed url={video.src} />
                </div>
                <div className="video-info">
                  <h3>{video.title}</h3>
                  <p>{video.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Home;
