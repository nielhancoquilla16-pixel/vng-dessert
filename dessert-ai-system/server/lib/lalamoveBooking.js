import { buildLalamoveTrackingPatch, createLalamoveDelivery, getLalamoveConfig, LalamoveApiError } from './lalamove.js';

export const buildLalamoveBookingLaunch = (order = {}) => ({
  mode: 'delivery-api',
  orderId: order.lalamove_order_id || '',
  shareLink: order.lalamove_share_link || '',
  // Only the provider share link identifies this booked delivery.
  launchUrls: {
    web: order.lalamove_share_link || '',
  },
});

export const bookLalamoveOrder = async ({
  supabase,
  order,
  addressPatch = {},
  pickup = {},
  instructions = '',
}, { createDelivery = createLalamoveDelivery } = {}) => {
  if (order.lalamove_order_id) return order;

  // Persist the claim before contacting the courier, across tabs and servers.
  const { data: claimed, error: claimError } = await supabase
    .from('orders')
    .update({
      ...addressPatch,
      lalamove_status: 'BOOKING',
      lalamove_booking_error: null,
      lalamove_last_synced_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('order_status', order.order_status)
    .is('lalamove_order_id', null)
    .or('lalamove_status.is.null,lalamove_status.not.in.(BOOKING,BOOKING_UNCONFIRMED)')
    .select('id')
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) {
    throw new LalamoveApiError('This order changed or a Lalamove booking is already in progress. Refresh the order before continuing.', 409);
  }

  let delivery;
  try {
    const preparedOrder = { ...order, ...addressPatch };
    delivery = await createDelivery({
      order: preparedOrder,
      destinationLatitude: preparedOrder.delivery_latitude,
      destinationLongitude: preparedOrder.delivery_longitude,
      instructions,
      pickup,
    });
    const now = new Date().toISOString();
    const trackingPatch = buildLalamoveTrackingPatch({
      orderData: { ...delivery.order, quotationId: delivery.order.quotationId || delivery.quotation.quotationId },
      destinationCoordinates: delivery.destinationCoordinates,
      instructions,
      bookedAt: now,
      syncedAt: now,
      extraMetadata: {
        ...order.lalamove_metadata,
        order: delivery.order,
        bookingMode: 'delivery-api',
        bookingEnvironment: getLalamoveConfig(pickup).environment,
      },
    });
    const { data: saved, error: saveError } = await supabase
      .from('orders')
      .update(trackingPatch)
      .eq('id', order.id)
      .select('id')
      .maybeSingle();
    if (saveError) throw saveError;
    if (!saved) throw new Error('Unable to save the Lalamove booking reference.');

    return { ...preparedOrder, ...trackingPatch };
  } catch (error) {
    const uncertain = Boolean(delivery || error.bookingUncertain);
    const reference = delivery?.order?.orderId;
    const message = uncertain
      ? `${reference ? `Lalamove booking ${reference} was created, but its reference could not be saved.` : 'Lalamove may have accepted this booking, but confirmation was not received.'} Check the Lalamove Partner Portal and save the booking reference before trying again.`
      : error.message || 'Unable to book Lalamove delivery.';

    // Keep uncertain submissions locked: blindly retrying could dispatch twice.
    const { error: recoveryError } = await supabase
      .from('orders')
      .update({
        lalamove_status: uncertain ? 'BOOKING_UNCONFIRMED' : order.lalamove_status || null,
        lalamove_booking_error: message,
        ...(reference ? { lalamove_metadata: { ...order.lalamove_metadata, unconfirmedBooking: delivery.order } } : {}),
      })
      .eq('id', order.id)
      .is('lalamove_order_id', null)
      .eq('lalamove_status', 'BOOKING');
    if (recoveryError) console.warn('Unable to record Lalamove booking failure:', recoveryError.message);
    throw new LalamoveApiError(message, uncertain ? 409 : error.status || 502);
  }
};
