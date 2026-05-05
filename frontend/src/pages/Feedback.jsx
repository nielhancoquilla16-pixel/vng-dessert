import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, MessageSquareText, Star } from 'lucide-react';
import { apiRequest } from '../lib/api';
import './Feedback.css';

const formatCurrency = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

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

const Feedback = () => {
  const { token } = useParams();
  const [payload, setPayload] = useState(null);
  const [rating, setRating] = useState(0);
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
  const canSubmit = payload?.feedbackEnabled && rating >= 1 && !isSubmitting && !success;
  const ratingLabel = useMemo(() => {
    if (rating >= 5) return 'Excellent';
    if (rating === 4) return 'Good';
    if (rating === 3) return 'Okay';
    if (rating === 2) return 'Could be better';
    if (rating === 1) return 'Needs attention';
    return 'Tap a star';
  }, [rating]);

  const submitFeedback = async (event) => {
    event.preventDefault();

    if (!rating) {
      setError('Please choose a star rating.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await apiRequest(`/api/feedback/${encodeURIComponent(token || '')}`, {
        method: 'POST',
        body: JSON.stringify({
          rating,
          comment,
          customerName,
          isAnonymous,
        }),
      });
      setSuccess(true);
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
          <div className="feedback-status-chip">{payload.feedbackEnabled ? 'Open' : 'Disabled'}</div>
        </header>

        <div className="feedback-order-panel">
          <div>
            <span>Purchased items</span>
            <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{order?.total || formatCurrency(order?.totalAmount)}</strong>
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

        {!payload.feedbackEnabled ? (
          <div className="feedback-disabled">
            {payload.invalidReason || 'Feedback is not available for this order.'}
          </div>
        ) : success ? (
          <div className="feedback-success">
            <CheckCircle2 size={38} />
            <h2>Thank you</h2>
            <p>Your feedback was submitted and linked to this order.</p>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={submitFeedback}>
            <div className="feedback-rating-block">
              <span>Rate your experience</span>
              <div className="feedback-stars" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value <= rating ? 'is-selected' : ''}
                    aria-label={`${value} star${value === 1 ? '' : 's'}`}
                    onClick={() => setRating(value)}
                  >
                    <Star size={32} fill="currentColor" />
                  </button>
                ))}
              </div>
              <strong>{ratingLabel}</strong>
            </div>

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
