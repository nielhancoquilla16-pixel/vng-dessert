const roundTo = (value, decimals = 4) => {
  const numericValue = Number(value) || 0;
  const factor = 10 ** decimals;
  return Math.round(numericValue * factor) / factor;
};

const normalizeTextKey = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const titleCase = (value = '') => String(value || '')
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ');

export const formatCalculatorQuantity = (value, maximumFractionDigits = 2) => {
  const numericValue = Number(value) || 0;

  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: Number.isInteger(numericValue) ? 0 : 1,
    maximumFractionDigits,
  });
};

export const formatCalculatorPercent = (value) => `${Math.round(Number(value) || 0)}%`;

const UNIT_DEFINITIONS = {
  pcs: { label: 'pcs', family: 'count', factor: 1 },
  cans: { label: 'cans', family: 'container-can', factor: 1 },
  packs: { label: 'packs', family: 'container-pack', factor: 1 },
  blocks: { label: 'blocks', family: 'container-block', factor: 1 },
  tsp: { label: 'tsp', family: 'volume-imperial', factor: 1 },
  tbsp: { label: 'tbsp', family: 'volume-imperial', factor: 3 },
  cups: { label: 'cups', family: 'volume-imperial', factor: 48 },
  ml: { label: 'ml', family: 'volume-metric', factor: 1 },
  l: { label: 'l', family: 'volume-metric', factor: 1000 },
  g: { label: 'g', family: 'mass-metric', factor: 1 },
  kg: { label: 'kg', family: 'mass-metric', factor: 1000 },
};

const UNIT_ALIASES = new Map([
  ['pc', 'pcs'],
  ['piece', 'pcs'],
  ['pieces', 'pcs'],
  ['can', 'cans'],
  ['pack', 'packs'],
  ['packet', 'packs'],
  ['packets', 'packs'],
  ['cup', 'cups'],
  ['tablespoon', 'tbsp'],
  ['tablespoons', 'tbsp'],
  ['tbsp', 'tbsp'],
  ['teaspoon', 'tsp'],
  ['teaspoons', 'tsp'],
  ['tsp', 'tsp'],
  ['liter', 'l'],
  ['liters', 'l'],
  ['litre', 'l'],
  ['litres', 'l'],
  ['gram', 'g'],
  ['grams', 'g'],
  ['kilogram', 'kg'],
  ['kilograms', 'kg'],
  ['block', 'blocks'],
]);

export const CALCULATOR_UNIT_OPTIONS = [
  'pcs',
  'cups',
  'tbsp',
  'tsp',
  'cans',
  'packs',
  'blocks',
  'ml',
  'g',
];

export const INGREDIENT_DEFINITIONS = [
  {
    key: 'egg',
    name: 'Egg',
    defaultUnit: 'pcs',
    aliases: ['egg', 'eggs'],
  },
  {
    key: 'condensed-milk',
    name: 'Condensed Milk (390g)',
    defaultUnit: 'cans',
    aliases: ['condensed milk', 'condensed milk 390g', 'condensed milk 390 g', 'condensed milk (390g)'],
  },
  {
    key: 'evaporated-milk',
    name: 'Evaporated Milk (370ml)',
    defaultUnit: 'cans',
    aliases: ['evaporated milk', 'evaporated milk 370ml', 'evaporated milk 370 ml', 'evaporated milk (370ml)'],
  },
  {
    key: 'all-purpose-cream',
    name: 'All-Purpose Cream (250ml)',
    defaultUnit: 'packs',
    aliases: ['all purpose cream', 'all-purpose cream', 'all-purpose cream 250ml', 'all purpose cream 250ml', 'all-purpose cream (250ml)'],
  },
  {
    key: 'sugar',
    name: 'Sugar',
    defaultUnit: 'cups',
    aliases: ['sugar', 'white sugar', 'brown sugar'],
  },
  {
    key: 'milk',
    name: 'Milk',
    defaultUnit: 'cups',
    aliases: ['milk', 'fresh milk', 'whole milk'],
  },
  {
    key: 'butter',
    name: 'Butter',
    defaultUnit: 'cups',
    aliases: ['butter', 'unsalted butter'],
  },
  {
    key: 'all-purpose-flour',
    name: 'All-Purpose Flour',
    defaultUnit: 'cups',
    aliases: ['all-purpose flour', 'all purpose flour', 'flour'],
  },
  {
    key: 'cocoa-powder',
    name: 'Cocoa Powder',
    defaultUnit: 'cups',
    aliases: ['cocoa powder', 'cacao powder'],
  },
  {
    key: 'ube-halaya',
    name: 'Ube Halaya',
    defaultUnit: 'cups',
    aliases: ['ube halaya', 'ube jam'],
  },
  {
    key: 'vanilla-extract',
    name: 'Vanilla Extract',
    defaultUnit: 'tsp',
    aliases: ['vanilla extract', 'vanilla'],
  },
  {
    key: 'calamansi-juice',
    name: 'Calamansi Juice',
    defaultUnit: 'pcs',
    aliases: ['calamansi juice', 'calamansi'],
  },
  {
    key: 'crushed-graham',
    name: 'Crushed Graham',
    defaultUnit: 'cups',
    aliases: ['crushed graham', 'graham crumbs', 'graham'],
  },
  {
    key: 'chocolate-chips',
    name: 'Chocolate Chips',
    defaultUnit: 'cups',
    aliases: ['chocolate chips', 'chocolate chip', 'chips'],
  },
  {
    key: 'cream-cheese',
    name: 'Cream Cheese',
    defaultUnit: 'cups',
    aliases: ['cream cheese'],
  },
];

const ingredientByKey = new Map(INGREDIENT_DEFINITIONS.map((ingredient) => [ingredient.key, ingredient]));
const ingredientAliasLookup = new Map();

INGREDIENT_DEFINITIONS.forEach((ingredient) => {
  ingredient.aliases.forEach((alias) => {
    ingredientAliasLookup.set(normalizeTextKey(alias), ingredient.key);
  });
});

const createRecipe = ({
  id,
  name,
  aliases = [],
  unit = 'pcs',
  outputLabel = unit,
  accent = '#f97316',
  productId = '',
  imageUrl = '',
  ingredients,
}) => ({
  id,
  name,
  aliases,
  unit,
  outputLabel,
  accent,
  productId,
  imageUrl,
  ingredients: ingredients.map((ingredient) => {
    const resolvedKey = ingredientAliasLookup.get(normalizeTextKey(ingredient.name)) || ingredient.key || normalizeTextKey(ingredient.name);
    const definition = ingredientByKey.get(resolvedKey);

    return {
      ...ingredient,
      key: resolvedKey,
      name: definition?.name || ingredient.name,
      unit: normalizeUnitName(ingredient.unit || definition?.defaultUnit || 'pcs'),
    };
  }),
});

export const RECIPE_CATALOG = [
  createRecipe({
    id: 'lecheflan',
    name: 'Lecheflan',
    aliases: ['leche flan'],
    outputLabel: 'pcs (round mold)',
    accent: '#f59e0b',
    ingredients: [
      { name: 'Egg', amount: 6, unit: 'pcs' },
      { name: 'Condensed Milk (390g)', amount: 1 / 3, unit: 'cans' },
      { name: 'Evaporated Milk (370ml)', amount: 1 / 3, unit: 'cans' },
      { name: 'All-Purpose Cream (250ml)', amount: 1 / 4, unit: 'packs' },
      { name: 'Sugar', amount: 2, unit: 'tbsp' },
      { name: 'Vanilla Extract', amount: 1 / 8, unit: 'tsp' },
    ],
  }),
  createRecipe({
    id: 'ube-halaya-flan',
    name: 'Ube Halaya Flan',
    aliases: ['ube halaya flan', 'ube flan'],
    outputLabel: 'pcs (round mold)',
    accent: '#8b5cf6',
    ingredients: [
      { name: 'Egg', amount: 6, unit: 'pcs' },
      { name: 'Condensed Milk (390g)', amount: 1 / 3, unit: 'cans' },
      { name: 'Evaporated Milk (370ml)', amount: 1 / 3, unit: 'cans' },
      { name: 'All-Purpose Cream (250ml)', amount: 1 / 4, unit: 'packs' },
      { name: 'Ube Halaya', amount: 1 / 2, unit: 'cups' },
      { name: 'Sugar', amount: 2, unit: 'tbsp' },
      { name: 'Vanilla Extract', amount: 1 / 8, unit: 'tsp' },
    ],
  }),
  createRecipe({
    id: 'crinkles',
    name: 'Crinkles',
    outputLabel: 'pcs',
    accent: '#6b4f3b',
    ingredients: [
      { name: 'All-Purpose Flour', amount: 0.18, unit: 'cups' },
      { name: 'Cocoa Powder', amount: 0.08, unit: 'cups' },
      { name: 'Sugar', amount: 0.08, unit: 'cups' },
      { name: 'Butter', amount: 0.04, unit: 'cups' },
      { name: 'Egg', amount: 0.12, unit: 'pcs' },
      { name: 'Vanilla Extract', amount: 0.03, unit: 'tsp' },
    ],
  }),
  createRecipe({
    id: 'double-choco-inverse',
    name: 'Double Choco Inverse',
    outputLabel: 'pcs (8x3 pan)',
    accent: '#7c2d12',
    ingredients: [
      { name: 'All-Purpose Flour', amount: 0.22, unit: 'cups' },
      { name: 'Cocoa Powder', amount: 0.09, unit: 'cups' },
      { name: 'Chocolate Chips', amount: 0.08, unit: 'cups' },
      { name: 'Butter', amount: 0.05, unit: 'cups' },
      { name: 'Milk', amount: 0.05, unit: 'cups' },
      { name: 'Egg', amount: 0.15, unit: 'pcs' },
    ],
  }),
  createRecipe({
    id: 'cheesy-ensaymada',
    name: 'Cheesy Ensaymada',
    outputLabel: 'pcs',
    accent: '#facc15',
    ingredients: [
      { name: 'All-Purpose Flour', amount: 0.2, unit: 'cups' },
      { name: 'Milk', amount: 0.08, unit: 'cups' },
      { name: 'Butter', amount: 0.04, unit: 'cups' },
      { name: 'Sugar', amount: 0.04, unit: 'cups' },
      { name: 'Condensed Milk (390g)', amount: 0.05, unit: 'cans' },
      { name: 'Vanilla Extract', amount: 0.02, unit: 'tsp' },
    ],
  }),
  createRecipe({
    id: 'mango-graham-float',
    name: 'Mango Graham Float',
    outputLabel: 'pcs (small tub)',
    accent: '#fb923c',
    ingredients: [
      { name: 'Crushed Graham', amount: 0.18, unit: 'cups' },
      { name: 'All-Purpose Cream (250ml)', amount: 0.18, unit: 'packs' },
      { name: 'Condensed Milk (390g)', amount: 0.08, unit: 'cans' },
      { name: 'Milk', amount: 0.04, unit: 'cups' },
      { name: 'Sugar', amount: 0.01, unit: 'cups' },
    ],
  }),
  createRecipe({
    id: 'cookies-and-cream-icebox-cake',
    name: 'Cookies & Cream Icebox Cake',
    aliases: ['cookies and cream icebox cake'],
    outputLabel: 'pcs (small tub)',
    accent: '#64748b',
    ingredients: [
      { name: 'Crushed Graham', amount: 0.16, unit: 'cups' },
      { name: 'All-Purpose Cream (250ml)', amount: 0.2, unit: 'packs' },
      { name: 'Condensed Milk (390g)', amount: 0.08, unit: 'cans' },
      { name: 'Chocolate Chips', amount: 0.08, unit: 'cups' },
      { name: 'Milk', amount: 0.05, unit: 'cups' },
    ],
  }),
];

const buildRecipeLookup = (recipeCatalog = RECIPE_CATALOG) => {
  const lookup = new Map();

  recipeCatalog.forEach((recipe) => {
    [recipe.name, ...(recipe.aliases || [])].forEach((alias) => {
      lookup.set(normalizeTextKey(alias), recipe);
    });
  });

  return lookup;
};

const normalizeRecipeCatalog = (recipeCatalog = RECIPE_CATALOG) => (
  (Array.isArray(recipeCatalog) ? recipeCatalog : RECIPE_CATALOG)
    .map((recipe, index) => createRecipe({
      id: recipe.id || recipe.recipeId || normalizeTextKey(recipe.productName || recipe.name || `recipe-${index + 1}`),
      name: String(recipe.productName || recipe.name || '').trim(),
      aliases: Array.isArray(recipe.aliases) ? recipe.aliases : [],
      unit: normalizeUnitName(recipe.unit || recipe.outputUnit || 'pcs'),
      outputLabel: String(recipe.outputLabel || recipe.output_label || recipe.unit || recipe.outputUnit || 'pcs').trim() || 'pcs',
      accent: recipe.accent || '#f97316',
      productId: recipe.productId || recipe.product_id || '',
      imageUrl: recipe.imageUrl || recipe.image_url || '',
      ingredients: (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
        .map((ingredient) => ({
          key: ingredient.key,
          name: ingredient.ingredientName || ingredient.ingredient_name || ingredient.name || '',
          amount: Number(ingredient.amount ?? ingredient.quantity) || 0,
          unit: ingredient.unit || 'pcs',
        }))
        .filter((ingredient) => ingredient.name && ingredient.amount > 0),
    }))
    .filter((recipe) => recipe.name && recipe.ingredients.length > 0)
);

const buildIngredientCatalog = (recipeCatalog = RECIPE_CATALOG) => {
  const normalizedRecipes = normalizeRecipeCatalog(recipeCatalog);
  const ingredientOrder = new Map();
  const ingredientDefinitions = new Map();

  normalizedRecipes.forEach((recipe) => {
    recipe.ingredients.forEach((ingredient) => {
      if (!ingredientOrder.has(ingredient.key)) {
        ingredientOrder.set(ingredient.key, ingredientOrder.size);
      }

      if (!ingredientDefinitions.has(ingredient.key)) {
        ingredientDefinitions.set(ingredient.key, {
          key: ingredient.key,
          name: ingredient.name,
          defaultUnit: normalizeUnitName(ingredient.unit || 'pcs'),
        });
      }
    });
  });

  return {
    ingredientOrder,
    ingredientDefinitions,
    recipes: normalizedRecipes,
  };
};

export function normalizeUnitName(value = '') {
  const normalizedKey = normalizeTextKey(value);
  const aliasMatch = UNIT_ALIASES.get(normalizedKey);
  const unitKey = aliasMatch || normalizedKey;

  return UNIT_DEFINITIONS[unitKey]?.label || value || 'pcs';
}

const getUnitDefinition = (unitName = '') => UNIT_DEFINITIONS[normalizeUnitName(unitName)] || null;

export const canConvertUnits = (fromUnit, toUnit) => {
  const fromDefinition = getUnitDefinition(fromUnit);
  const toDefinition = getUnitDefinition(toUnit);

  return Boolean(
    fromDefinition
      && toDefinition
      && fromDefinition.family === toDefinition.family,
  );
};

export const convertQuantityBetweenUnits = (value, fromUnit, toUnit) => {
  const numericValue = Number(value) || 0;
  const normalizedFromUnit = normalizeUnitName(fromUnit);
  const normalizedToUnit = normalizeUnitName(toUnit);

  if (normalizedFromUnit === normalizedToUnit) {
    return numericValue;
  }

  const fromDefinition = getUnitDefinition(normalizedFromUnit);
  const toDefinition = getUnitDefinition(normalizedToUnit);

  if (!fromDefinition || !toDefinition || fromDefinition.family !== toDefinition.family) {
    return null;
  }

  return numericValue * (fromDefinition.factor / toDefinition.factor);
};

export const resolveIngredientDefinition = (name = '') => {
  const key = ingredientAliasLookup.get(normalizeTextKey(name)) || normalizeTextKey(name);
  const definition = ingredientByKey.get(key);

  return {
    key,
    name: definition?.name || titleCase(name || key),
    defaultUnit: definition?.defaultUnit || 'pcs',
  };
};

export const resolveRecipe = (value = '', recipeCatalog = RECIPE_CATALOG) => (
  buildRecipeLookup(normalizeRecipeCatalog(recipeCatalog)).get(normalizeTextKey(value)) || null
);

export const getRecipeById = (recipeId = '', recipeCatalog = RECIPE_CATALOG) => (
  normalizeRecipeCatalog(recipeCatalog).find((recipe) => recipe.id === recipeId) || null
);

const sortIngredientRows = (left, right, ingredientOrder = new Map()) => {
  const leftIndex = ingredientOrder.get(left.key);
  const rightIndex = ingredientOrder.get(right.key);
  const safeLeftIndex = leftIndex ?? Number.MAX_SAFE_INTEGER;
  const safeRightIndex = rightIndex ?? Number.MAX_SAFE_INTEGER;

  if (safeLeftIndex !== safeRightIndex) {
    return safeLeftIndex - safeRightIndex;
  }

  return left.ingredientName.localeCompare(right.ingredientName);
};

export const buildIngredientInputRows = (inventoryBatches = [], recipeCatalog = RECIPE_CATALOG) => {
  const {
    ingredientDefinitions,
    ingredientOrder,
  } = buildIngredientCatalog(recipeCatalog);
  const rowsByKey = new Map();

  ingredientDefinitions.forEach((ingredient) => {
    rowsByKey.set(ingredient.key, {
      key: ingredient.key,
      ingredientName: ingredient.name,
      quantity: 0,
      stockQuantity: 0,
      unit: ingredient.defaultUnit,
      defaultUnit: ingredient.defaultUnit,
    });
  });

  inventoryBatches.forEach((batch) => {
    const ingredient = resolveIngredientDefinition(batch.productName || batch.ingredientName || batch.name || '');
    const batchUnit = normalizeUnitName(batch.unit || ingredient.defaultUnit);
    const nextQuantity = Number(batch.quantity) || 0;
    const existingRow = rowsByKey.get(ingredient.key) || {
      key: ingredient.key,
      ingredientName: ingredient.name,
      quantity: 0,
      stockQuantity: 0,
      unit: batchUnit,
      defaultUnit: ingredient.defaultUnit,
    };
    const convertedQuantity = convertQuantityBetweenUnits(nextQuantity, batchUnit, existingRow.unit);

    rowsByKey.set(ingredient.key, {
      ...existingRow,
      ingredientName: ingredient.name,
      unit: existingRow.unit || batchUnit,
      defaultUnit: ingredient.defaultUnit,
      quantity: roundTo(existingRow.quantity + (convertedQuantity ?? nextQuantity)),
      stockQuantity: roundTo(existingRow.stockQuantity + (convertedQuantity ?? nextQuantity)),
    });
  });

  return Array.from(rowsByKey.values()).sort((left, right) => (
    sortIngredientRows(left, right, ingredientOrder)
  ));
};

const buildIngredientMap = (ingredientRows = []) => new Map(
  ingredientRows.map((row) => [row.key, {
    ...row,
    quantity: Number(row.quantity) || 0,
    unit: normalizeUnitName(row.unit || row.defaultUnit || 'pcs'),
  }]),
);

const buildRemainingIngredients = (ingredientRows = [], recipeUsage = []) => {
  const deductions = new Map();

  recipeUsage.forEach((usage) => {
    if (!usage.ingredientKey || !usage.sourceUnit) {
      return;
    }

    deductions.set(usage.ingredientKey, roundTo((deductions.get(usage.ingredientKey) || 0) + usage.usedSourceQuantity));
  });

  return ingredientRows.map((row) => {
    const availableQuantity = Number(row.quantity) || 0;
    const usedQuantity = deductions.get(row.key) || 0;
    return {
      ...row,
      usedQuantity: roundTo(usedQuantity),
      remainingQuantity: roundTo(Math.max(availableQuantity - usedQuantity, 0)),
    };
  });
};

export const calculateRecipeOutput = (recipe, ingredientRows = []) => {
  const ingredientMap = buildIngredientMap(ingredientRows);
  const ratios = [];

  const requirementRows = recipe.ingredients.map((requirement) => {
    const sourceRow = ingredientMap.get(requirement.key) || null;
    const availableSourceQuantity = Number(sourceRow?.quantity) || 0;
    const sourceUnit = sourceRow?.unit || requirement.unit;
    const convertedAvailableQuantity = sourceRow
      ? convertQuantityBetweenUnits(availableSourceQuantity, sourceUnit, requirement.unit)
      : 0;
    const availableQuantity = convertedAvailableQuantity ?? availableSourceQuantity;
    const quantityRatio = requirement.amount > 0 && Number.isFinite(availableQuantity)
      ? availableQuantity / requirement.amount
      : 0;

    ratios.push({
      ingredientKey: requirement.key,
      ingredientName: requirement.name,
      ratio: Number.isFinite(quantityRatio) ? quantityRatio : 0,
      availableQuantity: roundTo(availableQuantity),
      availableSourceQuantity: roundTo(availableSourceQuantity),
      sourceUnit,
      requiredQuantity: requirement.amount,
      requiredUnit: requirement.unit,
    });

    return {
      ingredientKey: requirement.key,
      ingredientName: requirement.name,
      amount: requirement.amount,
      unit: requirement.unit,
      sourceUnit,
      availableQuantity: roundTo(availableQuantity),
      availableSourceQuantity: roundTo(availableSourceQuantity),
      ratio: Number.isFinite(quantityRatio) ? quantityRatio : 0,
    };
  });

  const limitingRatio = ratios.reduce((smallest, current) => (
    current.ratio < smallest.ratio ? current : smallest
  ), ratios[0] || {
    ingredientKey: '',
    ingredientName: 'No ingredient',
    ratio: 0,
    availableQuantity: 0,
    availableSourceQuantity: 0,
    sourceUnit: '',
    requiredQuantity: 0,
    requiredUnit: 'pcs',
  });

  const quantity = limitingRatio && Number.isFinite(limitingRatio.ratio)
    ? Math.max(0, Math.floor(limitingRatio.ratio))
    : 0;

  const recipeUsage = requirementRows.map((requirement) => {
    const usedQuantity = roundTo(Math.min(requirement.availableQuantity, requirement.amount * quantity));
    const usedSourceQuantity = convertQuantityBetweenUnits(usedQuantity, requirement.unit, requirement.sourceUnit);
    const remainingQuantity = roundTo(Math.max(requirement.availableQuantity - usedQuantity, 0));
    const usagePercent = requirement.availableQuantity > 0
      ? Math.min(100, (usedQuantity / requirement.availableQuantity) * 100)
      : 0;

    return {
      ...requirement,
      usedQuantity,
      usedSourceQuantity: roundTo(usedSourceQuantity ?? usedQuantity),
      remainingQuantity,
      usagePercent,
    };
  });

  const usagePercent = recipeUsage.length > 0
    ? recipeUsage.reduce((sum, ingredient) => sum + ingredient.usagePercent, 0) / recipeUsage.length
    : 0;
  const remainingIngredients = buildRemainingIngredients(ingredientRows, recipeUsage);

  return {
    recipeId: recipe.id,
    productName: recipe.name,
    quantity,
    unit: recipe.unit,
    outputLabel: recipe.outputLabel,
    accent: recipe.accent,
    limitingIngredientKey: limitingRatio.ingredientKey,
    limitingIngredientName: limitingRatio.ingredientName,
    usagePercent: roundTo(usagePercent, 2),
    requirements: recipeUsage,
    remainingIngredients,
    missingIngredients: recipeUsage
      .filter((ingredient) => ingredient.availableQuantity <= 0)
      .map((ingredient) => ingredient.ingredientName),
  };
};

export const calculateAllRecipeOutputs = (ingredientRows = [], recipeCatalog = RECIPE_CATALOG) => normalizeRecipeCatalog(recipeCatalog)
  .map((recipe) => calculateRecipeOutput(recipe, ingredientRows))
  .sort((left, right) => {
    if (right.quantity !== left.quantity) {
      return right.quantity - left.quantity;
    }

    return left.productName.localeCompare(right.productName);
  });

export const buildCalculatorSummary = (results = [], ingredientRows = [], recipeCatalog = RECIPE_CATALOG) => {
  const normalizedRecipes = normalizeRecipeCatalog(recipeCatalog);
  const producibleResults = results.filter((result) => result.quantity > 0);
  const totalProducts = producibleResults.length;
  const totalQuantity = producibleResults.reduce((sum, result) => sum + result.quantity, 0);
  const averageUsagePercent = producibleResults.length > 0
    ? producibleResults.reduce((sum, result) => sum + result.usagePercent, 0) / producibleResults.length
    : 0;
  const recipeIngredientKeys = new Set(
    normalizedRecipes.flatMap((recipe) => recipe.ingredients.map((ingredient) => ingredient.key)),
  );
  const ingredientsUsed = ingredientRows.filter((row) => (
    (Number(row.quantity) || 0) > 0 && recipeIngredientKeys.has(row.key)
  )).length;

  return {
    totalProducts,
    totalQuantity,
    averageUsagePercent: roundTo(averageUsagePercent, 2),
    ingredientsUsed,
    trackedIngredients: recipeIngredientKeys.size || ingredientRows.length,
  };
};

export const createCalculationHistoryEntry = ({
  mode = 'all',
  summary,
  selectedResult = null,
  results = [],
}) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  createdAt: new Date().toISOString(),
  mode,
  summary: {
    totalProducts: summary.totalProducts,
    totalQuantity: summary.totalQuantity,
    averageUsagePercent: summary.averageUsagePercent,
    ingredientsUsed: summary.ingredientsUsed,
  },
  selectedProductName: selectedResult?.productName || '',
  selectedProductQuantity: selectedResult?.quantity || 0,
  limitingIngredientName: selectedResult?.limitingIngredientName || '',
  topProducts: results.slice(0, 3).map((result) => ({
    productName: result.productName,
    quantity: result.quantity,
    limitingIngredientName: result.limitingIngredientName,
  })),
});

const toCsvCell = (value) => {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

export const buildCalculatorCsvReport = ({
  summary,
  results,
  selectedResult,
  ingredientRows,
}) => {
  const lines = [
    ['Ingredient Calculator Report'],
    ['Generated At', new Date().toLocaleString()],
    [],
    ['Summary'],
    ['Total Products That Can Be Made', summary.totalProducts],
    ['Total Quantity (All Products Combined)', summary.totalQuantity],
    ['Average Ingredient Usage (%)', formatCalculatorPercent(summary.averageUsagePercent)],
    ['Number of Ingredients Used', `${summary.ingredientsUsed} of ${summary.trackedIngredients}`],
    [],
    ['All Products You Can Make'],
    ['Product Name', 'Quantity You Can Make', 'Unit', 'Limiting Ingredient', 'Usage %'],
    ...results.map((result) => [
      result.productName,
      result.quantity,
      result.outputLabel,
      result.limitingIngredientName,
      formatCalculatorPercent(result.usagePercent),
    ]),
  ];

  if (selectedResult) {
    lines.push(
      [],
      ['Selected Product Details'],
      ['Product Name', selectedResult.productName],
      ['Maximum Quantity', selectedResult.quantity],
      ['Unit', selectedResult.outputLabel],
      ['Limiting Ingredient', selectedResult.limitingIngredientName],
      [],
      ['Recipe Requirement Per 1 Unit'],
      ['Ingredient', 'Required Quantity', 'Unit'],
      ...selectedResult.requirements.map((requirement) => [
        requirement.ingredientName,
        formatCalculatorQuantity(requirement.amount, 3),
        requirement.unit,
      ]),
      [],
      ['Remaining Ingredients After Production'],
      ['Ingredient', 'Remaining Quantity', 'Unit'],
      ...selectedResult.remainingIngredients.map((ingredient) => [
        ingredient.ingredientName,
        formatCalculatorQuantity(ingredient.remainingQuantity, 3),
        ingredient.unit,
      ]),
    );
  }

  lines.push(
    [],
    ['Available Ingredient Inputs'],
    ['Ingredient', 'Available Quantity', 'Unit'],
    ...ingredientRows.map((ingredient) => [
      ingredient.ingredientName,
      formatCalculatorQuantity(ingredient.quantity, 3),
      ingredient.unit,
    ]),
  );

  return lines
    .map((row) => row.map((cell) => toCsvCell(cell)).join(','))
    .join('\n');
};

export const downloadCsvReport = (filename, csvContent) => {
  if (typeof window === 'undefined') {
    return;
  }

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = objectUrl;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(objectUrl);
};
