import {
  cancelLalamoveDelivery,
  getLalamoveConfig,
  LalamoveApiError,
  normalizeLalamoveStatus,
  retrieveLalamoveOrderDetails,
} from './lalamove.js';

const isCancelled = (status) => ['CANCELED', 'CANCELLED'].includes(normalizeLalamoveStatus(status));
const cancellableStatuses = new Set(['ASSIGNING_DRIVER', 'ON_GOING', 'ONGOING']);
const finalizedStatuses = new Set(['PICKED_UP', 'COMPLETED', 'REJECTED', 'EXPIRED']);

export const cancelLalamoveOrder = async ({
  supabase,
  order,
  pickup = {},
  actorId = null,
}, {
  retrieveOrder = retrieveLalamoveOrderDetails,
  cancelDelivery = cancelLalamoveDelivery,
} = {}) => {
  const reference = String(order?.lalamove_order_id || '').trim();
  if (order?.delivery_method !== 'delivery' || !reference) {
    throw new LalamoveApiError('This order has no Lalamove delivery booking to cancel.', 409);
  }
  if (isCancelled(order.lalamove_status)) return order;
  if (finalizedStatuses.has(normalizeLalamoveStatus(order.lalamove_status))) {
    throw new LalamoveApiError('This delivery can no longer be cancelled. Refresh Tracking to check its latest status.', 409);
  }
  const bookingEnvironment = order.lalamove_metadata?.bookingEnvironment;
  if (bookingEnvironment && bookingEnvironment !== getLalamoveConfig().environment) {
    throw new LalamoveApiError('This booking belongs to a different Lalamove environment. Use the original environment to cancel it.', 409);
  }

  const readProviderOrder = async () => {
    const details = await retrieveOrder(reference, { pickup });
    if (!details?.status || (details.orderId && String(details.orderId) !== reference)) {
      throw new LalamoveApiError('Lalamove did not return the expected booking status. Refresh Tracking before trying again.', 502);
    }
    return details;
  };

  let providerOrder = await readProviderOrder();
  if (!isCancelled(providerOrder.status)) {
    if (!cancellableStatuses.has(normalizeLalamoveStatus(providerOrder.status))) {
      throw new LalamoveApiError('Lalamove no longer allows cancellation for this delivery. Refresh Tracking to check its latest status.', 409);
    }
    try {
      // The courier enforces the time limit after a driver accepts the booking.
      await cancelDelivery(reference, { pickup });
    } catch (error) {
      const uncertain = Boolean(error.cancellationUncertain) || !error.status || Number(error.status) >= 500 || Number(error.status) === 408;
      if (uncertain || Number(error.status) === 409) {
        // Another tab may already have cancelled it, or a response may be lost.
        // Only report cancellation if the provider confirms it.
        let reconciled;
        try { reconciled = await readProviderOrder(); } catch { /* Keep the original failure below. */ }
        if (isCancelled(reconciled?.status)) {
          providerOrder = reconciled;
        } else if (uncertain) {
          throw new LalamoveApiError('Cancellation could not be confirmed. Use Refresh Tracking or check Lalamove Partner Portal before trying again.', 502);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  const now = new Date().toISOString();
  const patch = {
    lalamove_status: 'CANCELED',
    lalamove_last_synced_at: now,
    lalamove_booking_error: null,
    lalamove_metadata: {
      ...order.lalamove_metadata,
      order: { ...order.lalamove_metadata?.order, ...providerOrder, status: 'CANCELED' },
      cancellation: { confirmedAt: now, requestedBy: actorId, orderId: reference },
    },
  };

  try {
    const { data, error } = await supabase.from('orders')
      .update(patch)
      .eq('id', order.id)
      .eq('lalamove_order_id', reference)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Booking reference changed before the cancellation could be saved.');
  } catch {
    throw new LalamoveApiError(`Lalamove booking ${reference} was cancelled, but its status could not be saved. Use Refresh Tracking to update this order.`, 502);
  }

  // Courier cancellation never changes the dessert order, stock or payment.
  return { ...order, ...patch };
};
