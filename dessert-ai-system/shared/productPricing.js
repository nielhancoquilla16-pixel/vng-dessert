export const BULK_MIN_QUANTITY = 5;

// These are per-product offers. Different products do not combine for eligibility.
const BULK_OFFERS = [
  { id: '60c8c82a-0afd-49ab-8f89-25c4e13928d9', names: ['Lecheflan', 'Leche Flan', 'Lecheflan (330-340g)'], regularPrice: 90, price: 77 },
  { id: '5343b858-ed76-4283-8606-13d3bdd46504', names: ['Lecheflan Oval', 'Letcheflan Oval', 'Leche Flan Oval', 'Letcheflan Oval (330-340g)', 'Lecheflan Oval (330-340g)'], regularPrice: 90, price: 77 },
  { id: 'e10b060c-3efd-40cc-9df2-cfcfceee6149', names: ['Flan Tub Round', 'Lecheflan Flat Tub Round', 'Leche Flan Flat Tub Round'], regularPrice: 85, price: 75 },
  { id: 'ce447f8f-e8ec-4ebf-9d5f-6567f37d207b', names: ['Ube Flan', 'Ube Flan Original 350g'], regularPrice: 105, price: 95 },
  { id: '4cc58171-c839-4c86-8ee2-865e98b201ed', names: ['Graham de Leche', 'Graham de Leche (500ml Tub)'], regularPrice: 110, price: 100 },
  { id: '58944820-5b70-42c0-855d-1361f8936686', names: ['Graham de Leche Ube', 'Graham de Leche Ube Halaya', 'Graham de Leche Ube Halaya (650ml Tub)'], regularPrice: 130, price: 125 },
  { id: '7d20cd7b-fce9-41b0-a1f8-ab16c61ed971', names: ['Ube Halaya', 'Ube Halaya 100% Real Ube', 'Ube Halaya 100% Real Ube (300g)'], regularPrice: 90, price: 90 },
  { id: '509dc395-3760-48da-8837-7d9151785aa8', names: ['Oreo Graham Float', 'Oreo Graham Float (500ml Tub)'], regularPrice: 110, price: 100 },
  { id: '3b07d5e4-408c-47d3-a443-6ee1c30cab3f', names: ['Yema in a Can', 'Yema in a Can Dulce de Letche 390g', 'Yema in a Can Dulce de Leche 390g'], regularPrice: 110, price: 95 },
  { id: 'aef24c3c-bb7c-4ed9-9998-ed921abc785b', names: ['Moist Choco Crinkle (12 big pcs)', 'Moist Choco Crinkles (12 big pcs)'], regularPrice: 140, price: 130 },
  { id: '298be457-f80c-4c7d-a01b-8ef196cdf12c', names: ['Moist Crinkles Trio (12 big pcs)'], regularPrice: 140, price: 125 },
  { id: '76a1b8b1-9627-4465-aeb0-b7b367695150', names: ['Premium Crinkle Bites Chocolate (450g)'], regularPrice: 125, price: 115 },
  { id: 'b67cd310-0040-4643-ad70-8a01cc60c31e', names: ['Premium Crinkle Bites Ube (450g)'], regularPrice: 120, price: 105 },
  { names: ['Premium Crinkle Bites Red Velvet (450g)', 'Premium Crinkle Bites Red Velvet'], regularPrice: 120, price: 105 },
  { names: ['Premium Brownies Overload', 'Premium Brownies Overload (8pcs)', 'Premium Brownles Overload', 'Premium Brownles Overload (8pcs)'], regularPrice: 110, price: 98 },
  { id: '5bbb3b17-81c0-46ff-9e75-f5688e098159', names: ['Chocolate Revel 8pcs (300g)'], regularPrice: 95, price: 90 },
  { id: 'f4c74ce4-ae18-4477-96e3-f7b89aeb5957', names: ['Double Choco Inverse 8pcs (300g)', 'Double Chocolate Inverse 8pcs (300g)'], regularPrice: 95, price: 90 },
  { id: '0ffe488d-ac04-45be-88de-8b89e8df8ac8', names: ['Choco Caramel Bars w Real Cashew (8pcs)'], regularPrice: 90, price: 80 },
  { id: 'd53a6386-4fd7-4902-8abd-31ba5e82aa22', names: ['Leche Flan Cake Choco', 'Leche Flan Cake (Choco 450g)'], regularPrice: 110, price: 98 },
  { id: 'eb70735b-8938-4f0c-bd39-92d06dce6110', names: ['Leche Flan Cake (Ube 450g)', 'Letcheflan Cake Ube (UBE 450g)', 'Letcheflan Cake Ube 450g'], regularPrice: 100, price: 95 },
  { id: 'e6ddfbe2-386b-4479-8597-6640917397d7', names: ['2 in 1 Revel & Inverse 8pcs (300g)'], regularPrice: 145, price: 130 },
  { id: 'a3f71afc-033d-4e74-b2bc-80ef11d78f98', names: ['Moist Crinkles Trio big 4pcs'], regularPrice: 75, price: 63 },
  { id: '5bf21980-37c8-4a5b-bebb-e4354119717e', names: ['Mango Graham Tiramisu (500ml Tub)', 'Mango Graham Tiramusu (500ml Tub)'], regularPrice: 145, price: 130 },
  { id: '2744ca3c-1a13-4e05-b902-d6017db76b84', names: ['Moist Crinkles Choco big 6pcs'], regularPrice: 85, price: 65 },
];

// Keep size and flavor text: a 4-piece pack must never match a 12-piece pack.
const normalizeName = name => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const offersById = new Map(BULK_OFFERS.map(offer => [offer.id, offer]));
const offersByName = new Map(BULK_OFFERS.flatMap(offer => offer.names.map(name => [normalizeName(name), offer])));
const money = amount => Math.round(amount * 100) / 100;

export const MAX_PRICE = 99999999;
export const MAX_QUANTITY = 2147483647;

export const validateProductPrice = (value, label = 'Price') => {
  const text = String(value ?? '').trim();
  const amount = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(amount) || amount > MAX_PRICE) {
    throw new Error(`${label} must be a whole number of pesos (0 or more).`);
  }
  return amount;
};

export const validateProductQuantity = (value, label = 'Stock', minimum = 0) => {
  const text = String(value ?? '').trim();
  const quantity = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(quantity) || quantity < minimum || quantity > MAX_QUANTITY) {
    throw new Error(`${label} must be a whole number between ${minimum} and ${MAX_QUANTITY}.`);
  }
  return quantity;
};

export const validateDiscountTiers = (tiers, sellingPrice) => {
  if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > 10) {
    throw new Error('Enable at least one discount tier and use no more than 10 tiers.');
  }
  const normalized = tiers.map(tier => ({
    minQuantity: validateProductQuantity(tier?.minQuantity ?? tier?.min_quantity, 'Minimum quantity', 2),
    price: validateProductPrice(tier?.price, 'Discounted price'),
  })).sort((a, b) => a.minQuantity - b.minQuantity);
  normalized.forEach((tier, index) => {
    if (tier.price > sellingPrice) throw new Error('Discounted prices cannot exceed the selling price.');
    if (index > 0 && tier.minQuantity === normalized[index - 1].minQuantity) {
      throw new Error('Each discount tier must have a different minimum quantity.');
    }
    if (index > 0 && tier.price >= normalized[index - 1].price) {
      throw new Error('Higher quantity tiers must offer a lower price.');
    }
  });
  return normalized;
};

export const getProductDiscountConfig = (product = {}) => {
  const configured = product.discountEnabled ?? product.discount_enabled;
  if (configured !== undefined && configured !== null) {
    const tiers = product.discountTiers ?? product.discount_tiers ?? [];
    return { enabled: configured === true, configured: true, tiers: configured === true && Array.isArray(tiers)
      ? tiers.filter(tier => tier && tier.price !== '' && tier.price != null)
        .map(tier => ({ minQuantity: Number(tier.minQuantity ?? tier.min_quantity), price: Number(tier.price) }))
        .filter(tier => Number.isSafeInteger(tier.minQuantity) && tier.minQuantity >= 2 && Number.isFinite(tier.price) && tier.price >= 0)
        .sort((a, b) => a.minQuantity - b.minQuantity) : [] };
  }
  const offer = offersById.get(String(product.id || product.productId || product.product_id || ''))
    || offersByName.get(normalizeName(product.product_name || product.productName || product.name));
  return { enabled: Boolean(offer), configured: false,
    tiers: offer ? [{ minQuantity: BULK_MIN_QUANTITY, price: offer.price }] : [] };
};

export const getProfitPreview = ({ costPrice, price, discountEnabled = false, discountTiers = [] }) => {
  const cost = Number(costPrice);
  const selling = Number(price);
  const hasCost = costPrice !== '' && costPrice != null && Number.isFinite(cost) && cost >= 0;
  const hasPrice = price !== '' && price != null && Number.isFinite(selling) && selling >= 0;
  if (!hasCost || !hasPrice) return null;
  const regularProfit = money(selling - cost);
  const tiers = discountEnabled ? discountTiers.filter(tier => (
    tier.price !== '' && tier.price != null && Number.isFinite(Number(tier.price))
    && Number(tier.price) >= 0 && Number.isSafeInteger(Number(tier.minQuantity)) && Number(tier.minQuantity) >= 2
  )).map(tier => ({ minQuantity: Number(tier.minQuantity), price: Number(tier.price),
    profitPerUnit: money(Number(tier.price) - cost),
    estimatedProfit: money((Number(tier.price) - cost) * Number(tier.minQuantity)),
    customerSavings: money((selling - Number(tier.price)) * Number(tier.minQuantity)),
  })) : [];
  return { regularProfit, margin: selling > 0 ? money(regularProfit / selling * 100) : null, tiers,
    belowCost: selling < cost || tiers.some(tier => tier.price < cost) };
};

export const getProductPricing = (product = {}, requestedQuantity = 1) => {
  const offer = offersById.get(String(product.id || product.productId || product.product_id || ''))
    || offersByName.get(normalizeName(product.product_name || product.productName || product.name));
  const discount = getProductDiscountConfig(product);
  const rawPrice = Number((discount.configured ? undefined : offer?.regularPrice) ?? product.regularPrice ?? product.regular_price ?? product.price ?? 0);
  const regularPrice = money(Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0);
  const rawQuantity = Number(requestedQuantity);
  const quantity = Number.isSafeInteger(rawQuantity) && rawQuantity >= 1 ? rawQuantity : 1;
  const tiers = discount.tiers.filter(tier => tier.price <= regularPrice);
  const appliedTier = tiers.filter(tier => quantity >= tier.minQuantity).at(-1);
  const previewTier = appliedTier || tiers[0];
  const bulkPrice = previewTier?.price ?? null;
  const bulkMinQuantity = previewTier?.minQuantity ?? BULK_MIN_QUANTITY;
  const isBulkPrice = Boolean(appliedTier);
  const unitPrice = isBulkPrice ? money(appliedTier.price) : regularPrice;
  return { regularPrice, bulkPrice, bulkMinQuantity, bulkQuantityLabel: `${bulkMinQuantity}+ packs`, quantity, unitPrice,
    isBulkPrice, lineTotal: money(unitPrice * quantity), savings: money((regularPrice - unitPrice) * quantity) };
};
