import React from 'react';
import './About.css';

const About = () => {
  return (
    <div>
      <div className="info-section" style={{ background: '#fef08a', textAlign: 'center', padding: '4rem 2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem', color: '#0f172a' }}>About V & G Leche Flan</h1>
        <p className="page-subtitle">Pambansang Dessert.</p>
      </div>

      <div className="info-section">
        <h2 style={{ color: '#e11d48' }}>Our Story</h2>
        <p>
          V & G LecheFlan started as a humble kitchen dream in Las Pinas, where two passionate bakers, Vergie and Greg, combined their love for Filipino desserts with family recipes passed down through generations.
        </p>
        <p>
          What began as preparing desserts for family gatherings quickly grew into a beloved local business. Our signature leche flan, made with the finest ingredients and traditional methods, became the talk of the neighborhood.
        </p>
        <p>
          Today, V & G LecheFlan continues to honor those same traditions while innovating with new flavors and creations. Every dessert we make carries the same love and attention to detail that started it all.
        </p>
      </div>

      <div className="info-section mission-box" style={{ background: 'linear-gradient(90deg, #ff3d00, #ffb300)', borderRadius: '1rem' }}>
        <h2 style={{ color: 'white' }}>Our Mission</h2>
        <p style={{ color: 'white', fontWeight: 500 }}>
          To bring joy and sweetness to every celebration by crafting authentic Filipino desserts that honor tradition while delighting modern palates. We believe every special moment deserves the perfect dessert.
        </p>
      </div>
    </div>
  );
};

export default About;
