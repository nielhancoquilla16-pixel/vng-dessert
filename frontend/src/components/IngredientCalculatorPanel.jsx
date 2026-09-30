import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Calculator,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Flame,
  History,
  Info,
  Package,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useAI } from '../context/AIContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { subscribeToDatabaseChanges } from '../lib/realtime';
import {
  buildCalculatorCsvReport,
  buildCalculatorSummary,
  buildIngredientInputRows,
  CALCULATOR_UNIT_OPTIONS,
  calculateAllRecipeOutputs,
  convertQuantityBetweenUnits,
  createCalculationHistoryEntry,
  downloadCsvReport,
  formatCalculatorPercent,
  formatCalculatorQuantity,
  getRecipeById,
  normalizeUnitName,
} from '../utils/ingredientCalculator';
import LoadingButton from './LoadingButton';
import './IngredientCalculatorPanel.css';

const HISTORY_STORAGE_KEY = 'vng_ingredient_calculator_history';
const CALCULATION_LOADING_DELAY_MS = 450;

const safeStorage = {
  getItem(key) {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage write failures.
    }
  },
};

const loadHistoryEntries = () => {
  const rawValue = safeStorage.getItem(HISTORY_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeMatchKey = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const formatHistoryDate = (value) => {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Unknown time';
  }

  return timestamp.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const buildProductMatcher = (products = []) => {
  const storeProducts = products.filter((product) => product.type === 'product' || !product.type);

  return (recipe) => {
    if (recipe.productId) {
      const directMatch = storeProducts.find((product) => String(product.id) === String(recipe.productId));
      if (directMatch) {
        return directMatch;
      }
    }

    const recipeKeys = [recipe.name, ...(recipe.aliases || [])].map(normalizeMatchKey);

    return storeProducts.find((product) => {
      const productKey = normalizeMatchKey(product.name || product.productName || '');
      return recipeKeys.some((recipeKey) => (
        productKey === recipeKey
        || productKey.includes(recipeKey)
        || recipeKey.includes(productKey)
      ));
    }) || null;
  };
};

const getInitials = (value = '') => value
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();


const IngredientCalculatorPanel = ({
  ingredientBatches = [],
  products = [],
}) => {
  const { generateIngredientCalculatorInsight } = useAI();
  const { session, userRole, isAuthLoading } = useAuth();
  const [recipes, setRecipes] = useState([]);
  const [recipeLoadError, setRecipeLoadError] = useState('');
  const liveIngredientRows = useMemo(() => (
    buildIngredientInputRows(ingredientBatches, recipes)
  ), [ingredientBatches, recipes]);
  const [ingredientRows, setIngredientRows] = useState(liveIngredientRows);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [activeMode, setActiveMode] = useState('all');
  const [historyEntries, setHistoryEntries] = useState(() => loadHistoryEntries());
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showAllProducts, setShowAllProducts] = useState(true);
  const [calculatingMode, setCalculatingMode] = useState('');
  const calculationTimeoutRef = useRef(null);
  const canLoadRecipes = Boolean(session?.access_token) && ['admin', 'staff'].includes(userRole);

  const fetchRecipes = useCallback(async () => {
    if (!session?.access_token) {
      setRecipes([]);
      return [];
    }

    const response = await apiRequest('/api/products/recipes', {}, {
      auth: true,
      accessToken: session.access_token,
    });
    const nextRecipes = Array.isArray(response) ? response : [];
    setRecipes(nextRecipes);
    setRecipeLoadError('');
    return nextRecipes;
  }, [session?.access_token]);

  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    if (!canLoadRecipes) {
      setRecipes([]);
      setRecipeLoadError('');
      return undefined;
    }

    let isActive = true;

    const loadRecipes = async () => {
      try {
        const nextRecipes = await fetchRecipes();
        if (!isActive) {
          return;
        }

        setRecipes(nextRecipes);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setRecipes([]);
        setRecipeLoadError(error.message || 'Unable to load live product recipes.');
      }
    };

    void loadRecipes();

    return () => {
      isActive = false;
    };
  }, [canLoadRecipes, fetchRecipes, isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading || !canLoadRecipes) {
      return undefined;
    }

    return subscribeToDatabaseChanges({
      channelName: `product-recipes-sync-${userRole}`,
      tables: ['product_recipes', 'product_recipe_items'],
      onChange: fetchRecipes,
    });
  }, [canLoadRecipes, fetchRecipes, isAuthLoading, userRole]);

  useEffect(() => {
    setSelectedRecipeId((currentRecipeId) => {
      if (recipes.length === 0) {
        return '';
      }

      return recipes.some((recipe) => recipe.id === currentRecipeId)
        ? currentRecipeId
        : recipes[0].id;
    });
  }, [recipes]);

  useEffect(() => {
    setIngredientRows((currentRows) => {
      if (currentRows.length === 0) {
        return liveIngredientRows;
      }

      const currentRowsByKey = new Map(currentRows.map((row) => [row.key, row]));

      return liveIngredientRows.map((liveRow) => {
        const currentRow = currentRowsByKey.get(liveRow.key);
        if (!currentRow) {
          return liveRow;
        }

        const nextStockQuantity = convertQuantityBetweenUnits(
          liveRow.stockQuantity,
          liveRow.unit,
          currentRow.unit,
        );

        return {
          ...liveRow,
          ...currentRow,
          stockQuantity: nextStockQuantity ?? liveRow.stockQuantity,
        };
      });
    });
  }, [liveIngredientRows]);

  useEffect(() => {
    safeStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyEntries.slice(0, 20)));
  }, [historyEntries]);

  useEffect(() => () => {
    if (calculationTimeoutRef.current) {
      window.clearTimeout(calculationTimeoutRef.current);
      calculationTimeoutRef.current = null;
    }
  }, []);

  const selectedRecipe = useMemo(() => (
    getRecipeById(selectedRecipeId, recipes) || recipes[0] || null
  ), [recipes, selectedRecipeId]);

  const findProductForRecipe = useMemo(() => buildProductMatcher(products), [products]);

  const productResults = useMemo(() => (
    calculateAllRecipeOutputs(ingredientRows, recipes).map((result) => {
      const recipe = getRecipeById(result.recipeId, recipes);
      const matchedProduct = recipe ? findProductForRecipe(recipe) : null;

      return {
        ...result,
        imageUrl: matchedProduct?.imageUrl || matchedProduct?.image || recipe?.imageUrl || '',
        displayName: matchedProduct?.name || matchedProduct?.productName || recipe?.name || result.productName,
      };
    })
  ), [findProductForRecipe, ingredientRows, recipes]);

  const allProductEntries = useMemo(() => {
    const recipesByProductId = new Map(
      recipes
        .filter((recipe) => recipe.productId)
        .map((recipe) => [String(recipe.productId), recipe]),
    );
    const recipesByName = new Map(
      recipes.map((recipe) => [normalizeMatchKey(recipe.productName || recipe.name), recipe]),
    );
    const resultsByRecipeId = new Map(productResults.map((result) => [result.recipeId, result]));
    const storeProducts = products.filter((product) => product.type === 'product' || !product.type);
    const entries = storeProducts
      .map((product, index) => {
        const productName = product.name || product.productName || '';
        const recipe = (product.id && recipesByProductId.get(String(product.id)))
          || recipesByName.get(normalizeMatchKey(productName))
          || null;

        return {
          key: String(product.id || `product-${index}-${normalizeMatchKey(productName)}`),
          name: productName,
          imageUrl: product.imageUrl || product.image || recipe?.imageUrl || '',
          recipe,
          result: recipe ? resultsByRecipeId.get(recipe.id) || null : null,
        };
      })
      .filter((entry) => entry.name);

    const includedRecipeIds = new Set(entries.map((entry) => entry.recipe?.id).filter(Boolean));
    productResults.forEach((result) => {
      if (includedRecipeIds.has(result.recipeId)) return;
      entries.push({
        key: `recipe-${result.recipeId}`,
        name: result.displayName || result.productName,
        imageUrl: result.imageUrl || '',
        recipe: getRecipeById(result.recipeId, recipes),
        result,
      });
    });

    return entries.sort((left, right) => left.name.localeCompare(right.name));
  }, [productResults, products, recipes]);

  const selectedResult = useMemo(() => (
    productResults.find((result) => result.recipeId === selectedRecipe?.id) || null
  ), [productResults, selectedRecipe]);
  const visibleProductEntries = showAllProducts ? allProductEntries : allProductEntries.slice(0, 5);

  const summary = useMemo(() => (
    buildCalculatorSummary(productResults, ingredientRows, recipes)
  ), [ingredientRows, productResults, recipes]);

  const calculatorInsight = useMemo(() => (
    generateIngredientCalculatorInsight({
      summary,
      productResults,
      selectedResult,
      ingredientRows,
    })
  ), [generateIngredientCalculatorInsight, ingredientRows, productResults, selectedResult, summary]);

  const selectedRemainingRows = useMemo(() => {
    if (!selectedResult) {
      return [];
    }

    return [...selectedResult.remainingIngredients]
      .filter((ingredient) => ingredient.usedQuantity > 0 || ingredient.remainingQuantity > 0)
      .sort((left, right) => {
        const leftPriority = left.usedQuantity > 0 ? 0 : 1;
        const rightPriority = right.usedQuantity > 0 ? 0 : 1;

        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return left.ingredientName.localeCompare(right.ingredientName);
      });
  }, [selectedResult]);

  const handleQuantityChange = (ingredientKey, value) => {
    const nextValue = value === '' ? '' : Math.max(0, Number(value) || 0);

    setIngredientRows((currentRows) => currentRows.map((row) => (
      row.key === ingredientKey
        ? { ...row, quantity: nextValue }
        : row
    )));
  };

  const handleUnitChange = (ingredientKey, nextUnitValue) => {
    const nextUnit = normalizeUnitName(nextUnitValue);

    setIngredientRows((currentRows) => currentRows.map((row) => {
      if (row.key !== ingredientKey) {
        return row;
      }

      const convertedQuantity = convertQuantityBetweenUnits(row.quantity, row.unit, nextUnit);
      const convertedStockQuantity = convertQuantityBetweenUnits(row.stockQuantity, row.unit, nextUnit);

      return {
        ...row,
        unit: nextUnit,
        quantity: convertedQuantity ?? row.quantity,
        stockQuantity: convertedStockQuantity ?? row.stockQuantity,
      };
    }));
  };

  const pushHistorySnapshot = (mode) => {
    const entry = createCalculationHistoryEntry({
      mode,
      summary,
      selectedResult,
      results: productResults,
    });

    setHistoryEntries((currentEntries) => [entry, ...currentEntries].slice(0, 20));
  };

  const waitForCalculationFeedback = () => new Promise((resolve) => {
    calculationTimeoutRef.current = window.setTimeout(() => {
      calculationTimeoutRef.current = null;
      resolve();
    }, CALCULATION_LOADING_DELAY_MS);
  });

  const runCalculation = async (mode) => {
    if (calculatingMode) {
      return;
    }

    setCalculatingMode(mode);

    try {
      await waitForCalculationFeedback();
      setActiveMode(mode);
      pushHistorySnapshot(mode);
    } finally {
      setCalculatingMode('');
    }
  };

  const handleCalculateAllProducts = () => {
    void runCalculation('all');
  };

  const handleCalculateSelectedProduct = () => {
    void runCalculation('selected');
  };

  const handleViewAllProducts = () => {
    setActiveMode('all');
    setShowAllProducts((current) => !current);
  };

  const handleResetToInventory = () => {
    setIngredientRows(liveIngredientRows);
  };

  const handleExportReport = () => {
    const csvContent = buildCalculatorCsvReport({
      summary,
      results: productResults,
      selectedResult,
      ingredientRows,
    });
    const dateSuffix = new Date().toISOString().slice(0, 10);

    downloadCsvReport(`ingredient-calculator-report-${dateSuffix}.csv`, csvContent);
  };

  const handleClearHistory = () => {
    setHistoryEntries([]);
  };

  const isCalculating = Boolean(calculatingMode);

  return (
    <section className="ingredient-calculator-panel">
      <div className="ingredient-calculator-panel__header">
        <div className="ingredient-calculator-title-wrap">
          <div>
            <h2>AI Ingredients Calculator</h2>
            <p>Know how many products you can make with your current ingredients.</p>
          </div>
        </div>

        <div className="ingredient-calculator-panel__actions">
          <button type="button" className="ingredient-calculator-panel__history-button" onClick={() => setIsHistoryOpen(true)}>
            <History size={16} /> Calculation History
          </button>
        </div>
      </div>

      <div className="ingredient-calculator-layout">
        <div className="ingredient-calculator-sidebar">
        <aside className="ingredient-calculator-stock-card">
          <div className="ingredient-calculator-card-head">
            <span className="ingredient-calculator-step-icon"><Package size={19} /></span>
            <div className="ingredient-calculator-card-head-copy">
              <h3>1. Enter Available Ingredients</h3>
              <p>Enter the total available quantity of each ingredient in your stock.</p>
            </div>
            <button type="button" className="ingredient-calculator-reset-button" onClick={handleResetToInventory} aria-label="Use live inventory quantities" title="Use Live Inventory">
              <RotateCcw size={15} />
            </button>
          </div>

          <div className="ingredient-calculator-stock-list">
            {ingredientRows.map((ingredient) => (
              <div className="ingredient-calculator-stock-row" key={ingredient.key}>
                <div className="ingredient-calculator-stock-name">
                  <strong>{ingredient.ingredientName}</strong>
                  <small>Stock: {formatCalculatorQuantity(ingredient.stockQuantity, 3)} {ingredient.unit}</small>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  className="ingredient-calculator-input"
                  aria-label={`Available ${ingredient.ingredientName}`}
                  value={ingredient.quantity}
                  onChange={(event) => handleQuantityChange(ingredient.key, event.target.value)}
                />
                <select
                  className="ingredient-calculator-select"
                  aria-label={`${ingredient.ingredientName} unit`}
                  value={ingredient.unit}
                  onChange={(event) => handleUnitChange(ingredient.key, event.target.value)}
                >
                  {CALCULATOR_UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <LoadingButton
            type="button"
            className={`ingredient-calculator-primary-button ${activeMode === 'all' ? 'active' : ''}`}
            onClick={handleCalculateAllProducts}
            isLoading={calculatingMode === 'all'}
            disabled={isCalculating || recipes.length === 0}
          >
            <Calculator size={18} /> Calculate All Products
          </LoadingButton>

          </aside>
          <section className="ingredient-calculator-selection-card">
            <div className="ingredient-calculator-selection-heading">
              <span className="ingredient-calculator-selection-icon"><Flame size={18} /></span>
              <strong>Or calculate for a specific product</strong>
            </div>
            <label htmlFor="ingredient-calculator-product-select">Select a product</label>
            <select
              id="ingredient-calculator-product-select"
              className="ingredient-calculator-select"
              value={selectedRecipeId}
              onChange={(event) => setSelectedRecipeId(event.target.value)}
              disabled={recipes.length === 0}
            >
              {allProductEntries.map((entry) => (
                <option
                  key={entry.key}
                  value={entry.recipe?.id || `unavailable-${entry.key}`}
                  disabled={!entry.recipe}
                >
                  {entry.name}{entry.recipe ? '' : ' - recipe needed'}
                </option>
              ))}
            </select>

            <LoadingButton
              type="button"
              className={`ingredient-calculator-secondary-button ${activeMode === 'selected' ? 'active' : ''}`}
              onClick={handleCalculateSelectedProduct}
              isLoading={calculatingMode === 'selected'}
              disabled={isCalculating || recipes.length === 0}
            >
              <Sparkles size={18} /> Calculate Selected Product
            </LoadingButton>
          </section>
        </div>

        <div className="ingredient-calculator-results">
          {isCalculating && (
            <div className="ingredient-calculator-results__loading" aria-live="polite">
              <div className="ingredient-calculator-results__loading-card">
                <Calculator size={24} />
                <strong>
                  {calculatingMode === 'selected'
                    ? 'Calculating selected product...'
                    : 'Calculating all products...'}
                </strong>
                <span>
                  Reviewing your ingredient inputs and refreshing the calculator output.
                </span>
              </div>
            </div>
          )}

          <section className="ingredient-calculator-summary-card">
            <div className="ingredient-calculator-card-head">
              <div>
                <h3>2. Calculation Summary (Configured Recipes)</h3>
                <p>Here is what you can make based on your current ingredient inputs.</p>
              </div>
            </div>

            <div className="ingredient-calculator-summary-grid">
              <article className="ingredient-calculator-summary-item ingredient-calculator-summary-item--purple">
                <span className="ingredient-calculator-summary-icon"><Package size={20} /></span>
                <span className="ingredient-calculator-summary-label">Total Products Can Be Made</span>
                <strong>{summary.totalProducts}</strong>
                <small>across all products</small>
              </article>
              <article className="ingredient-calculator-summary-item ingredient-calculator-summary-item--green">
                <span className="ingredient-calculator-summary-icon"><Package size={20} /></span>
                <span className="ingredient-calculator-summary-label">Total Quantity (All Products)</span>
                <strong>{formatCalculatorQuantity(summary.totalQuantity)}</strong>
                <small>units</small>
              </article>
              <article className="ingredient-calculator-summary-item ingredient-calculator-summary-item--amber">
                <span className="ingredient-calculator-summary-icon"><BarChart3 size={20} /></span>
                <span className="ingredient-calculator-summary-label">Ingredient Usage (Average)</span>
                <strong>{formatCalculatorPercent(summary.averageUsagePercent)}</strong>
                <small>(Average)</small>
              </article>
              <article className="ingredient-calculator-summary-item ingredient-calculator-summary-item--blue">
                <span className="ingredient-calculator-summary-icon"><Sparkles size={20} /></span>
                <span className="ingredient-calculator-summary-label">Ingredients Used (of {summary.trackedIngredients})</span>
                <strong>{summary.ingredientsUsed}</strong>
                <small>ingredients</small>
              </article>
            </div>
          </section>

          <div className="ingredient-calculator-results-grid">
            <section className="ingredient-calculator-table-card">
              <div className="ingredient-calculator-card-head">
                <div>
                  <h3>3. All Products You Can Make</h3>
                  <p>Saved recipes show estimated output. Products without a recipe are marked below.</p>
                </div>
                {allProductEntries.length > 5 && (
                  <button
                    type="button"
                    className="ingredient-calculator-panel__table-action"
                    onClick={handleViewAllProducts}
                    aria-expanded={showAllProducts}
                  >
                    {showAllProducts ? 'Show Fewer' : 'View All Products'}
                  </button>
                )}
              </div>

              <div className="ingredient-calculator-product-list">
                {allProductEntries.length === 0 ? (
                  <div className="ingredient-calculator-product-empty">
                    {recipeLoadError || 'No products are available for the calculator yet.'}
                  </div>
                ) : visibleProductEntries.map((entry) => {
                  const result = entry.result;
                  const recipe = entry.recipe;
                  const initials = getInitials(entry.name);

                  const rowContent = (
                    <>
                      <span className="ingredient-calculator-product-avatar" style={{ background: recipe?.accent || '#f97316' }}>
                        {entry.imageUrl ? <img src={entry.imageUrl} alt="" /> : <span>{initials}</span>}
                      </span>
                      <span className="ingredient-calculator-product-copy">
                        <strong>{entry.name}</strong>
                        {!recipe && <small>Recipe not configured yet</small>}
                      </span>
                      <span className={`ingredient-calculator-product-quantity${result ? '' : ' ingredient-calculator-product-quantity--missing'}`}>
                        <strong>{result ? formatCalculatorQuantity(result.quantity) : 'Recipe needed'}</strong>
                        <small>{result ? result.outputLabel.split(/\s+/)[0] : 'setup required'}</small>
                      </span>
                      {recipe && <ChevronRight size={17} className="ingredient-calculator-product-chevron" />}
                      {!recipe && <span aria-hidden="true" />}
                    </>
                  );

                  return recipe ? (
                    <button
                      type="button"
                      key={entry.key}
                      className={`ingredient-calculator-product-row${recipe.id === selectedRecipeId ? ' selected' : ''}`}
                      onClick={() => setSelectedRecipeId(recipe.id)}
                      aria-pressed={recipe.id === selectedRecipeId}
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div className="ingredient-calculator-product-row ingredient-calculator-product-row--unconfigured" key={entry.key}>
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            </section>

            <details className="ingredient-calculator-selected-card">
              <summary>
                <h3>3. Selected Product Calculation</h3>
                <ChevronDown size={20} aria-hidden="true" />
              </summary>

              <div className="ingredient-calculator-selected-body">
              {selectedResult && (
                <>
                  <div className="ingredient-calculator-selected-product">
                    <span className="ingredient-calculator-product-avatar ingredient-calculator-product-avatar--large" style={{ background: selectedResult.accent }}>
                      {selectedResult.imageUrl ? (
                        <img src={selectedResult.imageUrl} alt={selectedResult.displayName || selectedResult.productName} />
                      ) : (
                        <span>{getInitials(selectedResult.displayName || selectedResult.productName)}</span>
                      )}
                    </span>
                    <div>
                      <strong>{selectedResult.displayName || selectedResult.productName}</strong>
                      <small>{selectedResult.outputLabel}</small>
                    </div>
                  </div>

                  <div className="ingredient-calculator-selected-total">
                    <span>You can make</span>
                    <strong>{formatCalculatorQuantity(selectedResult.quantity)}</strong>
                    <small>{selectedResult.outputLabel}</small>
                  </div>

                  <div className="ingredient-calculator-detail-block">
                    <h4>Recipe Requirement per 1 unit</h4>
                    <div className="ingredient-calculator-list">
                      {selectedResult.requirements.map((requirement) => (
                        <div key={requirement.ingredientKey} className="ingredient-calculator-list-row">
                          <span>{requirement.ingredientName}</span>
                          <strong>{formatCalculatorQuantity(requirement.amount, 3)} {requirement.unit}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ingredient-calculator-detail-block">
                    <h4>Remaining Ingredients After Production</h4>
                    <div className="ingredient-calculator-list ingredient-calculator-list--scroll">
                      {selectedRemainingRows.map((ingredient) => (
                        <div key={ingredient.key} className="ingredient-calculator-list-row">
                          <span>
                            {ingredient.ingredientName}
                            {ingredient.usedQuantity > 0 && (
                              <small>Used {formatCalculatorQuantity(ingredient.usedQuantity, 3)} {ingredient.unit}</small>
                            )}
                          </span>
                          <strong>{formatCalculatorQuantity(ingredient.remainingQuantity, 3)} {ingredient.unit}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              </div>
            </details>
          </div>

          <div className="ingredient-calculator-footer-grid">
            <article className="ingredient-calculator-note-card">
              <div className="ingredient-calculator-note-head">
                <Info size={18} />
                <strong>Note</strong>
              </div>
              <p>
                Quantities are based on standard recipes and may vary depending on actual
                preparation size and waste.
              </p>
              <p>
                To increase producible quantity, add more of the limiting ingredients.You can also download the full report.
              </p>
              <div className="ingredient-calculator-note-actions">
                <button type="button" className="ingredient-calculator-note-button" onClick={handleExportReport}>
                  <Download size={15} /> Export Report
                </button>
              </div>
            </article>

            <article className={`ingredient-calculator-ai-card ingredient-calculator-ai-card--${calculatorInsight.status || 'neutral'}`}>
              <div className="ingredient-calculator-note-head">
                <Sparkles size={18} />
                <strong>{calculatorInsight.title || 'AI-Powered Insight'}</strong>
              </div>
              <p>{calculatorInsight.message}</p>
              <div className="ingredient-calculator-ai-suggestions">
                {calculatorInsight.suggestions?.map((suggestion) => (
                  <div key={suggestion} className="ingredient-calculator-ai-pill">
                    {suggestion}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </div>

      {isHistoryOpen && (
        <div className="ingredient-calculator-modal" onClick={() => setIsHistoryOpen(false)}>
          <div className="ingredient-calculator-modal__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="ingredient-calculator-modal__header">
              <div>
                <h3>Calculation History</h3>
                <p>Saved snapshots from Calculate All Products or Calculate Selected Product.</p>
              </div>

              <button type="button" className="ingredient-calculator-modal__close" onClick={() => setIsHistoryOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="ingredient-calculator-modal__toolbar">
              <button type="button" className="ingredient-calculator-panel__ghost-button" onClick={handleClearHistory}>
                <RotateCcw size={16} /> Clear History
              </button>
            </div>

            <div className="ingredient-calculator-history-list">
              {historyEntries.length === 0 ? (
                <div className="ingredient-calculator-history-empty">
                  <Clock3 size={18} />
                  <span>No calculation snapshots saved yet.</span>
                </div>
              ) : (
                historyEntries.map((entry) => (
                  <article key={entry.id} className="ingredient-calculator-history-item">
                    <div className="ingredient-calculator-history-item__head">
                      <strong>{entry.mode === 'selected' ? 'Selected Product Snapshot' : 'All Products Snapshot'}</strong>
                      <span>{formatHistoryDate(entry.createdAt)}</span>
                    </div>

                    <div className="ingredient-calculator-history-item__meta">
                      <span>{entry.summary.totalProducts} products</span>
                      <span>{formatCalculatorQuantity(entry.summary.totalQuantity)} total quantity</span>
                      <span>{formatCalculatorPercent(entry.summary.averageUsagePercent)} avg usage</span>
                    </div>

                    {entry.selectedProductName && (
                      <div className="ingredient-calculator-history-item__detail">
                        <strong>{entry.selectedProductName}</strong>
                        <span>
                          {formatCalculatorQuantity(entry.selectedProductQuantity)} max output
                          {entry.limitingIngredientName ? ` | Limited by ${entry.limitingIngredientName}` : ''}
                        </span>
                      </div>
                    )}

                    {entry.topProducts?.length > 0 && (
                      <div className="ingredient-calculator-history-item__top-products">
                        {entry.topProducts.map((product) => (
                          <div key={`${entry.id}-${product.productName}`} className="ingredient-calculator-history-pill">
                            {product.productName}: {formatCalculatorQuantity(product.quantity)}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default IngredientCalculatorPanel;
