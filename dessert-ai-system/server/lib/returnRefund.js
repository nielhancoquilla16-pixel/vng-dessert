export const RETURN_REFUND_STATUSES = ['pending', 'approved', 'processing', 'refunded', 'completed', 'rejected'];
export const RETURN_REFUND_TYPES = ['return', 'refund'];

const normalizeText = (value = '') => String(value ?? '').trim();

export const normalizeReturnRefundStatus = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return RETURN_REFUND_STATUSES.includes(normalized) ? normalized : 'pending';
};

export const normalizeReturnRefundType = (value = '') => {
  const normalized = normalizeText(value).toLowerCase();
  return RETURN_REFUND_TYPES.includes(normalized) ? normalized : 'refund';
};

export const getReturnRefundStatusLabel = (value = '') => {
  const status = normalizeReturnRefundStatus(value);
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export const isValidReturnRefundTransition = (currentStatus, nextStatus) => {
  const current = normalizeReturnRefundStatus(currentStatus);
  const next = normalizeReturnRefundStatus(nextStatus);
  const transitions = {
    pending: ['approved', 'rejected'],
    approved: ['processing', 'rejected'],
    processing: ['refunded'],
    refunded: ['completed'],
    completed: [],
    rejected: [],
  };

  return transitions[current]?.includes(next) || false;
};

export const buildReturnRefundHistoryEntry = ({ status, actorId = null, actorRole = '', note = '', at = new Date().toISOString() } = {}) => ({
  status: normalizeReturnRefundStatus(status),
  actorId,
  actorRole: normalizeText(actorRole).toLowerCase(),
  note: normalizeText(note),
  createdAt: at,
});

export const mapReturnRefundRequest = (row = {}) => ({
  id: row.id,
  orderId: row.order_id || row.orderId || '',
  userId: row.user_id || row.userId || '',
  type: normalizeReturnRefundType(row.request_type || row.type),
  reason: row.reason || '',
  customerMessage: row.customer_message || row.customerMessage || '',
  evidenceImageUrl: row.evidence_image_url || row.evidenceImageUrl || '',
  status: normalizeReturnRefundStatus(row.status),
  rejectionReason: row.rejection_reason || row.rejectionReason || '',
  submittedAt: row.created_at || row.submittedAt || '',
  updatedAt: row.updated_at || row.updatedAt || '',
  approvedAt: row.approved_at || row.approvedAt || null,
  processingAt: row.processing_at || row.processingAt || null,
  refundedAt: row.refunded_at || row.refundedAt || null,
  completedAt: row.completed_at || row.completedAt || null,
  rejectedAt: row.rejected_at || row.rejectedAt || null,
  history: Array.isArray(row.status_history) ? row.status_history : (Array.isArray(row.history) ? row.history : []),
});
