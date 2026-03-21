import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useOrders } from '../context/OrderContext';
import { useAI } from '../context/AIContext';
import { useContent } from '../context/ContentContext';
import { MapPin, Sparkles, ShoppingCart, Plus } from 'lucide-react';
import adverVideo from '../assets/adver.mp4';
import promoVideo from '../assets/promo.mp4';
import ReactPlayer from 'react-player';
import './Home.css';

const VideoEmbed = ({ url }) => {
  if (!url) return null;
  
  // Custom intercept for Facebook links to bypass react-player's strict regex
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
        allowFullScreen={true} 
        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" 
      />
    );
  }

  // Fallback to ReactPlayer for YouTube, Vimeo, and raw MP4s
  return <ReactPlayer url={url} controls width="100%" height="100%" />;
};

const Home = () => {
  const location = useLocation();
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const { products, isProductsLoading } = useProducts();
  const { orders } = useOrders();
  const { getSmartRecommendations } = useAI();
  const { siteVideos } = useContent();

  useEffect(() => {
    if (location.state?.welcomeMessage) {
      setWelcomeMessage(location.state.welcomeMessage);
      setShowWelcome(true);

      const timer = setTimeout(() => setShowWelcome(false), 5000);

      // Clear state so it doesn't show again on refresh
      window.history.replaceState({}, document.title);

      return () => clearTimeout(timer);
    }
  }, [location]);

  // Dynamically calculate best sellers from Order History
  const salesCount = {};
  if (orders) {
    orders.forEach(order => {
      if (order.items && order.status !== 'cancelled') {
        const itemsList = order.items.split(', ');
        itemsList.forEach(itemStr => {
          const match = itemStr.match(/^(\d+)×\s+(.+)$/);
          if (match) {
            const qty = parseInt(match[1]);
            const name = match[2];
            salesCount[name] = (salesCount[name] || 0) + qty;
          }
        });
      }
    });
  }

  const finishedProducts = products ? products.filter(p => !p.type || p.type === 'product') : [];
  const bestSellers = [...finishedProducts]
    .map(p => ({
      ...p,
      soldCount: salesCount[p.name] || 0
    }))
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, 3);

  // Fallback in case there are no products
  const featuredProduct = bestSellers.length > 0 ? bestSellers[0] : null;

  return (
    <div className="home-container" style={{ padding: '2rem 0', position: 'relative' }}>

      {showWelcome && (
        <div style={{
          position: 'fixed',
          top: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#10b981',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '9999px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontWeight: 600,
          fontSize: '1.1rem',
        }}>
          🎉 {welcomeMessage}
          <button
            onClick={() => setShowWelcome(false)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              color: 'white',
              fontSize: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              padding: 0
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Hero Section */}
      <section className="hero-section" style={{ marginBottom: '6rem' }}>
        <div className="hero-content">
          <div className="hero-subtitle">
            <span className="dot"></span>
            Fresh desserts, delivered daily
          </div>

          <h1 style={{ fontSize: '4rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '2rem' }}>
            Welcome to <span className="highlight" style={{ color: '#ff0000' }}>V & G</span>
          </h1>

          <p className="hero-description" style={{ fontSize: '1.2rem', maxWidth: '500px' }}>
            Leche Flan - Pambansang Dessert. Experience the authentic taste of premium leche flan, crafted with love and tradition. Our secret family recipe delivers a creamy, rich dessert that melts in your mouth.
          </p>

          <div className="hero-actions" style={{ marginTop: '3rem' }}>
            <Link to="/products" className="btn-primary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem' }}>Order Now</Link>
            <Link to="/about" className="btn-secondary" style={{ padding: '1rem 2.5rem', fontSize: '1.1rem', background: 'white', borderRadius: '1rem' }}>Learn More About Us</Link>
          </div>
        </div>

        <div className="hero-image-container" style={{ borderRadius: '3rem', background: '#fff' }}>
          {isProductsLoading ? (
            <div className="skeleton" style={{ width: '100%', height: '450px', borderRadius: '3rem' }}></div>
          ) : (
            <>
              <img
                src={featuredProduct?.image}
                alt={featuredProduct?.name}
                style={{ width: '100%', height: '450px', objectFit: 'cover', borderRadius: '3rem' }}
              />
              <div className="hero-image-overlay" style={{ padding: '2rem' }}>
                <h3 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{featuredProduct?.name || 'Delicious Leche Flan'}</h3>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>{featuredProduct?.description || 'Sweet, creamy, and caramelized to perfection—made fresh daily.'}</p>
                <div className="tags" style={{ display: 'flex', gap: '0.75rem' }}>
                  <span className="tag" style={{ background: '#fef08a', color: '#854d0e', padding: '0.5rem 1rem', borderRadius: '0.75rem' }}>Best Seller</span>
                  <span className="tag" style={{ background: 'white', border: '1px solid #e2e8f0', padding: '0.5rem 1rem', borderRadius: '0.75rem' }}>Fresh Daily</span>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Best Sellers Section */}
      <section className="best-sellers-section">
        <div className="section-header">
          <h2>Best Sellers</h2>
          <p>Our most popular items, loved by customers</p>
        </div>

        <div className="best-sellers-grid">
          {isProductsLoading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="skeleton-card">
                <div className="skeleton" style={{ width: '120px', height: '24px', borderRadius: '12px', marginBottom: '16px' }}></div>
                <div className="skeleton skeleton-image" style={{ height: '200px' }}></div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  <div className="skeleton" style={{ width: '30%', height: '60px', borderRadius: '8px' }}></div>
                  <div className="skeleton" style={{ width: '30%', height: '60px', borderRadius: '8px' }}></div>
                  <div className="skeleton" style={{ width: '30%', height: '60px', borderRadius: '8px' }}></div>
                </div>
                <div className="skeleton skeleton-title" style={{ width: '80%' }}></div>
                <div className="skeleton skeleton-text"></div>
                <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px', marginBottom: '16px' }}>
                  <div className="skeleton" style={{ width: '80px', height: '28px' }}></div>
                  <div className="skeleton" style={{ width: '100px', height: '24px', borderRadius: '12px' }}></div>
                </div>
                <div className="skeleton" style={{ width: '100%', height: '48px', borderRadius: '12px' }}></div>
              </div>
            ))
          ) : (
            bestSellers.map((product, index) => (
              <div key={product.id} className="product-card-premium">
                <div className="rank-badge">#{index + 1} Best Seller</div>

                <div className="main-img-container">
                  <img src={product.image} alt={product.name} />
                </div>

                <div className="thumb-grid">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="thumb-img">
                      <img src={product.image} alt="thumbnail" />
                    </div>
                  ))}
                </div>

                <div className="premium-card-content">
                  <h3>{product.name}</h3>
                  <p>{product.description}</p>

                  <div className="price-sold-row">
                    <span className="premium-price">₱{product.price.toFixed(2)}</span>
                    <span className="sold-badge">
                      {product.soldCount > 0 ? `${product.soldCount} sold recently` : 'Hot item'}
                    </span>
                  </div>

                  <Link to="/products" className="btn-primary" style={{ width: '100%', textAlign: 'center', borderRadius: '0.75rem', background: '#ff9800' }}>
                    View in Shop
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Llama AI Recommendations */}
      {(!isProductsLoading && products.length > 0) && (
        <section className="ai-home-recommendations" style={{ padding: '6rem 0', background: '#f8fafc' }}>
          <div className="section-header">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <Sparkles size={18} style={{ color: '#6366f1' }} />
              <span style={{ color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.8rem' }}>AI Powered</span>
            </div>
            <h2>Personalized Picks for You</h2>
            <p>Our Llama AI analyzed our treats to find what you'll love most</p>
          </div>

          <div className="best-sellers-grid">
            {getSmartRecommendations(bestSellers[0]?.id).map((p) => (
              <div key={p.id} className="product-card-premium ai-card">
                <div className="main-img-container" style={{ height: '200px' }}>
                  <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div className="ai-tag-overlay" style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    background: 'rgba(99, 102, 241, 0.9)',
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: 700
                  }}>Smart Pick</div>
                </div>

                <div className="premium-card-content" style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{p.name}</h3>
                    <span className="premium-price" style={{ color: '#6366f1' }}>₱{p.price}</span>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '0.75rem 0 1.5rem', flex: 1 }}>{p.description}</p>

                  <Link to="/products" className="btn-primary" style={{
                    width: '100%',
                    textAlign: 'center',
                    borderRadius: '0.75rem',
                    background: '#6366f1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    color: 'white',
                    textDecoration: 'none',
                    fontWeight: 600
                  }}>
                    <ShoppingCart size={18} /> Shop Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visit Our Shop Section */}
      <section className="visit-shop-section">
        <div className="section-header">
          <h2>Visit Our Shop</h2>
          <p>Find us on the map and get directions to our storefront.</p>
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

      {/* Experience V & G Section */}
      <section className="experience-section">
        <div className="section-header">
          <h2>Experience V & G Leche Flan</h2>
          <p>Watch our story and see why our desserts are loved by families across the Philippines</p>
        </div>

        <div className="video-grid">
          {siteVideos.map(video => {
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
          )})}
        </div>
      </section>
    </div>
  );
};

export default Home;
