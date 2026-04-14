import React from 'react';
import { Link } from 'react-router-dom';
import { Facebook, Instagram } from 'lucide-react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-container">
        {/* Brand Column */}
        <div className="footer-column">
          <div className="footer-brand-title">
            <span role="img" aria-label="dessert"></span>
          V&G LECHEFLAN
          </div>
          <p className="footer-description">
            Authentic Filipino desserts made with love, tradition, and the freshest local ingredients.
          </p>
        </div>

        {/* Quick Links Column */}
        <div className="footer-column">
          <h3>Quick Links</h3>
          <ul className="footer-links">
            <li><Link to="/" className="footer-link">Home</Link></li>
            <li><Link to="/products" className="footer-link">Products</Link></li>
            <li><Link to="/orders" className="footer-link">Orders</Link></li>
            <li><Link to="/contact" className="footer-link">Contact</Link></li>
            <li><Link to="/about" className="footer-link">About</Link></li>
          </ul>
        </div>

        {/* Follow Us Column */}
        <div className="footer-column">
          <h3>Follow Us</h3>
          <ul className="footer-links">
            <li>
              <a href="https://www.facebook.com/VnG.LecheFlan" className="footer-social-link">
                <Facebook size={20} color="#1877f2" /> Facebook
              </a>
            </li>
            <li>
              <a href="https://www.instagram.com/vng.lecheflan/" className="footer-social-link">
                <Instagram size={20} color="#e4405f" /> Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        &copy; {new Date().getFullYear()} V&G LECHEFLAN
      </div>
    </footer>
  );
};

export default Footer;
