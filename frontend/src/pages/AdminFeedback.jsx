import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, BarChart3, Check, Eye, MessageSquareText, Search, Star, TrendingUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import './AdminFeedback.css';

const formatDate = (value) => {
  const parsed = new Date(value || '');
  return Number.isNaN(parsed.getTime())
    ? 'Not available'
    : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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

const getFeedbackTerms = (feedback = []) => {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'was', 'were', 'this', 'that', 'very', 'good', 'order', 'food', 'please']);
  const counts = new Map();

  feedback.forEach((entry) => {
    String(entry.comment || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !stopWords.has(word))
      .forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  });

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));
};

const buildTrendData = (feedback = []) => {
  const byDate = new Map();

  feedback.forEach((entry) => {
    const key = (entry.submittedAt || '').slice(0, 10);
    if (!key) return;

    const current = byDate.get(key) || { date: key, ratingTotal: 0, count: 0 };
    current.ratingTotal += Number(entry.rating) || 0;
    current.count += 1;
    byDate.set(key, current);
  });

  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((entry) => ({
      date: formatDate(entry.date),
      averageRating: Number((entry.ratingTotal / Math.max(1, entry.count)).toFixed(2)),
      count: entry.count,
    }));
};

const getStatusLabel = (status) => {
  const normalized = String(status || 'new').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const RatingLine = ({ label, rating }) => (
  <div className="admin-feedback-rating-line">
    <span>{label}</span>
    <strong><Star size={15} fill="currentColor" /> {Number(rating) || 0}/5</strong>
  </div>
);

const AdminFeedback = () => {
  const { session } = useAuth();
  const [searchParams] = useSearchParams();
  const [feedback, setFeedback] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    product: '',
    rating: '',
    status: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedFeedbackId, setSelectedFeedbackId] = useState('');
  const [error, setError] = useState('');

  const loadFeedback = useCallback(async ({ showLoading = true } = {}) => {
    if (!session?.access_token) return;

    if (showLoading) setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('date_from', `${filters.dateFrom}T00:00:00.000Z`);
      if (filters.dateTo) params.set('date_to', `${filters.dateTo}T23:59:59.999Z`);
      if (filters.product.trim()) params.set('product', filters.product.trim());
      if (filters.rating) params.set('rating', filters.rating);
      if (filters.status) params.set('status', filters.status);

      const query = params.toString();
      const result = await apiRequest(`/api/feedback${query ? `?${query}` : ''}`, {}, {
        auth: true,
        accessToken: session.access_token,
      });
      setFeedback(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load feedback.');
      setFeedback([]);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [filters, session?.access_token]);

  const updateFeedbackStatus = useCallback(async (feedbackId, status) => {
    if (!session?.access_token || !feedbackId) return null;

    setIsUpdating(true);
    setError('');

    try {
      const result = await apiRequest(`/api/feedback/${encodeURIComponent(feedbackId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }, {
        auth: true,
        accessToken: session.access_token,
      });
      const updated = result?.feedback;
      if (updated) {
        setFeedback((current) => current.map((entry) => (
          entry.id === updated.id ? updated : entry
        )));
      }
      return updated || null;
    } catch (updateError) {
      setError(updateError.message || 'Unable to update feedback status.');
      return null;
    } finally {
      setIsUpdating(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    loadFeedback();
  }, [loadFeedback]);

  useEffect(() => {
    if (!session?.access_token) return undefined;

    const timer = window.setInterval(() => {
      loadFeedback({ showLoading: false });
    }, 15000);

    return () => window.clearInterval(timer);
  }, [loadFeedback, session?.access_token]);

  const selectedFeedback = feedback.find((entry) => entry.id === selectedFeedbackId) || null;
  const requestedFeedbackId = searchParams.get('feedback') || '';

  useEffect(() => {
    if (!requestedFeedbackId) return;

    const requestedFeedback = feedback.find((entry) => entry.id === requestedFeedbackId);
    if (!requestedFeedback) return;

    setSelectedFeedbackId(requestedFeedback.id);
    if (requestedFeedback.status === 'new') {
      updateFeedbackStatus(requestedFeedback.id, 'viewed');
    }
  }, [feedback, requestedFeedbackId, updateFeedbackStatus]);

  const handleViewFeedback = async (entry) => {
    setSelectedFeedbackId(entry.id);
    if (entry.status === 'new') {
      await updateFeedbackStatus(entry.id, 'viewed');
    }
  };

  const analytics = useMemo(() => {
    const count = feedback.length;
    const averageRating = count
      ? feedback.reduce((sum, entry) => sum + (Number(entry.rating) || 0), 0) / count
      : 0;
    const ratingCounts = [1, 2, 3, 4, 5].reduce((counts, rating) => ({
      ...counts,
      [rating]: feedback.filter((entry) => Number(entry.rating) === rating).length,
    }), {});

    return {
      count,
      averageRating,
      ratingCounts,
      commonTerms: getFeedbackTerms(feedback),
      trendData: buildTrendData(feedback),
    };
  }, [feedback]);

  return (
    <div className="admin-feedback-page">
      <header className="admin-feedback-header">
        <div>
          <p className="admin-feedback-kicker">Customer Feedback</p>
          <h1>Feedback Dashboard</h1>
        </div>
        <div className="admin-feedback-chip">
          <MessageSquareText size={16} />
          <span>{analytics.count} response{analytics.count === 1 ? '' : 's'}</span>
        </div>
      </header>

      <section className="admin-feedback-toolbar">
        <label>
          <span>Date from</span>
          <input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} />
        </label>
        <label>
          <span>Date to</span>
          <input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} />
        </label>
        <label>
          <span>Product</span>
          <input type="search" placeholder="Product or category" value={filters.product} onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))} />
        </label>
        <label>
          <span>Rating</span>
          <select value={filters.rating} onChange={(event) => setFilters((current) => ({ ...current, rating: event.target.value }))}>
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} star{value === 1 ? '' : 's'}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="viewed">Viewed</option>
            <option value="acknowledged">Acknowledged</option>
          </select>
        </label>
        <button type="button" onClick={() => loadFeedback()} disabled={isLoading}>
          <Search size={17} />
          {isLoading ? 'Loading...' : 'Apply'}
        </button>
      </section>

      {error && <div className="admin-feedback-error">{error}</div>}

      <section className="admin-feedback-kpis">
        <article><BarChart3 size={22} /><span>Total feedback</span><strong>{analytics.count}</strong></article>
        <article><TrendingUp size={22} /><span>Average rating</span><strong>{analytics.averageRating.toFixed(1)}</strong></article>
        {[5, 4, 3, 2, 1].map((rating) => (
          <article key={rating}><Star size={22} /><span>{rating}-star ratings</span><strong>{analytics.ratingCounts[rating]}</strong></article>
        ))}
      </section>

      <section className="admin-feedback-grid">
        <article className="admin-feedback-panel">
          <div className="admin-feedback-panel-head"><h2>Satisfaction Trend</h2></div>
          {analytics.trendData.length === 0 ? (
            <div className="admin-feedback-empty">No trend data yet.</div>
          ) : (
            <div className="admin-feedback-chart">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={analytics.trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis domain={[1, 5]} stroke="#64748b" />
                  <Tooltip />
                  <Line type="monotone" dataKey="averageRating" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="admin-feedback-panel">
          <div className="admin-feedback-panel-head"><h2>Common Feedback</h2></div>
          {analytics.commonTerms.length === 0 ? (
            <div className="admin-feedback-empty">Comments will surface common words here.</div>
          ) : (
            <div className="admin-feedback-terms">
              {analytics.commonTerms.map((term) => <span key={term.word}>{term.word} <strong>{term.count}</strong></span>)}
            </div>
          )}
        </article>
      </section>

      {selectedFeedback && (
        <section className="admin-feedback-panel admin-feedback-detail">
          <div className="admin-feedback-panel-head">
            <div>
              <p className="admin-feedback-kicker">Selected Feedback</p>
              <h2>{selectedFeedback.order?.displayId || selectedFeedback.orderId}</h2>
            </div>
            <span className={`admin-feedback-status admin-feedback-status--${selectedFeedback.status}`}>{getStatusLabel(selectedFeedback.status)}</span>
          </div>

          <div className="admin-feedback-detail-grid">
            <div><span>Customer</span><strong>{selectedFeedback.isAnonymous ? 'Anonymous' : (selectedFeedback.customerName || 'Customer')}</strong></div>
            <div><span>Receipt number</span><strong>{selectedFeedback.order?.paymentReceiptNumber || selectedFeedback.order?.orderCode || selectedFeedback.orderId}</strong></div>
            <div><span>Order date</span><strong>{formatDateTime(selectedFeedback.order?.createdAt || selectedFeedback.transactionAt)}</strong></div>
            <div><span>Submitted</span><strong>{formatDateTime(selectedFeedback.submittedAt)}</strong></div>
          </div>

          <div className="admin-feedback-rating-grid">
            <RatingLine label="Overall" rating={selectedFeedback.rating} />
            <RatingLine label="Product quality" rating={selectedFeedback.productRating} />
            <RatingLine label="Service" rating={selectedFeedback.serviceRating} />
            <RatingLine label={selectedFeedback.order?.deliveryMethod === 'delivery' ? 'Delivery' : 'Pickup'} rating={selectedFeedback.fulfillmentRating} />
          </div>

          <div className="admin-feedback-comment"><span>Customer comment</span><p>{selectedFeedback.comment || 'No comment provided.'}</p></div>
          <div className="admin-feedback-products"><span>Products in order</span><p>{(selectedFeedback.purchasedItems || []).map((item) => `${item.quantity} x ${item.name}`).join(', ') || 'Items unavailable'}</p></div>

          <div className="admin-feedback-actions">
            {selectedFeedback.status === 'new' && (
              <button type="button" onClick={() => updateFeedbackStatus(selectedFeedback.id, 'viewed')} disabled={isUpdating}><Eye size={16} /> Mark Viewed</button>
            )}
            {selectedFeedback.status !== 'acknowledged' && (
              <button type="button" className="is-acknowledge" onClick={() => updateFeedbackStatus(selectedFeedback.id, 'acknowledged')} disabled={isUpdating}><Check size={16} /> {isUpdating ? 'Saving...' : 'Acknowledge'}</button>
            )}
            {selectedFeedback.status === 'acknowledged' && <span className="admin-feedback-acknowledged"><BadgeCheck size={17} /> Acknowledged</span>}
          </div>
        </section>
      )}

      <section className="admin-feedback-panel">
        <div className="admin-feedback-panel-head"><h2>All Feedback</h2></div>
        {isLoading ? (
          <div className="admin-feedback-empty">Loading feedback...</div>
        ) : feedback.length === 0 ? (
          <div className="admin-feedback-empty">No feedback matches these filters.</div>
        ) : (
          <div className="admin-feedback-list">
            {feedback.map((entry) => (
              <article key={entry.id} className={`admin-feedback-row ${selectedFeedbackId === entry.id ? 'is-selected' : ''}`}>
                <div>
                  <div className="admin-feedback-row-head">
                    <strong>{entry.order?.displayId || entry.orderId}</strong>
                    <span className={`admin-feedback-status admin-feedback-status--${entry.status}`}>{getStatusLabel(entry.status)}</span>
                    <span>{formatDate(entry.submittedAt)}</span>
                  </div>
                  <p>{entry.comment || 'No comment provided.'}</p>
                  <small>{entry.isAnonymous ? 'Anonymous customer' : (entry.customerName || 'Customer')} - {(entry.purchasedItems || []).map((item) => item.name).join(', ') || 'Items unavailable'}</small>
                </div>
                <div className="admin-feedback-row-actions">
                  <div className="admin-feedback-rating"><Star size={16} fill="currentColor" /><strong>{entry.rating}</strong></div>
                  <button type="button" onClick={() => handleViewFeedback(entry)}><Eye size={16} /> View</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminFeedback;
