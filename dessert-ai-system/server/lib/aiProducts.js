import { isExpired, normalizeExpiryAt } from './expiry.js';
import { publicAiText } from './aiSafety.js';

export const availableAiProducts = (products = [], now = new Date()) => (
  (Array.isArray(products) ? products : []).filter((product) => {
    if (!product || product.availability !== 'available' || !Number.isFinite(Number(product.stock)) || Number(product.stock) <= 0) return false;
    if (product.status && !['active', 'available'].includes(product.status)) return false;
    if (product.hidden || product.archived || product.removed || product.deleted || product.isExpired || product.expiryStatus === 'expired') return false;
    const expirationAt = normalizeExpiryAt({ expirationAt: product.expirationAt, expirationDate: product.expirationDate });
    if ((product.expirationAt || product.expirationDate) && !expirationAt) return false;
    return !isExpired(expirationAt, now) && Boolean(publicAiText(product.name));
  })
);

export const formatAiProductList = (products = []) => products.map((product) => {
  const name = publicAiText(product.name).replace(/[\r\n\x60*#\[\]<>]/g, ' ').replace(/\s+/g, ' ').trim();
  const amount = productUnitPrice(product);
  const price = amount != null
    ? `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'price unavailable';
  return `- ${name} = ${price}`;
}).join('\n');

// These describe customer tastes, never a fixed list of products. New catalog
// entries participate through their saved name, category and description.
const FLAVORS = {
  chocolate: /\b(choco(?:latey?|laty)?|tsokolate|cocoa|cacao)\b/i,
  ube: /\b(ube|purple yam)\b/i,
  fruity: /\b(fruit(?:y)?|mango|mangga|strawberr(?:y|ies)|berr(?:y|ies)|banana|pineapple|peach)\b/i,
  creamy: /\b(cream(?:y)?|custard|milk|milky|gatas)\b/i,
  caramel: /\b(caramel|karamel)\b/i,
  flan: /\b(flan|lecheflan)\b/i,
  coconut: /\b(coconut|buko|niyog)\b/i,
  coffee: /\b(coffee|kape|mocha)\b/i,
  cheese: /\b(cheese|cheesy|keso)\b/i,
  pandan: /\bpandan\b/i,
  vanilla: /\bvanilla\b/i,
  'red velvet': /\bred velvet\b/i,
};
const OCCASIONS = {
  breakfast: /\b(breakfast|morning|almusal|agahan|umaga)\b/i,
  snack: /\b(snacks?|m[ei]ryenda|afternoon|hapon)\b/i,
  evening: /\b(evening|dinner|after meals?|after dinner|gabi|hapunan|panghimagas)\b/i,
  birthday: /\b(birthday|kaarawan|celebration|party|occasion)\b/i,
  sharing: /\b(sharing|share|family|gathering|pamilya|salu.salo|bulk|maramihan)\b/i,
  gift: /\b(gifts?|regalo|pasalubong)\b/i,
};
const MORE = /^(?:can (?:you|u) |could you |please |paki)?(?:recommend |suggest |show (?:me )?|give me )?(?:some |a few )?(?:more(?: options?)?|something (?:else|different)|anything else|other (?:options|choices)|another(?: one| option)?|iba(?: pa)?|may iba(?: pa)?|meron pa|dagdag(?: pa)?|ano pa)[?!. ]*$/i;
const preferenceRequest = /\b(recommend(?:ation|ations)?|recomend|reccomend|suggest(?:ion|ions)?|crav(?:e|ing)|i (?:love|like|prefer|want)|looking for|in the mood|help me (?:choose|pick)|what should i (?:try|buy|get)|best seller|bestseller|what is good for|what.*(?:breakfast|meryenda|merienda)|gusto|mahilig|masarap|mairerekomenda|irekomenda|suggest mo|hanap|pang almusal|pang meryenda|budget.friendly|budget ko|under\s*(?:PHP|₱)?\s*\d)\b/i;
const normalize = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const catalogText = (product) => normalize(`${publicAiText(product.name)} ${publicAiText(product.category)} ${publicAiText(product.description)}`);
const safeId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100 && !/[\u0000-\u001f<>`]/.test(value);

export const normalizeRecommendationState = (value = {}) => {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const p = input.preferences || {};
  const strings = (items, allowed) => Array.isArray(items) ? [...new Set(items.filter((item) => typeof item === 'string' && allowed(item)))].slice(0, 12) : [];
  return {
    recommendedProductIds: Array.isArray(input.recommendedProductIds) ? [...new Set(input.recommendedProductIds.filter(safeId))].slice(-500) : [],
    preferences: {
      flavors: strings(p.flavors, (item) => Object.hasOwn(FLAVORS, item)),
      excludedFlavors: strings(p.excludedFlavors, (item) => Object.hasOwn(FLAVORS, item)),
      terms: strings(p.terms, (item) => /^[a-z]{3,30}$/.test(item)),
      occasion: Object.hasOwn(OCCASIONS, p.occasion) ? p.occasion : '',
      maxPrice: Number.isFinite(p.maxPrice) && p.maxPrice >= 0 && p.maxPrice <= 99999999 ? p.maxPrice : null,
      minPrice: Number.isFinite(p.minPrice) && p.minPrice >= 0 && p.minPrice <= 99999999 ? p.minPrice : null,
      maxExclusive: p.maxExclusive === true,
      budgetTotal: p.budgetTotal === true,
      quantity: Number.isSafeInteger(p.quantity) && p.quantity > 0 && p.quantity <= 100000 ? p.quantity : 1,
      cheapest: p.cheapest === true,
      language: p.language === 'tl' ? 'tl' : 'en',
      dietary: strings(p.dietary, (item) => ['vegan', 'gluten-free', 'nut-free', 'dairy-free', 'sugar-free', 'allergy'].includes(item)),
    },
  };
};

export const isRecommendationRequest = (message, { history = [], state } = {}) => {
  const text = normalize(message);
  if (preferenceRequest.test(text) || /\b(?:something|desserts?|treats?) (?:for|with|that|to share)\b/.test(text)
    || /\b(?:only have|can spend|can afford|budget(?: is| of| ko)?)\s*(?:php\s*|₱\s*)?\d/.test(text)) return true;
  const context = state?.recommendedProductIds?.length || history.some((entry) => entry.role === 'user' && preferenceRequest.test(normalize(entry.content)));
  return Boolean(context && (MORE.test(text) || /^(?:and |what about |how about )/.test(text)
    || Object.values(FLAVORS).some((pattern) => pattern.test(text)) || /\b(?:budget|under|below|cheaper|less than|up to)\b/.test(text)));
};

const updatePreferences = (preferences, message) => {
  const text = normalize(message);
  const next = { ...preferences };
  if (/\b(tagalog|taglish|gusto|mahilig|ano|anong|oras|petsa|ngayon|meron|ako|akin|ko|po|ba|pang|almusal|meryenda|merienda|salamat|iba|dagdag|magkano|sarap|masarap|umaga)\b/.test(text)) next.language = 'tl';
  if (/\b(?:in english|speak english|answer in english)\b/.test(text)) next.language = 'en';
  const dietary = [['vegan', /\bvegan\b/], ['gluten-free', /\bgluten[ -]free\b/], ['nut-free', /\b(?:nut[ -]free|no nuts|without nuts)\b/], ['dairy-free', /\b(?:dairy[ -]free|no dairy|without dairy)\b/], ['sugar-free', /\b(?:sugar[ -]free|no sugar|without sugar)\b/], ['allergy', /\b(?:allerg(?:y|ies|ic)|allergen)\b/]];
  for (const [name, pattern] of dietary) if (pattern.test(text)) next.dietary = [...new Set([...next.dietary, name])];
  if (/\b(?:no dietary restrictions|remove dietary restrictions|no allergies)\b/.test(text)) next.dietary = [];
  const flavors = [];
  const excluded = [];
  for (const [name, pattern] of Object.entries(FLAVORS)) {
    const match = pattern.exec(text);
    if (!match) continue;
    const before = text.slice(Math.max(0, match.index - 32), match.index);
    if (/\b(?:no|not|without|avoid|dont like|don't like|dislike|hate|dont recommend|don't recommend|not in the mood for|ayaw(?: ko)?|walang|hindi(?: ko gusto)?)\s+(?:any |something |anything |with |ng |sa )?$/.test(before)) excluded.push(name);
    else flavors.push(name);
  }
  if (flavors.length) {
    next.flavors = flavors;
    next.terms = [];
    next.excludedFlavors = next.excludedFlavors.filter((name) => !flavors.includes(name));
  }
  if (excluded.length) {
    next.excludedFlavors = [...new Set([...next.excludedFlavors, ...excluded])];
    next.flavors = next.flavors.filter((name) => !excluded.includes(name));
  }
  if (/\b(?:any flavor|any flavour|no preference|anything is fine|kahit ano)\b/.test(text)) { next.flavors = []; next.terms = []; }
  for (const [occasion, pattern] of Object.entries(OCCASIONS)) if (pattern.test(text)) next.occasion = occasion;
  const upper = text.match(/\b(under|below|less than|up to|at most|within|budget(?: is| of| ko)?|only have|can spend|can afford|maximum|max|hanggang)\s*(?:of |is |ay |lang |[:=] )?(?:php\s*|₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/);
  const lower = text.match(/\b(?:at least|over|above|minimum|min)\s*(?:php\s*|₱\s*)?(\d[\d,]*(?:\.\d{1,2})?)/);
  if (upper) { next.maxPrice = Number(upper[2].replace(/,/g, '')); next.maxExclusive = /under|below|less than/.test(upper[1]); }
  if (lower) next.minPrice = Number(lower[1].replace(/,/g, ''));
  const range = text.match(/\b(?:between|from)\s*(?:php\s*|₱\s*)?(\d+)\s*(?:and|to|-)\s*(?:php\s*|₱\s*)?(\d+)/);
  if (range) { next.minPrice = Number(range[1]); next.maxPrice = Number(range[2]); next.maxExclusive = false; }
  if (/\b(?:any price|no budget limit|ignore (?:the )?budget|remove (?:the )?budget)\b/.test(text)) { next.maxPrice = null; next.minPrice = null; }
  next.cheapest = /\b(cheap(?:er|est)?|affordable|budget.friendly|mura|pinakamura|tipid)\b/.test(text) || next.cheapest;
  const quantity = text.match(/\b(\d+)\s*(?:packs?|pieces?|pcs|tubs?|items?|boxes?|units?)\b/);
  if (quantity) next.quantity = Number(quantity[1]);
  if (upper || range) next.budgetTotal = /\b(?:total|altogether|overall|buong budget)\b/.test(text)
    || (next.quantity > 1 && !/\b(?:each|per (?:item|pack|piece|unit)|unit price)\b/.test(text));
  // Capture unfamiliar catalog terms as well as known tastes (e.g. pistachio).
  const preference = text.match(/\b(?:i (?:love|like|prefer|want)|looking for|gusto ko(?: ng)?|mahilig ako sa|something with)\s+([^?!.]{1,100})/);
  if (preference && !flavors.length) {
    const stop = new Set(['something', 'anything', 'dessert', 'desserts', 'sweet', 'treat', 'treats', 'for', 'with', 'and', 'some', 'please', 'breakfast', 'morning', 'snack', 'meryenda', 'merienda', 'under', 'below', 'budget', 'php']);
    next.terms = [...new Set((preference[1].match(/[a-z]{3,30}/g) || []).filter((word) => !stop.has(word))
      .map((word) => word.endsWith('ies') ? word.slice(0, -3) + 'y' : word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))].slice(0, 8);
  }
  return next;
};

export const buildRecommendationState = (message, { history = [], state = {}, products = [] } = {}) => {
  const normalized = normalizeRecommendationState(state);
  let preferences = normalized.preferences;
  const ids = new Set(normalized.recommendedProductIds);
  let wasRecommendation = false;
  for (const entry of history) {
    if (entry.role === 'user') {
      preferences = updatePreferences(preferences, entry.content);
      wasRecommendation = isRecommendationRequest(entry.content, { state: normalized }) || (wasRecommendation && MORE.test(normalize(entry.content)));
    }
    if (entry.role === 'assistant' && wasRecommendation) for (const product of products) {
      // Compatibility for callers sending only history: only marked list entries
      // count as suggestions, rather than every general mention of a dessert.
      const name = product.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(?:^|\\n)\\s*(?:[-*•]|\\d+[.)])\\s*(?:\\*\\*)?' + name + '(?:\\*\\*)?\\s*(?:=|—|–|-|:)', 'i').test(entry.content)) ids.add(String(product.id));
    }
  }
  preferences = updatePreferences(preferences, message);
  return { preferences: normalizeRecommendationState({ preferences }).preferences, recommendedProductIds: [...ids].slice(-500) };
};

export const productUnitPrice = (product, quantity = 1) => {
  if (product.priceConfirmed === false || !Number.isFinite(product.price) || product.price < 0) return null;
  const tiers = product.discountEnabled === true && Array.isArray(product.discountTiers) ? product.discountTiers : [];
  const applicable = tiers.filter((tier) => Number.isSafeInteger(tier.minQuantity) && tier.minQuantity >= 2
    && quantity >= tier.minQuantity && Number.isFinite(tier.price) && tier.price >= 0 && tier.price <= product.price)
    .sort((a, b) => a.minQuantity - b.minQuantity).at(-1);
  return applicable?.price ?? product.price;
};

export const selectRecommendations = (products, state, { productId, now = new Date(), limit = 2 } = {}) => {
  const { preferences: p, recommendedProductIds } = normalizeRecommendationState(state);
  const seen = new Set(recommendedProductIds);
  if (p.dietary.length) return { products: [], exhausted: false, matches: 0, needsIngredientConfirmation: true };
  const ranked = availableAiProducts(products, now).filter((product) => {
    const text = catalogText(product);
    const price = productUnitPrice(product, p.quantity);
    const budgetPrice = price == null ? null : price * (p.budgetTotal ? p.quantity : 1);
    return Number(product.stock) >= p.quantity
      && !p.excludedFlavors.some((name) => FLAVORS[name].test(text))
      && (!p.flavors.length || p.flavors.some((name) => FLAVORS[name].test(text)))
      && (!p.terms.length || p.terms.some((term) => text.includes(term)))
      && (p.maxPrice == null || (budgetPrice != null && (p.maxExclusive ? budgetPrice < p.maxPrice : budgetPrice <= p.maxPrice)))
      && (p.minPrice == null || (budgetPrice != null && budgetPrice >= p.minPrice));
  }).map((product) => {
    const text = catalogText(product);
    let score = p.flavors.filter((name) => FLAVORS[name].test(text)).length * 10
      + p.terms.filter((term) => text.includes(term)).length * 8;
    if (String(product.id) === String(productId)) score += 2;
    if (p.occasion && OCCASIONS[p.occasion].test(text)) score += 5;
    if (['birthday', 'sharing', 'gift'].includes(p.occasion) && /\b(?:box|pack|pieces|pcs|sharing|cake|gift)\b/.test(text)) score += 3;
    if (publicAiText(product.description)) score += 1;
    return { product, score };
  }).sort((a, b) => (p.cheapest ? (productUnitPrice(a.product, p.quantity) ?? Infinity) - (productUnitPrice(b.product, p.quantity) ?? Infinity) : 0)
    || b.score - a.score || String(a.product.id).localeCompare(String(b.product.id)));
  const unseen = ranked.filter(({ product }) => !seen.has(String(product.id)));
  return { products: unseen.slice(0, limit).map(({ product }) => product), exhausted: ranked.length > 0 && unseen.length === 0, matches: ranked.length };
};

export const formatRecommendations = (selection, state) => {
  const { preferences: p, recommendedProductIds } = normalizeRecommendationState(state);
  const tl = p.language === 'tl';
  if (selection.needsIngredientConfirmation) return tl
    ? 'Pakikumpirma muna sa shop ang kumpletong ingredients at allergens bago umorder. Wala pang verified na ingredient list para matiyak na pasok sa dietary requirement mo.'
    : 'Please confirm the complete ingredients and allergens with the shop before ordering. The menu does not provide a verified ingredient list to confirm your dietary requirement.';
  if (selection.exhausted) return tl
    ? 'Naibahagi ko na ang mga available na bagay sa gusto mo. Gusto mo bang sumubok ng ibang flavor o dessert category?'
    : "I've already shared our available options that match your preferences. Would you like to explore another flavor or dessert category?";
  if (!selection.products.length) return tl
    ? 'Wala akong makumpirmang available na pasok sa gusto mo at budget ngayon. Gusto mo bang baguhin ang flavor o budget?'
    : "I couldn't find an available option matching your preferences and budget right now. Would you like to adjust the flavor or budget?";
  const occasions = { breakfast: ['a sweet morning treat', 'matamis na pang-almusal'], snack: ['meryenda', 'meryenda'], evening: ['dessert after your meal', 'panghimagas'], birthday: ['your celebration', 'celebration mo'], sharing: ['sharing', 'pagbabahagi'], gift: ['a sweet gift', 'regalo'] };
  const occasion = occasions[p.occasion]?.[tl ? 1 : 0];
  const intro = tl
    ? recommendedProductIds.length ? 'May iba pa akong mairerekomenda na pasok sa gusto mo:' : `Sige! Narito ang ilang available na puwede mong pagpilian${occasion ? ` para sa ${occasion}` : ''}:`
    : recommendedProductIds.length ? `Here are a few different options${occasion ? ` for ${occasion}` : ' that match what you have in mind'}:` : `Of course! Here are a few available desserts to consider${occasion ? ` for ${occasion}` : ''}:`;
  const items = selection.products.map((product, index) => {
    const name = publicAiText(product.name).replace(/[\r\n*#`\[\]<>]/g, ' ').trim();
    const price = productUnitPrice(product, p.quantity);
    const priceText = price == null ? (tl ? 'i-confirm ang presyo sa checkout' : 'confirm the current price at checkout') : `PHP ${price.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${p.quantity > 1 ? ` each for ${p.quantity} items (PHP ${(price * p.quantity).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total)` : ''}`;
    const description = publicAiText(product.description).replace(/[\r\n*#`\[\]<>]/g, ' ').slice(0, 300).trim();
    const why = description
      ? tl ? `Ayon sa menu: ${description}` : `${index === 0 ? 'You might enjoy this' : 'Another option to consider'} — the menu describes it as: ${description}`
      : tl ? 'Available ito ngayon. Wala pang detalyadong flavor description sa menu.' : 'This is available now; the menu does not yet include a detailed tasting description.';
    return `- **${name}** — ${priceText}\n  ${why}`;
  });
  return `${intro}\n\n${items.join('\n\n')}`;
};
