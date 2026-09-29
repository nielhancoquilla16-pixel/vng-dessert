import crypto, { randomUUID } from 'crypto';
import fetch from 'node-fetch';

const DEFAULT_ENVIRONMENT = 'sandbox';
const DEFAULT_MARKET = 'PH';
const DEFAULT_LANGUAGE = 'en_PH';
const DEFAULT_SERVICE_TYPE = 'MOTORCYCLE';
const DEFAULT_APP_LAUNCH_URL = 'https://lalamove.onelink.me/MgeC?af_dp=lalamove%3A%2F%2Fopen&af_web_dp=https%3A%2F%2Fweb.lalamove.com';
const DEFAULT_WEB_BOOKING_URL = 'https://web.lalamove.com';

const LALAMOVE_HOSTS = {
  sandbox: 'https://rest.sandbox.lalamove.com',
  production: 'https://rest.lalamove.com',
};

const LALAMOVE_STATUS_LABELS = {
  ASSIGNING_DRIVER: 'Pending Driver',
  ON_GOING: 'Driver Assigned',
  PICKED_UP: 'Picked Up',
  COMPLETED: 'Delivered',
  CANCELED: 'Cancelled',
  CANCELLED: 'Cancelled',
  REJECTED: 'Cancelled',
  EXPIRED: 'Cancelled',
  BOOKING: 'Booking in progress',
  BOOKING_UNCONFIRMED: 'Booking needs confirmation',
};

export class LalamoveApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'LalamoveApiError';
    this.status = status;
    this.details = details;
  }
}

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const hasValue = (value) => Boolean(String(value || '').trim());

const parseCsv = (value = '') => (
  String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
);

const normalizeEnvironment = (value = '') => {
  const normalized = String(value || DEFAULT_ENVIRONMENT).trim().toLowerCase();
  return normalized === 'production' ? 'production' : 'sandbox';
};

export const getLalamoveConfig = (pickupOverride = {}) => {
  const environment = normalizeEnvironment(process.env.LALAMOVE_ENVIRONMENT || process.env.LALAMOVE_ENV);
  const baseUrl = trimTrailingSlash(process.env.LALAMOVE_BASE_URL || LALAMOVE_HOSTS[environment]);

  return {
    environment,
    baseUrl,
    apiKey: String(process.env.LALAMOVE_API_KEY || '').trim(),
    apiSecret: String(process.env.LALAMOVE_API_SECRET || '').trim(),
    market: String(process.env.LALAMOVE_MARKET || DEFAULT_MARKET).trim().toUpperCase(),
    language: String(process.env.LALAMOVE_LANGUAGE || DEFAULT_LANGUAGE).trim(),
    serviceType: String(process.env.LALAMOVE_SERVICE_TYPE || DEFAULT_SERVICE_TYPE).trim().toUpperCase(),
    specialRequests: parseCsv(process.env.LALAMOVE_SPECIAL_REQUESTS),
    isPODEnabled: String(process.env.LALAMOVE_POD_ENABLED || 'true').toLowerCase() !== 'false',
    appLaunchUrl: String(process.env.LALAMOVE_APP_URL || DEFAULT_APP_LAUNCH_URL).trim(),
    webBookingUrl: String(process.env.LALAMOVE_WEB_BOOKING_URL || DEFAULT_WEB_BOOKING_URL).trim(),
    pickup: {
      name: String(pickupOverride.name || process.env.LALAMOVE_PICKUP_NAME || 'V&G Dessert Shop').trim(),
      phone: String(pickupOverride.phone || process.env.LALAMOVE_PICKUP_PHONE || '').trim(),
      address: String(pickupOverride.address || process.env.LALAMOVE_PICKUP_ADDRESS || '').trim(),
      latitude: String(pickupOverride.latitude ?? process.env.LALAMOVE_PICKUP_LATITUDE ?? '').trim(),
      longitude: String(pickupOverride.longitude ?? process.env.LALAMOVE_PICKUP_LONGITUDE ?? '').trim(),
    },
    webhookSecret: String(process.env.LALAMOVE_WEBHOOK_SECRET || '').trim(),
  };
};

const normalizeCoordinate = (value) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  return String(parsed);
};

const buildMapPinUrl = ({ latitude, longitude, address } = {}) => {
  const lat = normalizeCoordinate(latitude);
  const lng = normalizeCoordinate(longitude);

  if (lat && lng) {
    return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`;
  }

  const query = String(address || '').trim();
  return query ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}` : '';
};

const normalizePhoneNumber = (value = '', market = DEFAULT_MARKET) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('+')) {
    return `+${rawValue.replace(/[^0-9]/g, '')}`;
  }

  const digits = rawValue.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (String(market || '').toUpperCase() === 'PH') {
    if (digits.startsWith('09') && digits.length === 11) {
      return `+63${digits.slice(1)}`;
    }

    if (digits.startsWith('9') && digits.length === 10) {
      return `+63${digits}`;
    }

    if (digits.startsWith('63')) {
      return `+${digits}`;
    }
  }

  return `+${digits}`;
};

const validateCoordinates = ({ latitude, longitude }, label) => {
  const lat = normalizeCoordinate(latitude);
  const lng = normalizeCoordinate(longitude);

  if (!lat || !lng) {
    throw new LalamoveApiError(`Select a valid ${label.toLowerCase()} map pin before booking Lalamove.`, 400);
  }

  const numericLat = Number(lat);
  const numericLng = Number(lng);
  if (numericLat < -90 || numericLat > 90 || numericLng < -180 || numericLng > 180) {
    throw new LalamoveApiError(`Select a valid ${label.toLowerCase()} map pin within the latitude/longitude range.`, 400);
  }

  if (numericLat === 0 && numericLng === 0) {
    throw new LalamoveApiError(`Select the actual ${label.toLowerCase()} location on the map before booking Lalamove.`, 400);
  }

  return { lat, lng };
};

const getRequiredCredentialErrors = (config) => {
  const missing = [];

  if (!hasValue(config.apiKey)) missing.push('LALAMOVE_API_KEY');
  if (!hasValue(config.apiSecret)) missing.push('LALAMOVE_API_SECRET');

  return missing;
};

const getRequiredConfigErrors = (config = getLalamoveConfig()) => {
  const missing = getRequiredCredentialErrors(config);

  if (!hasValue(config.pickup.address)) missing.push('LALAMOVE_PICKUP_ADDRESS');
  if (!hasValue(config.pickup.phone)) missing.push('LALAMOVE_PICKUP_PHONE');
  if (!hasValue(config.pickup.latitude)) missing.push('LALAMOVE_PICKUP_LATITUDE');
  if (!hasValue(config.pickup.longitude)) missing.push('LALAMOVE_PICKUP_LONGITUDE');

  return missing;
};

const assertLalamoveCredentialsConfigured = (pickupOverride = {}) => {
  const config = getLalamoveConfig(pickupOverride);
  const missing = getRequiredCredentialErrors(config);

  if (missing.length > 0) {
    throw new LalamoveApiError(
      `Lalamove is not configured. Add ${missing.join(', ')} to dessert-ai-system/server/.env and restart the backend.`,
      503,
      { missing },
    );
  }

  return config;
};

export const isLalamoveConfigured = (pickupOverride = {}) => getRequiredConfigErrors(getLalamoveConfig(pickupOverride)).length === 0;

export const getLalamoveStatusPayload = ({ includePickupDetails = false, pickup = {} } = {}) => {
  const config = getLalamoveConfig(pickup);
  const missing = getRequiredConfigErrors(config);
  const pickupLatitude = normalizeCoordinate(config.pickup.latitude);
  const pickupLongitude = normalizeCoordinate(config.pickup.longitude);
  const pickupPhone = normalizePhoneNumber(config.pickup.phone, config.market) || config.pickup.phone;

  const payload = {
    configured: missing.length === 0,
    credentialsConfigured: getRequiredCredentialErrors(config).length === 0,
    pickupConfigured: ['address', 'phone', 'latitude', 'longitude'].every((key) => hasValue(config.pickup[key])),
    missing,
    environment: config.environment,
    market: config.market,
    language: config.language,
    serviceType: config.serviceType,
    specialRequests: config.specialRequests,
    webhookConfigured: hasValue(config.webhookSecret),
    appLaunchUrl: config.appLaunchUrl,
    webBookingUrl: config.webBookingUrl,
    mode: missing.length === 0 ? 'delivery-api' : 'manual-app-launch',
  };

  if (!includePickupDetails) {
    return payload;
  }

  return {
    ...payload,
    pickup: {
      name: config.pickup.name,
      phone: pickupPhone,
      address: config.pickup.address,
      latitude: pickupLatitude,
      longitude: pickupLongitude,
      mapUrl: buildMapPinUrl({
        latitude: pickupLatitude,
        longitude: pickupLongitude,
        address: config.pickup.address,
      }),
    },
  };
};

const signRequest = ({ config, method, path, bodyString = '' }) => {
  const timestamp = Date.now().toString();
  const rawSignature = `${timestamp}\r\n${method.toUpperCase()}\r\n${path}\r\n\r\n${bodyString}`;
  const signature = crypto
    .createHmac('sha256', config.apiSecret)
    .update(rawSignature)
    .digest('hex');

  return {
    timestamp,
    authorization: `hmac ${config.apiKey}:${timestamp}:${signature}`,
  };
};

const parseLalamoveJson = async (response) => {
  // Cancellation succeeds with an empty 204, even if a JSON header is sent.
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }

  return { message: text };
};

export const lalamoveRequest = async (path, { method = 'GET', body = null, headers = {}, pickup = {} } = {}) => {
  // Existing order and driver lookups need credentials, not a new pickup.
  // createLalamoveDelivery validates the full pickup before booking.
  const config = assertLalamoveCredentialsConfigured(pickup);
  const httpMethod = method.toUpperCase();
  const bodyString = body ? JSON.stringify(body) : '';
  const signature = signRequest({
    config,
    method: httpMethod,
    path,
    bodyString,
  });

  const response = await fetch(`${config.baseUrl}${path}`, {
    method: httpMethod,
    headers: {
      Authorization: signature.authorization,
      Market: config.market,
      'Request-ID': randomUUID(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body ? bodyString : undefined,
    signal: AbortSignal.timeout(20000),
  });

  const data = await parseLalamoveJson(response);
  if (!response.ok) {
    const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
    const message = firstError?.detail
      || firstError?.message
      || data?.message
      || data?.error
      || `Lalamove request failed with status ${response.status}.`;
    throw new LalamoveApiError(message, response.status, data);
  }

  return data;
};

const getOrderItemsSummary = (order = {}) => (
  (order.order_items || [])
    .map((item) => `${Math.max(1, Number(item.quantity) || 0)}x ${item.products?.product_name || 'Dessert Item'}`)
    .join(', ')
);

const getOrderCode = (order = {}) => order.order_code || order.orderCode || order.id || 'order';

const buildRecipientRemarks = ({ order, instructions = '' }) => {
  const orderCode = getOrderCode(order);
  const itemSummary = getOrderItemsSummary(order);
  const parts = [
    `Order ${orderCode}`,
    instructions,
    itemSummary ? `Items: ${itemSummary}` : '',
  ].filter(Boolean);

  return parts.join('. ').slice(0, 500);
};

const getBookingAddress = (order = {}) => (
  String(
    order.delivery_formatted_address
    || order.address
    || [
      order.delivery_street_address,
      order.delivery_barangay,
      order.delivery_city,
      order.delivery_province,
      order.delivery_postal_code,
    ].filter(Boolean).join(', ')
    || '',
  ).trim()
);

export const buildLalamoveManualBookingLaunch = ({
  order,
  destinationLatitude,
  destinationLongitude,
  instructions = '',
  pickup = {},
} = {}) => {
  const config = getLalamoveConfig(pickup);
  const pickupCoordinates = validateCoordinates({
    latitude: config.pickup.latitude,
    longitude: config.pickup.longitude,
  }, 'Pickup');
  const destinationCoordinates = validateCoordinates({
    latitude: destinationLatitude ?? order?.delivery_latitude,
    longitude: destinationLongitude ?? order?.delivery_longitude,
  }, 'Destination');
  const destinationAddress = getBookingAddress(order);
  const recipientName = String(
    order?.delivery_recipient_name
    || order?.customer_name
    || order?.profiles?.full_name
    || order?.profiles?.username
    || 'Customer',
  ).trim();
  const recipientPhone = normalizePhoneNumber(
    order?.delivery_contact_number
    || order?.phone_number
    || '',
    config.market,
  );
  const senderPhone = normalizePhoneNumber(config.pickup.phone, config.market);
  const itemSummary = getOrderItemsSummary(order);
  const remarks = buildRecipientRemarks({ order, instructions });

  if (!config.pickup.address || !senderPhone) {
    throw new LalamoveApiError('Pickup address and phone number are required before opening Lalamove.', 400);
  }

  if (!destinationAddress || !recipientName || !recipientPhone) {
    throw new LalamoveApiError('Recipient name, contact number, and delivery address are required before opening Lalamove.', 400);
  }

  const summaryLines = [
    `Order: ${getOrderCode(order)}`,
    `Service: ${config.serviceType}`,
    `Pickup: ${config.pickup.name}`,
    `Pickup Phone: ${senderPhone}`,
    `Pickup Address: ${config.pickup.address}`,
    `Pickup Coordinates: ${pickupCoordinates.lat}, ${pickupCoordinates.lng}`,
    `Recipient: ${recipientName}`,
    `Recipient Phone: ${recipientPhone}`,
    `Delivery Address: ${destinationAddress}`,
    `Delivery Coordinates: ${destinationCoordinates.lat}, ${destinationCoordinates.lng}`,
    instructions ? `Instructions: ${instructions}` : '',
    itemSummary ? `Items: ${itemSummary}` : '',
  ].filter(Boolean);

  const bookingPayload = {
    serviceType: config.serviceType,
    language: config.language,
    market: config.market,
    pickup: {
      name: config.pickup.name,
      phone: senderPhone,
      address: config.pickup.address,
      coordinates: pickupCoordinates,
    },
    delivery: {
      recipientName,
      phone: recipientPhone,
      address: destinationAddress,
      coordinates: destinationCoordinates,
      remarks,
    },
    order: {
      id: order?.id || '',
      code: getOrderCode(order),
      items: itemSummary,
    },
  };

  return {
    launchUrls: {
      app: config.appLaunchUrl || DEFAULT_APP_LAUNCH_URL,
      web: config.webBookingUrl || DEFAULT_WEB_BOOKING_URL,
    },
    summary: summaryLines.join('\n'),
    payload: bookingPayload,
  };
};

export const createLalamoveDelivery = async ({
  order,
  destinationLatitude,
  destinationLongitude,
  instructions = '',
  pickup = {},
}) => {
  const config = getLalamoveConfig(pickup);
  const missingConfig = getRequiredConfigErrors(config);
  if (missingConfig.length > 0) {
    throw new LalamoveApiError(`Lalamove is not configured. Missing: ${missingConfig.join(', ')}.`, 503);
  }
  const pickupCoordinates = validateCoordinates({
    latitude: config.pickup.latitude,
    longitude: config.pickup.longitude,
  }, 'Pickup');
  const destinationCoordinates = validateCoordinates({
    latitude: destinationLatitude ?? order.delivery_latitude,
    longitude: destinationLongitude ?? order.delivery_longitude,
  }, 'Destination');
  const senderPhone = normalizePhoneNumber(config.pickup.phone, config.market);
  const recipientPhone = normalizePhoneNumber(
    order.delivery_contact_number || order.phone_number || order.phoneNumber || '',
    config.market,
  );

  if (!senderPhone) {
    throw new LalamoveApiError('Pickup phone number is required for Lalamove booking.', 400);
  }

  if (!recipientPhone) {
    throw new LalamoveApiError('Customer contact number is required for Lalamove booking.', 400);
  }

  const destinationAddress = getBookingAddress(order);
  if (!destinationAddress) {
    throw new LalamoveApiError('Customer delivery address is required for Lalamove booking.', 400);
  }

  const quotationPayload = {
    data: {
      serviceType: config.serviceType,
      language: config.language,
      stops: [
        {
          coordinates: pickupCoordinates,
          address: config.pickup.address,
        },
        {
          coordinates: destinationCoordinates,
          address: destinationAddress,
        },
      ],
      isRouteOptimized: false,
    },
  };

  if (config.specialRequests.length > 0) {
    quotationPayload.data.specialRequests = config.specialRequests;
  }

  const quotationResponse = await lalamoveRequest('/v3/quotations', {
    method: 'POST',
    body: quotationPayload,
    pickup,
  });
  const quotation = quotationResponse?.data || {};
  const pickupStopId = quotation.stops?.[0]?.stopId;
  const destinationStopId = quotation.stops?.[1]?.stopId;

  if (!quotation.quotationId || !pickupStopId || !destinationStopId) {
    throw new LalamoveApiError('Lalamove did not return a complete quotation.', 502, quotationResponse);
  }

  const orderPayload = {
    data: {
      quotationId: quotation.quotationId,
      sender: {
        stopId: pickupStopId,
        name: config.pickup.name,
        phone: senderPhone,
      },
      recipients: [
        {
          stopId: destinationStopId,
          name: order.delivery_recipient_name || order.customer_name || order.profiles?.full_name || order.profiles?.username || 'Customer',
          phone: recipientPhone,
          remarks: buildRecipientRemarks({ order, instructions }),
        },
      ],
      isPODEnabled: config.isPODEnabled,
      metadata: {
        localOrderId: order.id,
        orderCode: getOrderCode(order),
        paymentMethod: order.payment_method || 'cash',
        source: 'vng-dessert-dashboard',
      },
    },
  };

  let orderResponse;
  try {
    orderResponse = await lalamoveRequest('/v3/orders', {
      method: 'POST',
      body: orderPayload,
      pickup,
    });
    if (!orderResponse?.data?.orderId) {
      throw new LalamoveApiError('Lalamove did not return a booking reference.', 502);
    }
  } catch (error) {
    // A timeout or server error can happen after the courier accepted the order.
    // Request-ID is a tracing nonce, not a documented idempotency key.
    error.bookingUncertain = !error.status || error.status >= 500 || error.status === 408;
    throw error;
  }

  return {
    quotation,
    order: orderResponse?.data || {},
    quotationPayload,
    orderPayload,
    destinationCoordinates,
  };
};

export const cancelLalamoveDelivery = async (lalamoveOrderId, { pickup = {} } = {}) => {
  const id = typeof lalamoveOrderId === 'string' ? lalamoveOrderId.trim() : '';
  if (!id) {
    throw new LalamoveApiError('Lalamove order ID is required.', 400);
  }

  try {
    await lalamoveRequest(`/v3/orders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      pickup,
    });
  } catch (error) {
    if (error.status === 409 && (
      error.message === 'ERR_CANCELLATION_FORBIDDEN'
      || (Array.isArray(error.details?.errors) && error.details.errors.some(
        (entry) => entry?.id === 'ERR_CANCELLATION_FORBIDDEN' || entry?.code === 'ERR_CANCELLATION_FORBIDDEN',
      ))
    )) {
      error.message = 'Lalamove no longer allows cancellation of this booking. Contact Lalamove support for assistance.';
    }
    // The provider may have accepted cancellation before the response failed.
    error.cancellationUncertain = !error.details?.missing
      && (!error.status || error.status >= 500 || error.status === 408);
    throw error;
  }

  return { orderId: id, status: 'CANCELED' };
};

export const retrieveLalamoveOrderDetails = async (lalamoveOrderId, { pickup = {} } = {}) => {
  const id = String(lalamoveOrderId || '').trim();
  if (!id) {
    throw new LalamoveApiError('Lalamove order ID is required.', 400);
  }

  const response = await lalamoveRequest(`/v3/orders/${encodeURIComponent(id)}`, { pickup });
  return response?.data || {};
};

export const retrieveLalamoveDriverDetails = async (lalamoveOrderId, driverId) => {
  const orderId = String(lalamoveOrderId || '').trim();
  const normalizedDriverId = String(driverId || '').trim();

  if (!orderId || !normalizedDriverId) {
    return null;
  }

  try {
    const response = await lalamoveRequest(`/v3/orders/${encodeURIComponent(orderId)}/drivers/${encodeURIComponent(normalizedDriverId)}`);
    return response?.data || null;
  } catch (error) {
    if ([403, 404].includes(Number(error.status))) {
      return null;
    }

    throw error;
  }
};

export const registerLalamoveWebhook = async (url) => {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) {
    throw new LalamoveApiError('Webhook URL is required.', 400);
  }

  const response = await lalamoveRequest('/v3/webhook', {
    method: 'PATCH',
    body: {
      data: {
        url: normalizedUrl,
      },
    },
  });

  return response?.data || {};
};

export const normalizeLalamoveStatus = (status = '') => (
  String(status || '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
);

export const getLalamoveDeliveryStatusLabel = (status = '') => {
  const normalized = normalizeLalamoveStatus(status);
  return LALAMOVE_STATUS_LABELS[normalized] || (normalized ? normalized.replace(/_/g, ' ') : 'Not Booked');
};

export const mapLalamoveStatusToOrderStatus = (status = '', currentOrderStatus = '') => {
  const normalized = normalizeLalamoveStatus(status);
  const currentStatus = String(currentOrderStatus || '').toLowerCase();

  if (['COMPLETED'].includes(normalized)) {
    return 'delivered';
  }

  // Cancelling a courier booking does not cancel the customer's dessert order.
  if (['CANCELED', 'CANCELLED'].includes(normalized)) {
    return '';
  }

  if (['REJECTED', 'EXPIRED'].includes(normalized)) {
    return ['delivered', 'completed', 'refunded'].includes(currentStatus) ? currentStatus : 'cancelled';
  }

  if (normalized === 'PICKED_UP') {
    return 'out-for-delivery';
  }

  if (normalized === 'ON_GOING' && currentStatus === 'ready') {
    return 'out-for-delivery';
  }

  return '';
};

const normalizeDriverInfo = (driverData = null, fallbackDriverId = '') => {
  const source = driverData || {};
  const coordinates = source.coordinates || {};

  return {
    driverId: source.driverId || fallbackDriverId || '',
    name: source.name || '',
    phone: source.phone || '',
    plateNumber: source.plateNumber || source.plate_number || '',
    photo: source.photo || '',
    coordinates: {
      latitude: coordinates.lat || coordinates.latitude || null,
      longitude: coordinates.lng || coordinates.longitude || null,
      updatedAt: coordinates.updatedAt || coordinates.updated_at || null,
    },
  };
};

const getEstimatedDeliveryAt = (orderData = {}) => (
  orderData.estimatedDeliveryAt
  || orderData.estimatedDeliveryTime
  || orderData.estimated_delivery_at
  || orderData.eta
  || orderData.stops?.find((stop) => stop?.estimatedDeliveryAt || stop?.eta)?.estimatedDeliveryAt
  || null
);

export const buildLalamoveTrackingPatch = ({
  orderData = {},
  driverData = null,
  destinationCoordinates = null,
  instructions = '',
  bookedAt = '',
  syncedAt = new Date().toISOString(),
  extraMetadata = {},
} = {}) => {
  const driverInfo = normalizeDriverInfo(driverData, orderData.driverId);
  const distanceValue = Number(orderData.distance?.value);

  return {
    ...(destinationCoordinates?.lat ? { delivery_latitude: destinationCoordinates.lat } : {}),
    ...(destinationCoordinates?.lng ? { delivery_longitude: destinationCoordinates.lng } : {}),
    ...(instructions ? { delivery_instructions: instructions } : {}),
    lalamove_order_id: orderData.orderId || orderData.id || null,
    lalamove_quotation_id: orderData.quotationId || null,
    lalamove_status: normalizeLalamoveStatus(orderData.status || ''),
    lalamove_share_link: orderData.shareLink || null,
    lalamove_driver_id: driverInfo.driverId || null,
    lalamove_driver_info: driverInfo,
    lalamove_price_breakdown: orderData.priceBreakdown || null,
    lalamove_distance_meters: Number.isFinite(distanceValue) ? distanceValue : null,
    lalamove_estimated_delivery_at: getEstimatedDeliveryAt(orderData),
    lalamove_booked_at: bookedAt || null,
    lalamove_last_synced_at: syncedAt,
    lalamove_booking_error: null,
    lalamove_metadata: {
      order: orderData,
      ...extraMetadata,
    },
  };
};

export const verifyLalamoveWebhookToken = (headers = {}) => {
  const secret = getLalamoveConfig().webhookSecret;
  if (!secret) {
    return { ok: true, reason: '' };
  }

  const headerToken = String(
    headers['x-llm-token']
    || headers['x-lalamove-token']
    || headers['x-lalamove-webhook-token']
    || headers.authorization?.replace(/^Bearer\s+/i, '')
    || '',
  ).trim();

  if (!headerToken) {
    return { ok: false, reason: 'Missing Lalamove webhook token.' };
  }

  try {
    const ok = crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(secret));
    return { ok, reason: ok ? '' : 'Lalamove webhook token mismatch.' };
  } catch {
    return { ok: false, reason: 'Unable to verify Lalamove webhook token.' };
  }
};

const findFirstDeepValue = (source, keys = [], depth = 0) => {
  if (!source || typeof source !== 'object' || depth > 4) {
    return '';
  }

  for (const key of keys) {
    if (source[key]) {
      return source[key];
    }
  }

  for (const value of Object.values(source)) {
    const nestedValue = findFirstDeepValue(value, keys, depth + 1);
    if (nestedValue) {
      return nestedValue;
    }
  }

  return '';
};

export const extractLalamoveWebhookState = (payload = {}) => {
  const body = payload?.data || payload;
  const orderId = findFirstDeepValue(body, ['orderId', 'orderID', 'order_id', 'lalamoveOrderId']);
  const status = findFirstDeepValue(body, ['status', 'orderStatus', 'order_status']);
  const driverId = findFirstDeepValue(body, ['driverId', 'driver_id']);
  const eventType = findFirstDeepValue(body, ['eventType', 'event_type', 'type']);

  return {
    eventType: String(eventType || '').trim(),
    orderId: String(orderId || '').trim(),
    status: normalizeLalamoveStatus(status || ''),
    driverId: String(driverId || '').trim(),
    raw: payload,
  };
};
