import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, MessageSquareText, Star } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { formatCurrency } from '../utils/currency';
import './Feedback.css';

const formatDateTime = (value) => {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime())
    ? 'Not available'
    : parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
};

const ratingLabels = ['', 'Needs attention', 'Could be better', 'Okay', 'Good', 'Excellent'];

const FeedbackRating = ({ label, value, onChange }) => (
  <fieldset className="feedback-rating-block">
    <legend>{label}</legend>
    <div className="feedback-stars" aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          className={star <= value ? 'is-selected' : ''}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          onClick={() => onChange(star)}
        >
          <Star size={30} fill="currentColor" />
        </button>
      ))}
    </div>
    <span className="feedback-rating-label">{ratingLabels[value] || 'Choose a rating'}</span>
  </fieldset>
);

const Feedback = () => {
  const { token } = useParams();
  const [payload, setPayload] = useState(null);
  const [ratings, setRatings] = useState({
    overall: 0,
    product: 0,
    service: 0,
    fulfillment: 0,
  });
  const [comment, setComment] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadFeedbackOrder = async () => {
      try {
        setIsLoading(true);
        setError('');
        const result = await apiRequest(`/api/feedback/${encodeURIComponent(token || '')}`);
        if (isActive) {
          setPayload(result);
          setCustomerName((current) => current || result?.order?.customer || '');
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError.message || 'Unable to open this feedback link.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadFeedbackOrder();
    return () => {
      isActive = false;
    };
  }, [token]);

  const order = payload?.order || null;
  const items = Array.isArray(order?.items) ? order.items : [];
  const hasAllRatings = Object.values(ratings).every((rating) => rating >= 1);
  const canSubmit = payload?.feedbackEnabled && hasAllRatings && !isSubmitting && !success;
  const fulfillmentLabel = String(order?.deliveryMethod || '').toLowerCase() === 'delivery'
    ? 'Delivery experience'
    : 'Pickup experience';

  const setRating = (field, value) => {
    setRatings((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const submitFeedback = async (event) => {
    event.preventDefault();

    if (!hasAllRatings) {
      setError('Please choose a rating for each section.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await apiRequest(`/api/feedback/${encodeURIComponent(token || '')}`, {
        method: 'POST',
        body: JSON.stringify({
          rating: ratings.overall,
          productRating: ratings.product,
          serviceRating: ratings.service,
          fulfillmentRating: ratings.fulfillment,
          comment,
          customerName,
          isAnonymous,
        }),
      });
      setSuccess(true);
      setPayload((current) => ({
        ...current,
        feedbackEnabled: false,
        feedbackSubmitted: true,
        invalidReason: 'Thank you. Feedback has already been submitted for this order.',
      }));
    } catch (submitError) {
      setError(submitError.message || 'Unable to submit feedback right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="feedback-page">
        <section className="feedback-shell feedback-loading">Loading feedback form...</section>
      </main>
    );
  }

  if (error && !payload) {
    return (
      <main className="feedback-page">
        <section className="feedback-shell feedback-state">
          <MessageSquareText size={34} />
          <h1>Feedback Link Unavailable</h1>
          <p>{error}</p>
          <Link to="/" className="feedback-link-button">Back to Store</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="feedback-page">
      <section className="feedback-shell">
        <header className="feedback-header">
          <div>
            <p className="feedback-kicker">Order Feedback</p>
            <h1>{order?.displayId || order?.orderCode || 'Your Order'}</h1>
            <p>{formatDateTime(order?.transactionAt || order?.createdAt)}</p>
          </div>
          <div className={`feedback-status-chip ${payload?.feedbackEnabled ? '' : 'is-disabled'}`}>
            {payload?.feedbackSubmitted ? 'Submitted' : (payload?.feedbackEnabled ? 'Open' : 'Unavailable')}
          </div>
        </header>

        <div className="feedback-order-panel">
          <div>
            <span>Receipt / Order ID</span>
            <strong>{order?.displayId || order?.orderCode || 'Not available'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatCurrency(order?.total || order?.totalAmount)}</strong>
          </div>
        </div>

        {items.length > 0 && (
          <div className="feedback-items">
            {items.map((item) => (
              <div key={`${item.productId || item.id || item.name}-${item.quantity}`} className="feedback-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.quantity} x {formatCurrency(item.price)}</span>
                </div>
                <span>{formatCurrency((Number(item.quantity) || 0) * (Number(item.price) || 0))}</span>
              </div>
            ))}
          </div>
        )}

        {!payload?.feedbackEnabled ? (
          <div className={payload?.feedbackSubmitted || success ? 'feedback-success feedback-success--compact' : 'feedback-disabled'}>
            {payload?.feedbackSubmitted || success ? <CheckCircle2 size={30} /> : <MessageSquareText size={28} />}
            <span>{payload?.invalidReason || 'Feedback is not available for this order.'}</span>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={submitFeedback}>
            <FeedbackRating label="Overall rating" value={ratings.overall} onChange={(value) => setRating('overall', value)} />
            <FeedbackRating label="Product quality" value={ratings.product} onChange={(value) => setRating('product', value)} />
            <FeedbackRating label="Service" value={ratings.service} onChange={(value) => setRating('service', value)} />
            <FeedbackRating label={fulfillmentLabel} value={ratings.fulfillment} onChange={(value) => setRating('fulfillment', value)} />

            <label className="feedback-field">
              <span>Comments or suggestions</span>
              <textarea
                value={comment}
                maxLength={2000}
                rows={5}
                placeholder="Tell us what went well or what we can improve."
                onChange={(event) => setComment(event.target.value)}
              />
            </label>

            <label className="feedback-toggle">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(event) => setIsAnonymous(event.target.checked)}
              />
              <span>Submit anonymously</span>
            </label>

            {!isAnonymous && (
              <label className="feedback-field">
                <span>Name</span>
                <input
                  type="text"
                  value={customerName}
                  placeholder="Your name"
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </label>
            )}

            {error && <div className="feedback-error">{error}</div>}

            <button type="submit" className="feedback-submit" disabled={!canSubmit}>
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

export default Feedback;
