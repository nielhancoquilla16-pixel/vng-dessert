import crypto from 'crypto';

const PAYMONGO_API_BASE_URL = 'https://api.paymongo.com/v1';
const DEFAULT_FRONTEND_APP_URL = 'http://localhost:5173';
const DEFAULT_PAYMENT_METHOD_TYPES = ['gcash'];

export class PayMongoApiError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'PayMongoApiError';
    this.status = status;
    this.details = details;
  }
}

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/$/, '');

const parsePaymentMethodTypes = () => {
  const configuredTypes = String(process.env.PAYMONGO_PAYMENT_METHOD_TYPES || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configuredTypes.length > 0 ? configuredTypes : [...DEFAULT_PAYMENT_METHOD_TYPES];
};

export const getPayMongoFrontendBaseUrl = () => trimTrailingSlash(
  process.env.FRONTEND_APP_URL
    || process.env.CLIENT_APP_URL
    || process.env.APP_BASE_URL
    || DEFAULT_FRONTEND_APP_URL,
);

export const isPayMongoConfigured = () => Boolean(String(process.env.PAYMONGO_SECRET_KEY || '').trim());

export const getPayMongoStatusPayload = () => ({
  configured: isPayMongoConfigured(),
  frontendBaseUrl: getPayMongoFrontendBaseUrl(),
  webhookConfigured: Boolean(String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim()),
  paymentMethodTypes: parsePaymentMethodTypes(),
  mode: isPayMongoConfigured() ? 'checkout-api' : 'disabled',
});

const getPayMongoAuthorizationHeader = () => {
  const secretKey = String(process.env.PAYMONGO_SECRET_KEY || '').trim();

  if (!secretKey) {
    throw new PayMongoApiError('PayMongo is not configured. Add PAYMONGO_SECRET_KEY to dessert-ai-system/server/.env and restart the backend.', 503);
  }

  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
};

const parsePayMongoJson = async (response) => {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { error: text } : null;
};

const payMongoRequest = async (path, { method = 'GET', body, headers = {} } = {}) => {
  const response = await fetch(`${PAYMONGO_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: getPayMongoAuthorizationHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await parsePayMongoJson(response);

  if (!response.ok) {
    const message = data?.errors?.[0]?.detail
      || data?.error
      || `PayMongo request failed with status ${response.status}.`;
    throw new PayMongoApiError(message, response.status, data);
  }

  return data;
};

const toMinorUnit = (value) => Math.round((Number(value) || 0) * 100);

export const createPayMongoCheckoutSession = async ({
  lineItems = [],
  referenceNumber,
  customer = {},
  successUrl,
  cancelUrl,
  description,
}) => {
  const billing = {};

  if (customer.name) billing.name = customer.name;
  if (customer.email) billing.email = customer.email;
  if (customer.phone) billing.phone = customer.phone;

  const attributes = {
    cancel_url: cancelUrl,
    success_url: successUrl,
    description: description || `V&G Dessert order ${referenceNumber}`,
    line_items: lineItems.map((item) => ({
      amount: toMinorUnit(item.amount ?? item.price),
      currency: item.currency || 'PHP',
      description: item.description || item.name,
      name: item.name,
      quantity: Math.max(1, Number(item.quantity) || 1),
    })),
    payment_method_types: parsePaymentMethodTypes(),
    reference_number: referenceNumber,
    send_email_receipt: Boolean(customer.email),
    show_description: true,
    show_line_items: true,
  };

  if (Object.keys(billing).length > 0) {
    attributes.billing = billing;
  }

  const statementDescriptor = String(process.env.PAYMONGO_STATEMENT_DESCRIPTOR || '').trim();
  if (statementDescriptor) {
    attributes.statement_descriptor = statementDescriptor.slice(0, 22);
  }

  const response = await payMongoRequest('/checkout_sessions', {
    method: 'POST',
    headers: {
      'Idempotency-Key': referenceNumber,
    },
    body: {
      data: {
        attributes,
      },
    },
  });

  return response?.data || null;
};

export const retrievePayMongoCheckoutSession = async (checkoutSessionId) => {
  const response = await payMongoRequest(`/checkout_sessions/${checkoutSessionId}`);
  return response?.data || null;
};

export const expirePayMongoCheckoutSession = async (checkoutSessionId) => {
  const response = await payMongoRequest(`/checkout_sessions/${checkoutSessionId}/expire`, {
    method: 'POST',
  });

  return response?.data || null;
};

export const verifyPayMongoWebhookSignature = ({ payload = '', signatureHeader = '' }) => {
  const secret = String(process.env.PAYMONGO_WEBHOOK_SECRET || '').trim();

  if (!secret) {
    return {
      ok: false,
      reason: 'PayMongo webhook secret is not configured.',
    };
  }

  if (!signatureHeader) {
    return {
      ok: false,
      reason: 'Missing Paymongo-Signature header.',
    };
  }

  const signatureParts = String(signatureHeader)
    .split(',')
    .reduce((result, part) => {
      const [key, value] = part.split('=').map((entry) => entry.trim());
      if (key && value) {
        result[key] = value;
      }
      return result;
    }, {});

  const timestamp = signatureParts.t;
  const expectedSignature = signatureParts.li || signatureParts.te;

  if (!timestamp || !expectedSignature) {
    return {
      ok: false,
      reason: 'Invalid Paymongo-Signature header format.',
    };
  }

  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  try {
    const signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(computedSignature),
      Buffer.from(expectedSignature),
    );

    return {
      ok: signaturesMatch,
      reason: signaturesMatch ? '' : 'Webhook signature mismatch.',
    };
  } catch {
    return {
      ok: false,
      reason: 'Unable to compare webhook signatures.',
    };
  }
};
