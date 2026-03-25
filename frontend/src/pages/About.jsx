import React, { useState } from 'react';
import { resolveAssetUrl } from '../lib/publicUrl';
import './About.css';

const flipCards = [
  {
    id: 'story',
    title: 'Our Story',
    frontClassName: 'story-card',
    backClassName: 'story-card-back',
    frontText:
      'V & G Leche Flan started as a humble kitchen dream in Las Pinas, where two passionate bakers built a beloved local dessert brand.',
    backText:
      'V & G LecheFlan started from a simple love for homemade desserts and a passion for sharing sweetness with others. What began as a small kitchen experiment quickly grew into something more, as friends and family kept coming back for the rich, creamy taste of our leche flan. Founded by Vergie and Greg, our shop has become a staple in the Las Pinas community, known for our dedication to quality and tradition. We take pride in crafting each batch of leche flan with care, using time-honored recipes and the finest ingredients to create a dessert that brings joy to every occasion.',
  },
  {
    id: 'mission',
    title: 'Our Mission',
    frontClassName: 'mission-card',
    backClassName: 'mission-card-back',
    frontText:
      'To bring joy and sweetness to every celebration by crafting authentic Filipino desserts that honor tradition.',
    backText:
      "We believe every special moment deserves the perfect dessert. Our mission is to deliver not just desserts, but memories filled with the warmth of Filipino hospitality and the richness of our culinary heritage. We're committed to using only the finest ingredients and time-honored techniques to create desserts that bring families together.",
  },
];

const FlipCard = ({ card, isFlipped, onToggle }) => (
  <div className={`about-flip-card${isFlipped ? ' is-flipped' : ''}`}>
    <div className="about-flip-card-inner">
      <button
        type="button"
        className={`about-flip-face about-flip-face-front ${card.frontClassName}`}
        onClick={onToggle}
      >
        <h2>{card.title}</h2>
        <p>{card.frontText}</p>
        <span className="click-to-flip">Tap to learn more</span>
      </button>

      <button
        type="button"
        className={`about-flip-face about-flip-face-back ${card.backClassName}`}
        onClick={onToggle}
      >
        <h2>{card.title}</h2>
        <p>{card.backText}</p>
        <span className="click-to-flip">Tap to flip back</span>
      </button>
    </div>
  </div>
);

const About = () => {
  const [flippedCards, setFlippedCards] = useState({
    story: false,
    mission: false,
  });
  const [showStoreImage, setShowStoreImage] = useState(true);

  const toggleCard = (cardId) => {
    setFlippedCards((current) => ({
      ...current,
      [cardId]: !current[cardId],
    }));
  };

  return (
    <div className="about-page">
      <div className="info-section about-hero">
        <h1>About V & G Leche Flan</h1>
        <p className="page-subtitle">Pambansang Dessert.</p>
      </div>

      <div className="info-section about-storefront">
        <div className="about-store-copy">
          <span className="about-section-label">Our Store</span>
          <h2>Fresh desserts, warm vibes, and a spot people keep coming back to</h2>
          <p>
            At V &amp; G Lecheflan, we make Filipino desserts fresh every day - no shortcuts, just
            real, homemade goodness. Our shop is always buzzing with families, suki, and anyone
            craving something sweet.
          </p>
          <p>
            From our signature leche flan to other crowd favorites, everything we serve is made
            with care and meant to be shared. Perfect for celebrations... or just because you
            deserve a treat.
          </p>
          <p>Come by, grab your favorites, and taste what everyone&apos;s lining up for!</p>
        </div>

        {showStoreImage && (
          <div className="about-image-panel">
            <img
              src={resolveAssetUrl('store-image.jpg')}
              alt="V & G Leche Flan Store"
              className="store-image"
              onError={() => {
                setShowStoreImage(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="flip-cards-container">
        {flipCards.map((card) => (
          <FlipCard
            key={card.id}
            card={card}
            isFlipped={flippedCards[card.id]}
            onToggle={() => toggleCard(card.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default About;
