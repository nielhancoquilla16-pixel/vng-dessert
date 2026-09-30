const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CONTENT_LENGTH = 2000;

export const CUSTOMER_SUPPORT_FALLBACK = "Sorry, I don't have that information available right now. You can ask me about our products, prices, discounts, orders, location, contact information, delivery, payment, or account registration.";
export const CUSTOMER_SUPPORT_GREETING = "Hi! I'm your dessert assistant. I can help with products, prices, orders, discounts, delivery, payments, account registration, and questions about our shop.";

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
