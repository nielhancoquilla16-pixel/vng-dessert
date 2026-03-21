import React from 'react';
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react';
import './Contact.css';

const Contact = () => {
  return (
    <div className="main-content">
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Get in Touch</h1>
        <p style={{ color: '#64748b', fontSize: '1.1rem' }}>We'd love to hear from you</p>
      </div>

      <div className="contact-grid-redesign">
        {/* Left Column: Contact info cards */}
        <div className="contact-info-cards">
          <div className="contact-card-simple">
            <div className="contact-icon-wrapper">
              <MapPin size={24} />
            </div>
            <div className="contact-card-text">
              <h3>Location</h3>
              <p>Monark Subdivision, Las Piñas, Philippines, 1740</p>
            </div>
          </div>

          <div className="contact-card-simple">
            <div className="contact-icon-wrapper">
              <Phone size={24} />
            </div>
            <div className="contact-card-text">
              <h3>Phone</h3>
              <p>0977 385 4909</p>
            </div>
          </div>

          <div className="contact-card-simple">
            <div className="contact-icon-wrapper">
              <Mail size={24} />
            </div>
            <div className="contact-card-text">
              <h3>Email</h3>
              <p>vnglecheflan0824@gmail.com</p>
            </div>
          </div>

          <div className="contact-card-simple">
            <div className="contact-icon-wrapper">
              <Clock size={24} />
            </div>
            <div className="contact-card-text">
              <h3>Hours</h3>
              <p>Mon–Sat 8AM–8PM · Sun 9AM–6PM</p>
            </div>
          </div>
        </div>

        {/* Right Column: Contact form */}
        <div className="contact-form-card">
          <h2>Send a Message</h2>
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="form-group-redesign">
              <label>Name</label>
              <input type="text" placeholder="Your name" />
            </div>

            <div className="form-group-redesign">
              <label>Email</label>
              <input type="email" placeholder="your@email.com" />
            </div>

            <div className="form-group-redesign">
              <label>Message</label>
              <textarea placeholder="How can we help?"></textarea>
            </div>

            <button type="submit" className="btn-send-message">
              Send Message <Send size={18} style={{ marginLeft: '5px' }} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Contact;
