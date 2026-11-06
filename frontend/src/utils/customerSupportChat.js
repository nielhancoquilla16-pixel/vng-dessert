import { AI_SECURITY_REFUSAL, guardCustomerAiReply, isRestrictedAiConversation } from '../../../dessert-ai-system/shared/customerAiPolicy.js';

const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_CONTENT_LENGTH = 1500;

export const CUSTOMER_SUPPORT_FALLBACK = "Sorry, I don't have that information available right now. You can ask me about our products, prices, discounts, orders, location, contact information, delivery, payment, or account registration.";
export const CUSTOMER_SUPPORT_GREETING = "Hi! I'm your dessert assistant. I can help with products, prices, orders, discounts, delivery, payments, account registration, and questions about our shop.";
export const getChatSecurityRefusal = (question, history = []) => (
  isRestrictedAiConversation(question, normalizeChatHistory(history)) ? AI_SECURITY_REFUSAL : ''
);

const OPERATING_HOURS_QUESTION = /\b(?:business|store|shop|operating|opening|closing)\s+hours?\b|\b(?:your|the)\s+hours\b|\b(?:what time|when)\s+(?:do you|does (?:the )?(?:shop|store))\s+(?:open|close)\b|\bare you (?:open|closed)\b|\b(?:shop|store)\s+(?:open|closed)\b|\buntil when\b.*\border\b/i;
const OTHER_SUPPORT_TOPIC = /\b(?:account|signup|register|login|password|supplier|owner|discount|promotion|delivery|product)\b|\bsign\s*up\b|\blog\s*in\b/i;

export const normalizeChatHistory = (messages = []) => {
  if (!Array.isArray(messages)) return [];

  const history = messages
    .filter((message) => message && ['user', 'assistant', 'ai'].includes(message.role))
    .map((message) => ({
      role: message.role === 'ai' ? 'assistant' : message.role,
      content: typeof (message.content ?? message.text) === 'string'
        ? (message.content ?? message.text).trim().slice(0, MAX_HISTORY_CONTENT_LENGTH)
        : '',
    }))
    .filter((message) => message.content)
    .slice(-MAX_HISTORY_MESSAGES);

  // Skip the local welcome message and any assistant turn cut off by the limit.
  const firstUserIndex = history.findIndex((message) => message.role === 'user');
  return firstUserIndex < 0 ? [] : history.slice(firstUserIndex);
};

export const createChatFallbackReply = (question, current = {}) => {
  const text = String(question || '');
  if (isRestrictedAiConversation(text)) return AI_SECURITY_REFUSAL;
  if (OPERATING_HOURS_QUESTION.test(text) && !OTHER_SUPPORT_TOPIC.test(text)) {
    if (current.isShopSettingsLoading || current.shopSettingsError || !current.shopSettings?.openingTime || !current.shopSettings?.closingTime || !current.operatingHoursLabel) {
      return "I cannot confirm the shop's current operating hours right now. Please check the shop information again shortly or contact the shop.";
    }
    return `Our daily operating hours are ${current.operatingHoursLabel} (Philippine time). The shop is currently ${current.isShopOpen ? 'open' : 'closed'}.`;
  }

  // Product and business answers require the server's current records. Never
  // substitute an arbitrary product or hardcoded facts when it is unavailable.
  return CUSTOMER_SUPPORT_FALLBACK;
};

const clientState = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  const p = value.preferences || {};
  const preferences = {};
  for (const key of ['flavors', 'excludedFlavors', 'terms', 'dietary']) {
    preferences[key] = Array.isArray(p[key]) ? p[key].filter((item) => typeof item === 'string' && item.length <= 30).slice(0, 12) : [];
  }
  for (const key of ['maxPrice', 'minPrice']) preferences[key] = Number.isFinite(p[key]) && p[key] >= 0 ? p[key] : null;
  preferences.maxExclusive = p.maxExclusive === true;
  preferences.budgetTotal = p.budgetTotal === true;
  preferences.cheapest = p.cheapest === true;
  preferences.quantity = Number.isSafeInteger(p.quantity) && p.quantity > 0 && p.quantity <= 100000 ? p.quantity : 1;
  preferences.language = p.language === 'tl' ? 'tl' : 'en';
  preferences.occasion = typeof p.occasion === 'string' ? p.occasion.slice(0, 30) : '';
  return {
    preferences,
    recommendedProductIds: Array.isArray(value.recommendedProductIds) ? [...new Set(value.recommendedProductIds.filter((id) => typeof id === 'string' && id.length <= 100))].slice(-500) : [],
  };
};

// Each provider owns one store. Nothing is persisted to disk/browser storage or
// shared with other customers, and raw transcripts never become an AI summary.
export const createChatSession = ({ requestReply, fallback = createChatFallbackReply, now = Date.now } = {}) => {
  let snapshot = { messages: [{ role: 'ai', text: CUSTOMER_SUPPORT_GREETING }], isSending: false, recommendationState: undefined, sessionVersion: 0 };
  let generation = 0;
  let active = null;
  let pending = null;
  let productId;
  let lastUsed = now();
  const listeners = new Set();
  const publish = (changes) => { snapshot = { ...snapshot, ...changes }; for (const listener of listeners) listener(); };
  const reset = () => {
    generation += 1;
    active?.abort(); active = null; pending = null; productId = undefined; lastUsed = now();
    publish({ messages: [{ role: 'ai', text: CUSTOMER_SUPPORT_GREETING }], isSending: false, recommendationState: undefined, sessionVersion: generation });
  };
  const send = (question, options = {}) => {
    if (pending) return pending;
    if (snapshot.isSending) return Promise.resolve('');
    const text = String(question || '').trim();
    if (!text) return Promise.resolve('');
    if (text.length > 2000) return Promise.resolve('Please keep your message under 2,000 characters.');
    if (now() - lastUsed > 30 * 60 * 1000) reset();
    lastUsed = now();
    const currentGeneration = generation;
    const history = normalizeChatHistory(snapshot.messages);
    const recommendationState = snapshot.recommendationState;
    if (options.productId != null) productId = options.productId;
    const controller = new AbortController();
    active = controller;
    publish({ messages: [...snapshot.messages, { role: 'user', text }].slice(-80), isSending: true });
    pending = (async () => {
      let response;
      try {
        const refusal = getChatSecurityRefusal(text, history);
        response = refusal ? { reply: refusal } : await requestReply(text, { history, recommendationState, productId, signal: controller.signal });
      } catch {
        response = { reply: fallback(text) };
      }
      if (generation !== currentGeneration || controller.signal.aborted) return '';
      const reply = guardCustomerAiReply(typeof response?.reply === 'string' && response.reply.trim() ? response.reply : fallback(text));
      publish({ messages: [...snapshot.messages, { role: 'ai', text: reply }].slice(-80),
        recommendationState: clientState(response?.recommendationState) || recommendationState, isSending: false });
      lastUsed = now();
      return reply;
    })().finally(() => { if (generation === currentGeneration) { active = null; pending = null; } });
    return pending;
  };
  return { getSnapshot: () => snapshot, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); }, send, reset };
};
