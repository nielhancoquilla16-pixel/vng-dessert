import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, MessageSquareText, Search, Star, TrendingUp } from 'lucide-react';
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
    if (!key) {
      return;
    }

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

const AdminFeedback = () => {
  const { session } = useAuth();
  const [feedback, setFeedback] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    product: '',
    rating: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeedback = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.set('date_from', `${filters.dateFrom}T00:00:00.000Z`);
      if (filters.dateTo) params.set('date_to', `${filters.dateTo}T23:59:59.999Z`);
      if (filters.product.trim()) params.set('product', filters.product.trim());
      if (filters.rating) params.set('rating', filters.rating);

      const query = params.toString();
      const result = await apiRequest(`/api/feedback${query ? `?${query}` : ''}`, {}, {
        auth: true,
        accessToken: session?.access_token,
      });
      setFeedback(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load feedback.');
      setFeedback([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.access_token) {
      return;
    }

    loadFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  const analytics = useMemo(() => {
    const count = feedback.length;
    const averageRating = count
      ? feedback.reduce((sum, entry) => sum + (Number(entry.rating) || 0), 0) / count
      : 0;
    const satisfied = feedback.filter((entry) => Number(entry.rating) >= 4).length;

    return {
      count,
      averageRating,
      satisfactionRate: count ? Math.round((satisfied / count) * 100) : 0,
      commonTerms: getFeedbackTerms(feedback),
      trendData: buildTrendData(feedback),
    };
  }, [feedback]);

  return (
    <div className="admin-feedback-page">
      <header className="admin-feedback-header">
        <div>
          <p className="admin-feedback-kicker">Customer Voice</p>
          <h1>Feedback Dashboard</h1>
        </div>
        <div className="admin-feedback-chip">
          <MessageSquareText size={16} />
          <span>{analytics.count} responses</span>
        </div>
      </header>

      <section className="admin-feedback-toolbar">
        <label>
          <span>Date from</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
          />
        </label>
        <label>
          <span>Date to</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
          />
        </label>
        <label>
          <span>Product</span>
          <input
            type="search"
            placeholder="Product or category"
            value={filters.product}
            onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))}
          />
        </label>
        <label>
          <span>Rating</span>
          <select
            value={filters.rating}
            onChange={(event) => setFilters((current) => ({ ...current, rating: event.target.value }))}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>{value} star{value === 1 ? '' : 's'}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={loadFeedback} disabled={isLoading}>
          <Search size={17} />
          {isLoading ? 'Loading...' : 'Apply'}
        </button>
      </section>

      {error && <div className="admin-feedback-error">{error}</div>}

      <section className="admin-feedback-kpis">
        <article>
          <Star size={22} />
          <span>Average rating</span>
          <strong>{analytics.averageRating.toFixed(1)}</strong>
        </article>
        <article>
          <TrendingUp size={22} />
          <span>Satisfaction</span>
          <strong>{analytics.satisfactionRate}%</strong>
        </article>
        <article>
          <BarChart3 size={22} />
          <span>Total feedback</span>
          <strong>{analytics.count}</strong>
        </article>
      </section>

      <section className="admin-feedback-grid">
        <article className="admin-feedback-panel">
          <div className="admin-feedback-panel-head">
            <h2>Satisfaction Trend</h2>
          </div>
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
          <div className="admin-feedback-panel-head">
            <h2>Common Feedback</h2>
          </div>
          {analytics.commonTerms.length === 0 ? (
            <div className="admin-feedback-empty">Comments will surface common words here.</div>
          ) : (
            <div className="admin-feedback-terms">
              {analytics.commonTerms.map((term) => (
                <span key={term.word}>{term.word} <strong>{term.count}</strong></span>
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="admin-feedback-panel">
        <div className="admin-feedback-panel-head">
          <h2>All Feedback</h2>
        </div>
        {isLoading ? (
          <div className="admin-feedback-empty">Loading feedback...</div>
        ) : feedback.length === 0 ? (
          <div className="admin-feedback-empty">No feedback matches these filters.</div>
        ) : (
          <div className="admin-feedback-list">
            {feedback.map((entry) => (
              <article key={entry.id} className="admin-feedback-row">
                <div>
                  <div className="admin-feedback-row-head">
                    <strong>{entry.order?.displayId || entry.orderId}</strong>
                    <span>{formatDate(entry.submittedAt)}</span>
                  </div>
                  <p>{entry.comment || 'No comment provided.'}</p>
                  <small>
                    {(entry.purchasedItems || []).map((item) => item.name).join(', ') || 'Items unavailable'}
                  </small>
                </div>
                <div className="admin-feedback-rating">
                  <Star size={16} fill="currentColor" />
                  <strong>{entry.rating}</strong>
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
