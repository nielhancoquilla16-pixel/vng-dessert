import { hasValidShopHours, isWithinOperatingHours } from './operatingHours.js';
import { formatExpiryForCustomer, isExpired } from './expiry.js';
import { PUBLIC_BUSINESS_INFO } from './publicBusinessInfo.js';

export const SUPPORT_FALLBACK = "Sorry, I don't have that information available right now. You can ask me about our products, prices, discounts, orders, location, contact information, delivery, payment, or account registration.";
export const SUPPORT_INTENTS = ['owner', 'supplier', 'business_name', 'about_business', 'location', 'hours', 'contact', 'email', 'social_media', 'physical_store', 'services', 'discounts', 'promotions', 'signup', 'login', 'password_reset', 'guest_order', 'ordering', 'delivery', 'payment', 'order_status', 'products', 'pricing', 'availability', 'ingredients', 'nutrition', 'expiry', 'product_opinion', 'recommendation', 'greeting', 'thanks', 'help', 'unknown'];
const PRODUCT_INTENTS = new Set(['pricing', 'availability', 'ingredients', 'nutrition', 'expiry', 'products', 'product_opinion', 'recommendation']);
const clean = (value) => typeof value === 'string' ? value.trim() : '';
const resolveBusinessEmail = (value) => (
  clean(value).match(/[\w.+-]+@[\w.-]+\.[A-Z]{2,}/i)?.[0] || PUBLIC_BUSINESS_INFO.email
);
const normalize = (value) => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’']/g, '').replace(/[-_]/g, ' ')
  .replace(/\b(u|ur|pls|plz|wheres|whats|discout|discunt|promos|ingrediants|ingridients|locaton|loction|singup|sing up|recomend|reccomend)\b/g, (word) => ({ u: 'you', ur: 'your', pls: 'please', plz: 'please', wheres: 'where is', whats: 'what is', discout: 'discount', discunt: 'discount', promos: 'promotions', ingrediants: 'ingredients', ingridients: 'ingredients', locaton: 'location', loction: 'location', singup: 'signup', 'sing up': 'sign up', recomend: 'recommend', reccomend: 'recommend' }[word]))
  .replace(/\s+/g, ' ').trim();

export const normalizeHistory = (history) => (Array.isArray(history) ? history : [])
  .filter((entry) => entry && ['user', 'assistant'].includes(entry.role) && typeof entry.content === 'string' && entry.content.trim())
  .slice(-10).map((entry) => ({ role: entry.role, content: entry.content.trim().slice(0, 1500) }));

const visibleProducts = (products = []) => products.filter((product) => product.availability !== 'hidden');
const matchesProduct = (message, products) => {
  const text = normalize(message);
  const exact = products.filter((product) => {
    const name = normalize(product.name);
    return name && (` ${text.replace(/[^a-z0-9 ]/g, ' ')} `).includes(` ${name.replace(/[^a-z0-9 ]/g, ' ')} `);
  });
  if (exact.length) return exact;
  // A unique shortened name (e.g. "flan" for "Classic Leche Flan") is useful,
  // but never choose arbitrarily between variants that share that name.
  const words = new Set(text.match(/[a-z0-9]+/g) || []);
  return products.filter((product) => normalize(product.name).split(/[^a-z0-9]+/)
    .some((word) => word.length > 3 && !['classic', 'original', 'special', 'sweet', 'dessert', 'with'].includes(word) && words.has(word)));
};

export const detectSupportIntent = (message, { history = [], products = [], productId } = {}) => {
  const text = normalize(message);
  const intents = [];
  const add = (intent, matches) => { if (matches && !intents.includes(intent)) intents.push(intent); };
  const catalog = visibleProducts(products);
  const matches = matchesProduct(text, catalog);
  const account = /\b(account|sign\s*up|signup|register|registration|login|log\s*in|sign\s*in|password|passwrod)\b/.test(text);
  const discount = /\b(discount|discounts|bulk|wholesale|large orders?|buy \d+ or more|percent off|cheaper|price break|save money)\b/.test(text);
  const reset = /\b(reset|forgot|forgotten|recover|lost|change|cannot remember|cant remember)\b.*\b(password|passwrod|account)\b|\b(password|passwrod)\b.*\b(reset|forgot|recover|change)\b/.test(text);
  add('password_reset', reset);
  add('guest_order', /\b(guest|without (?:an? )?account|without (?:signing|logging)|need (?:an? )?account|have to (?:register|sign up))\b/.test(text));
  add('signup', !reset && /\b(sign\s*up|signup|register|registration|join)\b|\b(create|make|open|set up|get|start)\b.*\baccount\b/.test(text));
  add('login', !reset && /\b(log\s*in|login|sign\s*in|signin)\b/.test(text) && !intents.includes('guest_order'));
  add('owner', /\b(owner|owners|owns|founder|founders|proprietor|runs (?:the |this |your )?(?:shop|business|store)|who (?:started|founded))\b/.test(text));
  add('supplier', /\b(supplier|suppliers|source your ingredients|supply your ingredients)\b/.test(text));
  add('business_name', /\b(?:business|shop|store) name\b|\bwhat is (?:the |your )?(?:name of (?:the |your )?)?(?:business|shop|store)\b/.test(text));
  add('about_business', /\b(?:about (?:you|your (?:business|shop|store))|tell me about (?:the |your )?(?:business|shop|store)|what kind of business|your story|your mission)\b/.test(text));
  add('discounts', discount);
  // "What promotions do you have?" and "Any special offers?" are promotion
  // questions; "What services do you offer?" has a different subject.
  add('promotions', /\b(promo|promotions?|coupons?|vouchers?|deals?|special offers?|current offers?)\b/.test(text));
  add('physical_store', /\b(physical (?:store|shop)|walk in|walkin|storefront|visit (?:you|the shop|your shop)|brick and mortar)\b/.test(text));
  add('location', /\b(locat(?:ed|ion)|address|where (?:are |is )?(?:you|your (?:store|shop|business)|the (?:store|shop))|where can i find you|saan|san kayo)\b/.test(text) && !account && !/\b(delivery address|my address|shipping address)\b/.test(text));
  add('hours', /\b(?:business|shop|store|operating|opening|closing) (?:hours?|time)\b|\byour hours\b/.test(text) || (!account && /\b(hours?|open(?:ing)?|clos(?:e[ds]?|ing)|operating time|business time|shop time|until when)\b/.test(text)));
  add('email', !account && /\b(?:gmail|e ?mail|mail address|email me|email address)\b/.test(text));
  add('contact', !account && !intents.includes('email') && /\b(contact|phone|telephone|mobile number|call|reach you|talk to (?:someone|a person))\b/.test(text));
  add('social_media', /\b(?:social media|facebook|instagram|facebook page|instagram page|social account|follow (?:you|the shop))\b/.test(text));
  add('services', !intents.includes('about_business') && /\bservices?\b|\bwhat (?:do you|does (?:the |your )?shop) (?:do|offer)\b|\b(?:about|tell me about) (?:your |the )?(?:business|shop|store)\b/.test(text));
  add('order_status', /\b(my order|order status|track(?:ing)? (?:my |the )?order|where.*order|cancel.*order|refund|return.*order)\b/.test(text));
  add('delivery', /\b(deliver(?:y)?|shipping|ship|pick\s*up|collection|courier)\b/.test(text));
  add('payment', /\b(pay(?:ment|ments)?|gcash|cash|cod|credit card|debit card|e wallet)\b/.test(text));
  add('ordering', !account && !intents.includes('order_status') && /\b(how (?:do|can|to).*(?:order|buy|purchase)|place (?:an? )?order|ordering process|pre\s*order|preorder)\b/.test(text) && !/\bhow (?:many|much)\b/.test(text));
  add('ingredients', !intents.includes('supplier') && /\b(ingredients?|made (?:of|with)|contain(?:s)?|allerg(?:y|ies|ens)|dairy|nuts?|gluten|vegan|sugar free)\b/.test(text));
  const selectedProductInContext = catalog.some((item) => String(item.id) === String(productId));
  const asksForCalories = /\b(calories?|kcal|nutrition(?:al)?(?: facts?| information| info)?)\b/.test(text);
  const nutritionReferencesDessert = matches.length > 0
    || /\b(?:this|that|it|these|those|the product|the dessert|this product|this dessert)\b/.test(text)
    || (selectedProductInContext && (text.split(/\s+/).length <= 5 || /\b(?:in|for)\b|\bper\s+(?:serving|piece|slice|bar|portion)\b/.test(text)));
  add('nutrition', asksForCalories && nutritionReferencesDessert);
  add('expiry', /\b(expir(?:y|e|es|ation)|best before|fresh until|shelf life|last in the fridge)\b/.test(text));
  const asksForPrice = /\b(price|prices|pricing|cost|magkano)\b/.test(text)
    || (!asksForCalories && /\bhow much\b/.test(text));
  add('pricing', !discount && !intents.some((intent) => ['delivery', 'payment', 'promotions'].includes(intent)) && asksForPrice);
  add('availability', !discount && !intents.some((intent) => ['hours', 'supplier', 'owner', 'signup', 'contact', 'promotions', 'payment', 'delivery'].includes(intent)) && /\b(stock|availability|available|sold out|how many.*(?:order|buy|get)|in stock|left|remaining)\b/.test(text) && !/\b(promo|promotions?|discounts?|services?)\b/.test(text));
  const productOpinion = /\b(?:is|are) (?:this|that|it|these|those) (?:any )?(?:good|great|tasty|delicious|nice|worth it|popular)\b|\b(?:would|do) you recommend (?:this|that|it|these|those)\b/.test(text);
  add('product_opinion', productOpinion);
  add('recommendation', !productOpinion && /\b(?:recommend(?:ation|ations)?|suggest(?:ion|ions)?|best seller|bestseller|popular|favorite|favourite|what should i (?:try|buy|get)|what can you recommend|which (?:dessert|product) should i (?:try|buy|get|choose)|what do you think i should (?:try|buy|get)|craving)\b/.test(text));
  add('products', /\b(?:what (?:products|desserts) do you sell|show (?:me )?(?:the |your )?menu|list (?:your |the )?(?:products|desserts))\b/.test(text) || (/\b(menu|products?|desserts?)\b/.test(text) && /\b(sell|list|what|which|show|have|tell)\b/.test(text) && !intents.length));

  let targetId = matches.length === 1 ? matches[0].id : undefined;
  if (!targetId && intents.includes('recommendation') && catalog.some((item) => String(item.id) === String(productId))) {
    targetId = catalog.find((item) => String(item.id) === String(productId)).id;
  }
  const followup = /^(?:and |also |what about|how about|then |it\b|that\b|this\b)/.test(text) || /\b(it|that|this|those|them|its)\b/.test(text);
  const prior = normalizeHistory(history).filter((entry) => entry.role === 'user').slice(-5);
  const previous = prior.length ? detectSupportIntent(prior.at(-1).content, { products: catalog, productId }) : null;
  if (!intents.length && followup && previous) {
    const contextIntents = previous.intents.filter((intent) => ['discounts', 'promotions', ...PRODUCT_INTENTS].includes(intent));
    if (contextIntents.length && (matches.length || /\b(it|that|this|those|them|\d+|five|ten|more|less)\b/.test(text))) intents.push(...contextIntents);
  }
  if (!intents.length && matches.length) intents.push('products');
  if (intents.some((intent) => PRODUCT_INTENTS.has(intent)) && !targetId && matches.length === 0) {
    // Only inherit a product for an actual product question or an elliptical
    // follow-up; a change to a business/account topic cannot select a product.
    const genericProductQuestion = followup || intents.includes('recommendation') || intents.includes('nutrition') || /^(?:what(?:s| is| are)? (?:the |its )?(?:price|ingredients|expiry|availability)|how many calories?(?: in| for| per)?|(?:calories?|kcal|nutrition(?:al)?(?: facts?| info(?:rmation)?)?)(?: in| for| per)?[?.! ]*$|how much(?: is it)?[?.! ]*$|is (?:it|this) available|(?:price|ingredients|expiry|stock)[?.! ]*$)/.test(text);
    if (genericProductQuestion) {
      for (const entry of [...prior].reverse()) {
        const candidates = matchesProduct(entry.content, catalog);
        if (candidates.length === 1) { targetId = candidates[0].id; break; }
        // Explicit topic changes stop stale product context from leaking back.
        const previousTopic = detectSupportIntent(entry.content, { products: catalog });
        if (previousTopic.intents.some((intent) => !PRODUCT_INTENTS.has(intent) && !['unknown', 'greeting', 'thanks'].includes(intent))) break;
      }
      if (!targetId && catalog.some((product) => String(product.id) === String(productId))) targetId = productId;
    }
  }
  if (!intents.length) {
    add('greeting', /^(?:hi|hello|hey|good morning|good afternoon|good evening)[!. ]*$/.test(text));
    add('thanks', /^(?:thanks|thank you|ty|salamat)[!. ]*$/.test(text));
    add('help', /^(?:help|help me|what can you do|can you help|who are you)[?!. ]*$/.test(text));
  }
  return { intents: intents.length ? intents : ['unknown'], ...(targetId ? { productId: targetId } : {}) };
};

export const validateSemanticIntent = (value, products = []) => {
  if (!value || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1 || !Array.isArray(value.intents)) return null;
  const intents = [...new Set(value.intents)];
  if (!intents.length || intents.length > 4 || intents.some((intent) => !SUPPORT_INTENTS.includes(intent))) return null;
  if (value.confidence < 0.8) return { intents: ['unknown'] };
  const product = visibleProducts(products).find((entry) => String(entry.id) === String(value.productId));
  return { intents, ...(product ? { productId: product.id } : {}) };
};

const money = (value) => `PHP ${Number(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const productLabel = (product) => `${product.name} (${Number.isFinite(product.price) ? money(product.price) : 'price unavailable'})`;

export const buildSupportReply = (plan, knowledge = {}, { now = new Date() } = {}) => {
  const shop = knowledge.shop;
  const support = shop?.customerSupport || {};
  const products = visibleProducts(knowledge.products || []);
  const product = products.find((item) => String(item.id) === String(plan.productId));
  const available = (item) => item.stock > 0 && !['expired', 'out of stock', 'unavailable'].includes(item.availability) && !isExpired(item.expirationAt, now);
  const missing = (topic) => `Sorry, ${topic} information is currently unavailable. Please contact the shop for confirmation.`;
  const needProduct = () => knowledge.productsLoaded === false ? missing('product') : 'Which dessert do you mean? Please tell me its name so I can check.';
  const replyFor = (intent) => {
    switch (intent) {
      case 'owner': return clean(support.owner) || missing('owner');
      case 'supplier': return clean(support.supplier) || missing('supplier');
      case 'business_name': return clean(shop?.shopName) || missing('business name');
      case 'about_business': return PUBLIC_BUSINESS_INFO.about;
      case 'location': return clean(shop?.address) ? `We are located at ${shop.address}.` : missing('location');
      case 'hours': return hasValidShopHours(shop) ? `Our daily operating hours are ${shop.openingTime} to ${shop.closingTime} PHT (Philippine time). The shop is currently ${isWithinOperatingHours(shop, now) ? 'open' : 'closed'}.` : missing('business hours');
      case 'email': return `Yes! You can email us at ${resolveBusinessEmail(support.email)}.`;
      case 'social_media': return `Follow the shop on ${Object.entries(PUBLIC_BUSINESS_INFO.socialLinks).map(([name, url]) => `${name}: ${url}`).join(' or ')}.`;
      case 'contact': {
        const methods = [clean(shop?.phoneNumber), resolveBusinessEmail(support.email)].filter(Boolean);
        return methods.length ? `You can contact the shop at ${methods.join(' or ')}.` : missing('contact');
      }
      case 'physical_store': return clean(support.physicalStore) || missing('physical store');
      case 'services': return clean(support.services) || 'You can browse desserts, place orders for pickup or delivery, and schedule pre-orders through the shop. Sign in to place an order; ordering is available during the saved shop hours.';
      case 'discounts': return clean(support.discounts) || 'Sorry, discount information is currently unavailable. I cannot confirm a discount for 5 or more items or bulk orders. Please contact the shop before ordering.';
      case 'promotions': return clean(support.promotions) || missing('current promotion');
      case 'signup': return 'To sign up: 1. Open /login and select Signup. 2. Enter a username, email, password, and password confirmation. Follow the password requirements shown. 3. Answer the CAPTCHA, read the Terms and Conditions to the end, and accept them. 4. Select Signup and open the verification link emailed to you. Then return to Login. If needed, check spam/junk or use Resend Verification Email.';
      case 'login': return 'To log in: 1. Open /login and select Login. 2. Enter your email or username and password. 3. Select Login. Verify your email first if prompted. You can use Remember me or Forgot password? on that screen.';
      case 'password_reset': return 'To reset your password: 1. Open /login and select Forgot password? 2. Enter your email or username and request the reset email. 3. Follow the emailed reset link (or enter the emailed verification code if the screen asks for a code). 4. Enter and confirm your new password, then log in. Check spam/junk if the email is missing. Never share your password or verification code in chat.';
      case 'guest_order': return 'A customer account is required to place an online order. You can browse products first, then sign up or log in at /login to use the cart and checkout.';
      case 'ordering': return 'To order: 1. Sign up or log in at /login. 2. Choose available products and quantities, then add them to your cart. 3. Open the cart and proceed to checkout. 4. Select pickup or delivery, enter the required details, and choose an available payment method. 5. Review the total and submit. Orders and pre-orders can be submitted during shop hours; pre-orders are scheduled for a future day.';
      case 'order_status': return 'To check your order, sign in and open My Orders. Open the order for its status and available actions. I cannot access your personal order details in this chat; contact the shop if you need help with that order.';
      case 'delivery': return `You can choose pickup or delivery at checkout. ${Number.isFinite(knowledge.deliveryFee) ? `The current delivery fee is ${money(knowledge.deliveryFee)}. ` : ''}For delivery, provide the recipient, contact number, address, and exact map pin; checkout confirms delivery eligibility and the total before you submit.`;
      case 'payment': return `Cash is supported for pickup and cash on delivery. ${knowledge.onlinePaymentConfigured === true ? `Online payment options currently include ${(knowledge.paymentMethods || []).join(', ') || 'the methods shown at checkout'}.` : knowledge.onlinePaymentConfigured === false ? 'Online payment is not currently configured; check the available methods at checkout.' : 'Please check checkout for the currently available online payment methods.'}`;
      case 'products': {
        if (product) return `${product.name}${clean(product.description) ? `: ${product.description}` : Number.isFinite(product.price) ? ` costs ${money(product.price)}.` : ': price information is currently unavailable.'}`;
        if (knowledge.productsLoaded === false) return missing('product');
        const menu = products.filter(available).slice(0, 8);
        return menu.length ? `Available desserts include ${menu.map(productLabel).join(', ')}. See Products for the full menu and current stock.` : 'There are no available desserts in the current menu right now. Please check again later.';
      }
      case 'pricing': return product ? (Number.isFinite(product.price) ? `${product.name} costs ${money(product.price)} per item.` : missing(`price for ${product.name}`)) : needProduct();
      case 'availability': return product ? (available(product) ? `${product.name} currently has ${product.stock} available. You can order up to the available stock; checkout checks stock and shop hours again.` : `${product.name} is currently unavailable to order.`) : needProduct();
      case 'nutrition': {
        if (!product) return 'Which dessert would you like calorie information for?';
        return 'I can\'t estimate calories for **' + product.name + '** right now. Please try again shortly.';
      }
      case 'product_opinion': {
        if (!product) return needProduct();
        if (!available(product)) return `${product.name} is currently unavailable to order. I can still share its menu description if you like.`;
        const details = clean(product.description);
        if (!details) return `${product.name} is on our menu${Number.isFinite(product.price) ? ` for ${money(product.price)}` : ''}. I don't have a detailed tasting description, but tell me what flavors you like and I can help you choose.`;
        return `Our menu describes ${product.name} this way: ${details} If that sounds like the kind of dessert you enjoy, it could be a good choice${Number.isFinite(product.price) ? ` at ${money(product.price)}` : ''}.`;
      }
      // Production recipes are staff-only and may be estimates. They are not
      // evidence for public ingredient lists or allergy safety guarantees.
      case 'ingredients': {
        if (!product) return needProduct();
        const description = clean(product.description);
        const publishedDetails = /\b(ingredients?|made with|contains?)\b/i.test(description)
          ? `The published description for ${product.name} says: ${description}\n\n` : '';
        return `${publishedDetails}Sorry, a complete verified ingredient and allergen list for ${product.name} is currently unavailable. Please contact the shop before ordering if you have an allergy or dietary requirement.`;
      }
      case 'expiry': return product ? (product.expirationAt ? `${product.name} ${isExpired(product.expirationAt, now) ? 'expired' : 'expires'} on ${formatExpiryForCustomer(product.expirationAt)} PHT.${isExpired(product.expirationAt, now) ? ' It is not available to order.' : ''}` : missing(`expiry for ${product.name}`)) : needProduct();
      case 'recommendation': {
        if (knowledge.productsLoaded === false) return missing('product');
        const choices = products.filter(available);
        if (!choices.length) return 'There are no available desserts to recommend right now.';
        const viewedProduct = product && available(product) ? product : null;
        const alternatives = choices.filter((item) => !viewedProduct || String(item.id) !== String(viewedProduct.id))
          .slice(0, viewedProduct ? 2 : 3);
        const describe = (item) => `- **${item.name}** — ${Number.isFinite(item.price) ? money(item.price) : 'price unavailable'}${clean(item.description) ? `\n  ${clean(item.description)}` : ''}`;
        if (viewedProduct) {
          const options = [viewedProduct, ...alternatives].map(describe).join('\n\n');
          return `Since you're viewing **${viewedProduct.name}**, here are a few good options:\n\n${options}\n\nTell me if you prefer chocolate, creamy, or fruity desserts and I can narrow it down.`;
        }
        return `Here are some available desserts to try:\n\n${choices.slice(0, 3).map(describe).join('\n\n')}\n\nTell me if you prefer chocolate, creamy, or fruity desserts and I can narrow it down.`;
      }
      case 'greeting': return "Hi! I'm your V&G assistant. Ask me about products, prices, discounts, orders, location, hours, or account registration.";
      case 'thanks': return "You're welcome! I'm here if you need more help with the shop.";
      case 'help': return 'I can help with products, prices, stock, discounts, business information, signup, ordering, delivery, and payment. What would you like to know?';
      default: return SUPPORT_FALLBACK;
    }
  };
  return [...new Set((plan.intents || ['unknown']).slice(0, 4).map(replyFor))].join('\n\n');
};
