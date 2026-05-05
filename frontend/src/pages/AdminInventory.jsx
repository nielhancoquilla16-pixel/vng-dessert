import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Clock3,
  PackagePlus,
  Pencil,
  Search,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { useInventoryAlerts } from '../context/InventoryAlertContext';
import {
  formatInventoryDate,
  getInventoryBatchStatus,
} from '../utils/inventoryBatches';
import LoadingButton from '../components/LoadingButton';
import IngredientCalculatorPanel from '../components/IngredientCalculatorPanel';
import './AdminInventory.css';

const STATUS_FILTERS = [
  { key: 'all', label: 'All Batches' },
  { key: 'fresh', label: 'Fresh' },
  { key: 'expiring soon', label: 'Expiring Soon' },
  { key: 'expired', label: 'Expired' },
];

const STATUS_ICON_BY_KEY = {
  fresh: CheckCircle2,
  'expiring soon': Clock3,
  expired: AlertTriangle,
  'no date': CalendarClock,
};

const INVENTORY_VIEWS = {
  products: {
    key: 'products',
    label: 'Finished Products',
    inventoryType: 'product',
    title: 'Inventory Management',
    addLabel: 'Add Product Batch',
    inputLabel: 'Product name',
    searchPlaceholder: 'Search finished products or batch IDs',
    groupLabel: 'Grouped by Product',
    summaryLabel: 'grouped products',
  },
  ingredients: {
    key: 'ingredients',
    label: 'Ingredients',
    inventoryType: 'ingredient',
    title: 'Ingredient Inventory',
    description: 'Let both admin and staff manage ingredient batches and stock details in the same inventory area.',
    addLabel: 'Add Ingredient Batch',
    inputLabel: 'Ingredient name',
    searchPlaceholder: 'Search ingredients or batch IDs',
    groupLabel: 'Grouped by Ingredient',
    summaryLabel: 'grouped ingredients',
  },
};

const getTodayInputValue = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createBatchId = (type = 'product') => (
  `${type === 'ingredient' ? 'ING' : 'TRAY'}-${Date.now().toString().slice(-6)}`
);

const createBatchDraft = (type = 'product', name = '') => ({
  productName: name,
  batchId: createBatchId(type),
  quantity: '',
  unit: type === 'ingredient' ? 'pcs' : 'pcs',
  dateCreated: getTodayInputValue(),
  expirationDate: '',
});

const createFinishedProductDraft = (product) => ({
  productName: product.productName || product.name || '',
  batchId: buildProductSyncBatchId(product.productId || product.id),
  quantity: String(Number(product.quantity ?? product.stock) || 0),
  unit: 'pcs',
  dateCreated: product.dateCreated || '',
  expirationDate: product.expirationDate || '',
});

const normalizeProductNameKey = (value = '') => String(value ?? '').trim().toLowerCase();

const buildProductSyncBatchId = (productId) => {
  const compactId = String(productId || '').replace(/-/g, '').slice(0, 8).toUpperCase();
  return compactId ? `TRAY-${compactId}` : '';
};

const getPrimaryProductBatch = (productId, batches = []) => {
  const expectedBatchId = buildProductSyncBatchId(productId);
  return batches.find((batch) => String(batch.batchId || '').toUpperCase() === expectedBatchId)
    || batches[0]
    || null;
};

const getGroupSummary = (items = []) => {
  const datedItems = items.filter((item) => item.expirationDate);
  if (datedItems.length === 0) {
    return 'No expiration date set yet';
  }

  const soonestExpiry = datedItems
    .slice()
    .sort((left, right) => String(left.expirationDate).localeCompare(String(right.expirationDate)))[0];

  if (soonestExpiry.status === 'expired') {
    return `Earliest expiry was ${formatInventoryDate(soonestExpiry.expirationDate)}`;
  }

  return `Soonest expiry ${formatInventoryDate(soonestExpiry.expirationDate)}`;
};

const formatPreviewStatus = (status) => {
  if (status === 'fresh') return 'Fresh';
  if (status === 'expiring soon') return 'Expiring Soon';
  if (status === 'expired') return 'Expired';
  return 'No Date';
};

const buildSummary = (items = []) => items.reduce((summary, item) => {
  summary.total += 1;
  summary.totalQuantity += Number(item.quantity) || 0;
  summary[item.status] += 1;
  return summary;
}, {
  total: 0,
  totalQuantity: 0,
  fresh: 0,
  'expiring soon': 0,
  expired: 0,
  'no date': 0,
});

const getFinishedProductTone = (product) => (
  product.status === 'no date' && Number(product.quantity) > 0
    ? 'fresh'
    : product.statusTone
);

const getFinishedProductLabel = (product) => {
  if (product.status === 'expired') return 'Expired';
  if (product.status === 'expiring soon') return 'Expiring Soon';
  return 'Active';
};

const getIngredientTone = (item) => (
  item.status === 'expired'
    ? 'danger'
    : item.status === 'expiring soon'
      ? 'warning'
      : 'fresh'
);

const getIngredientLabel = (item) => {
  if (item.status === 'expired') return 'Expired';
  if (item.status === 'expiring soon') return 'Expiring Soon';
  return 'Active';
};

const getIngredientFilterStatus = (item) => (
  item.status === 'expired'
    ? 'expired'
    : item.status === 'expiring soon'
      ? 'expiring soon'
      : 'fresh'
);

const AdminInventory = () => {
  const { userRole } = useAuth();
  const {
    products,
    addInventoryItem,
    editInventoryItem,
    deleteInventoryItem,
    updateProductStock,
    updateFinishedProductInventory,
  } = useProducts();
  const {
    warningDays,
    inventoryBatches,
    activeAlerts,
    alertHistory,
    clearAlertHistory,
  } = useInventoryAlerts();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState('products');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState('');
  const [editingProductId, setEditingProductId] = useState('');
  const [editorType, setEditorType] = useState('product');
  const [draftBatch, setDraftBatch] = useState(() => createBatchDraft());
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const focusId = searchParams.get('focus') || '';
  const isAdminView = userRole === 'admin';
  const currentView = INVENTORY_VIEWS[viewMode];
  const productOptions = products
    .filter((item) => item.type === 'product' || !item.type)
    .map((product) => product.name)
    .filter(Boolean);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  const productBatches = useMemo(() => (
    inventoryBatches.filter((item) => item.inventoryType === 'product')
  ), [inventoryBatches]);
  const ingredientBatches = useMemo(() => (
    inventoryBatches.filter((item) => item.inventoryType !== 'product')
  ), [inventoryBatches]);

  // For products view: show all products with inventory data merged
  const aggregatedProducts = useMemo(() => {
    if (viewMode !== 'products') return [];

    const inventoryByProductId = {};
    const inventoryByProductName = {};
    productBatches.forEach((batch) => {
      if (batch.productId) {
        if (!inventoryByProductId[batch.productId]) {
          inventoryByProductId[batch.productId] = [];
        }
        inventoryByProductId[batch.productId].push(batch);
      }

      const nameKey = normalizeProductNameKey(batch.productName || 'Unlabeled');
      if (!inventoryByProductName[nameKey]) {
        inventoryByProductName[nameKey] = [];
      }
      inventoryByProductName[nameKey].push(batch);
    });

    return products
      .filter((p) => p.type === 'product' || !p.type)
      .map((product) => {
        const productName = product.productName || product.name;
        const inventoryBatches = inventoryByProductId[product.id]
          || inventoryByProductName[normalizeProductNameKey(productName)]
          || [];
        const primaryBatch = getPrimaryProductBatch(product.id, inventoryBatches);
        const sharedStock = Number(product.stock) || 0;

        return {
          id: primaryBatch?.id || product.id,
          productId: product.id,
          productName,
          imageUrl: primaryBatch?.imageUrl || product.imageUrl || product.image,
          category: primaryBatch?.category || product.category,
          quantity: sharedStock,
          stock: sharedStock,
          batches: inventoryBatches,
          batchId: primaryBatch?.batchId || buildProductSyncBatchId(product.id),
          status: primaryBatch?.status || 'no date',
          statusTone: primaryBatch?.statusTone || 'neutral',
          dateCreated: primaryBatch?.dateCreated || product.dateCreated,
          expirationDate: primaryBatch?.expirationDate || product.expirationDate,
          inventoryId: primaryBatch?.id || '',
        };
      });
  }, [products, productBatches, viewMode]);

  const batchesByView = {
    products: viewMode === 'products' ? aggregatedProducts : [],
    ingredients: ingredientBatches,
  };

  const visibleBatches = batchesByView[viewMode] || [];
  const visibleSummary = viewMode === 'products' 
    ? {
        total: aggregatedProducts.length,
        totalQuantity: aggregatedProducts.reduce((sum, p) => sum + p.quantity, 0),
        fresh: aggregatedProducts.filter(p => p.status === 'fresh').length,
        'expiring soon': aggregatedProducts.filter(p => p.status === 'expiring soon').length,
        expired: aggregatedProducts.filter(p => p.status === 'expired').length,
        'no date': aggregatedProducts.filter(p => p.status === 'no date').length,
      }
    : buildSummary(ingredientBatches);
  const visibleGroupCount = viewMode === 'products' ? aggregatedProducts.length : new Set(ingredientBatches.map((item) => item.productName)).size;

  useEffect(() => {
    if (!focusId) {
      return;
    }

    const focusedItem = inventoryBatches.find((item) => item.id === focusId);
    if (focusedItem?.inventoryType === 'ingredient') {
      setViewMode('ingredients');
      return;
    }

    if (focusedItem?.inventoryType === 'product') {
      setViewMode('products');
    }
  }, [focusId, inventoryBatches]);

  const filteredBatches = aggregatedProducts.filter((product) => {
    if (product.id === focusId) {
      return true;
    }

    const matchesStatus = statusFilter === 'all' || product.status === statusFilter;
    const matchesSearch = !normalizedSearchTerm || product.productName
      .toLowerCase()
      .includes(normalizedSearchTerm);

    return matchesStatus && matchesSearch;
  });

  const previewStatus = getInventoryBatchStatus(
    {
      dateCreated: draftBatch.dateCreated,
      expirationDate: draftBatch.expirationDate,
    },
    warningDays,
  );

  useEffect(() => {
    if (!focusId) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const target = document.querySelector(`[data-inventory-id="${focusId}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);

    return () => window.clearTimeout(timer);
  }, [focusId, filteredBatches.length]);

  const openCreateModal = (type = currentView.inventoryType, name = '') => {
    setEditingBatchId('');
    setEditingProductId('');
    setEditorType(type);
    setDraftBatch(createBatchDraft(type, name));
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingBatchId(item.id);
    setEditingProductId('');
    setEditorType(item.inventoryType || 'product');
    setDraftBatch({
      productName: item.productName,
      batchId: item.batchId,
      quantity: String(item.quantity ?? 0),
      unit: item.unit || 'pcs',
      dateCreated: item.dateCreated || '',
      expirationDate: item.expirationDate || '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditProductModal = (product) => {
    setEditingBatchId('');
    setEditingProductId(product.productId || product.id);
    setEditorType('product');
    setDraftBatch(createFinishedProductDraft(product));
    setFormError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBatchId('');
    setEditingProductId('');
    setEditorType(currentView.inventoryType);
    setDraftBatch(createBatchDraft(currentView.inventoryType));
    setFormError('');
  };

  const handleChangeView = (nextView) => {
    setViewMode(nextView);
    setSearchTerm('');
    setStatusFilter('all');

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('focus');
    setSearchParams(nextParams);
  };

  const focusBatch = (itemId) => {
    const focusedItem = inventoryBatches.find((item) => item.id === itemId);
    if (focusedItem?.inventoryType === 'ingredient') {
      setViewMode('ingredients');
    } else {
      setViewMode('products');
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('focus', itemId);
    setSearchParams(nextParams);
  };

  const handleDeleteBatch = async (item) => {
    const confirmed = window.confirm(`Delete batch ${item.batchId} for ${item.productName}?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteInventoryItem(item.id);
    } catch (error) {
      window.alert(error.message || 'Unable to delete this batch right now.');
    }
  };

  const handleEditProductBatch = (product) => {
    openEditProductModal(product);
  };

  const handleQuickAdjustment = async (item, adjustment) => {
    try {
      if (Array.isArray(item.batches)) {
        await updateProductStock(item.productId || item.id, adjustment, {
          dateCreated: item.dateCreated || null,
          expirationDate: item.expirationDate || null,
        });
        return;
      }

      if (item.id) {
        const itemQuantity = item.quantity || 0;
        const newQuantity = Math.max(0, itemQuantity + adjustment);

        await editInventoryItem({
          ...item,
          quantity: newQuantity,
        });
      }
    } catch (error) {
      window.alert(error.message || 'Unable to adjust stock right now.');
    }
  };

  const getStockPercentage = (quantity, maxThreshold = 200) => {
    return Math.min((quantity / maxThreshold) * 100, 100);
  };

  const handleSaveBatch = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError('');

    try {
      const payload = {
        ...draftBatch,
        quantity: Math.max(0, Number(draftBatch.quantity) || 0),
      };

      if (!payload.productName.trim() || !payload.batchId.trim()) {
        setFormError(`${editorType === 'product' ? 'Product' : 'Ingredient'} name and Batch/Tray ID are required.`);
        setIsSaving(false);
        return;
      }

      if (editorType === 'product') {
        if (!editingProductId) {
          throw new Error('Product not found.');
        }

        await updateFinishedProductInventory(editingProductId, {
          stock: payload.quantity,
          dateCreated: payload.dateCreated || null,
          expirationDate: payload.expirationDate || null,
        });
      } else if (editingBatchId) {
        await editInventoryItem({
          id: editingBatchId,
          ...payload,
        });
      } else {
        await addInventoryItem(payload);
      }

      closeModal();
    } catch (error) {
      setFormError(error.message || 'Unable to save the batch right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const isEditingRecord = editorType === 'product'
    ? Boolean(editingProductId)
    : Boolean(editingBatchId);

  return (
    <div className="inventory-batches-page">
      <section className="inventory-batches-hero">
        <div className="inventory-hero-topbar">
          <div className="inventory-batches-hero-copy">
            <span className="inventory-batches-eyebrow">Inventory Management</span>
            <h1>{currentView.title}</h1>
          </div>

          <div className="inventory-view-switch" role="tablist" aria-label="Inventory view">
            {Object.values(INVENTORY_VIEWS).map((view) => (
              <button
                key={view.key}
                type="button"
                className={`inventory-view-button ${viewMode === view.key ? 'active' : ''}`}
                onClick={() => handleChangeView(view.key)}
              >
                {view.label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'ingredients' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="inventory-primary-button"
              onClick={() => openCreateModal(currentView.inventoryType)}
            >
              <PackagePlus size={18} /> {currentView.addLabel}
            </button>
          </div>
        )}
      </section>

      {viewMode === 'ingredients' && (
        <IngredientCalculatorPanel
          ingredientBatches={ingredientBatches}
          products={products}
        />
      )}

      <section className="inventory-toolbar-card">
        <div className="admin-filters inventory-status-filters">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-pill ${statusFilter === filter.key ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </section>

      <section className="inventory-group-list">
        {viewMode === 'products' && filteredBatches.length === 0 ? (
          <div className="inventory-empty-state">
            <ShieldAlert size={24} />
            <div>
              <strong>No products match your current filters.</strong>
              <span>Try another search term or add a new product to start tracking it here.</span>
            </div>
          </div>
        ) : viewMode === 'ingredients' && ingredientBatches.length === 0 ? (
          <div className="inventory-empty-state">
            <ShieldAlert size={24} />
            <div>
              <strong>No ingredient batches match your current filters.</strong>
              <span>Try another search term or add a new ingredient batch to start tracking it here.</span>
            </div>
          </div>
        ) : (
          <div className="inventory-table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>IMAGE</th>
                  <th>{viewMode === 'products' ? 'PRODUCT' : 'INGREDIENT'}</th>
                  <th>{viewMode === 'products' ? 'CATEGORY' : 'UNIT'}</th>
                  <th>STOCK LEVEL</th>
                  <th>COUNT</th>
                  <th>STATUS</th>
                  <th>EXPIRATION DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {viewMode === 'products' 
                  ? filteredBatches.map((product) => {
                      const stockPercentage = getStockPercentage(product.quantity);
                      const productTone = getFinishedProductTone(product);
                      const productStatusLabel = getFinishedProductLabel(product);

                      return (
                        <tr
                          key={product.id}
                          className={`inventory-table-row inventory-table-row--${productTone}`}
                          data-inventory-id={product.inventoryId || product.id}
                        >
                          <td className="inventory-table-image">
                            {product.imageUrl ? (
                              <img 
                                src={product.imageUrl} 
                                alt={product.productName}
                                style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#94a3b8' }}>
                                No image
                              </div>
                            )}
                          </td>
                          <td className="inventory-table-name">
                            <div className="inventory-table-name-content">
                              <span className="inventory-table-icon">●</span>
                              <div>
                                <strong>{product.productName}</strong>
                                {product.status !== 'fresh' && product.expirationDate ? (
                                  <small style={{ color: product.status === 'expired' ? '#dc2626' : '#f59e0b' }}>
                                    Expiry: {product.expirationDate}
                                  </small>
                                ) : (
                                  product.dateCreated && <small>{product.dateCreated}</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="inventory-table-unit">{product.category || '-'}</td>
                          <td className="inventory-table-stock">
                            <div className="inventory-stock-bar-container">
                              <div 
                                className={`inventory-stock-bar inventory-stock-bar--${productTone}`}
                                style={{ width: `${stockPercentage}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="inventory-table-count">{product.quantity}</td>
                          <td className="inventory-table-status">
                            <span className={`inventory-status-badge inventory-status-badge--${productTone}`}>
                              {productStatusLabel}
                            </span>
                          </td>
                          <td className="inventory-table-expiration">
                            {product.expirationDate ? (
                              <span style={{ fontSize: '0.875rem', color: product.status === 'expired' ? '#dc2626' : product.status === 'expiring soon' ? '#f59e0b' : '#64748b' }}>
                                {product.expirationDate}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>No Date</span>
                            )}
                          </td>
                          <td className="inventory-table-actions">
                            <div className="inventory-quick-actions">
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--edit"
                                onClick={() => handleEditProductBatch(product)}
                                title="Edit product batch"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--decrease"
                                onClick={() => handleQuickAdjustment(product, -5)}
                                title="Decrease by 5"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--increase"
                                onClick={() => handleQuickAdjustment(product, +10)}
                                title="Increase by 10"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--increase"
                                onClick={() => handleQuickAdjustment(product, +25)}
                                title="Increase by 25"
                              >
                                +25
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  : ingredientBatches
                    .filter((item) => {
                      const matchesStatus = statusFilter === 'all' || getIngredientFilterStatus(item) === statusFilter;
                      const matchesSearch = !normalizedSearchTerm || `${item.productName} ${item.batchId}`
                        .toLowerCase()
                        .includes(normalizedSearchTerm);
                      return matchesStatus && matchesSearch;
                    })
                    .map((item) => {
                      const stockPercentage = getStockPercentage(item.quantity);
                      const ingredientTone = getIngredientTone(item);
                      const ingredientStatusLabel = getIngredientLabel(item);

                      return (
                        <tr
                          key={item.id}
                          className={`inventory-table-row inventory-table-row--${ingredientTone}`}
                          data-inventory-id={item.id}
                        >
                          <td className="inventory-table-image">
                            {item.imageUrl ? (
                              <img 
                                src={item.imageUrl} 
                                alt={item.productName}
                                style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover' }}
                              />
                            ) : (
                              <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#94a3b8' }}>
                                No image
                              </div>
                            )}
                          </td>
                          <td className="inventory-table-name">
                            <div className="inventory-table-name-content">
                              <span className="inventory-table-icon">●</span>
                              <div>
                                <strong>{item.productName}</strong>
                                {item.status !== 'fresh' && item.expirationDate ? (
                                  <small style={{ color: item.status === 'expired' ? '#dc2626' : '#f59e0b' }}>
                                    Expiry: {item.expirationDate}
                                  </small>
                                ) : (
                                  <small>{item.batchId}</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="inventory-table-unit">{item.unit || 'pcs'}</td>
                          <td className="inventory-table-stock">
                            <div className="inventory-stock-bar-container">
                              <div 
                                className={`inventory-stock-bar inventory-stock-bar--${ingredientTone}`}
                                style={{ width: `${stockPercentage}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="inventory-table-count">{item.quantity}</td>
                          <td className="inventory-table-status">
                            <span className={`inventory-status-badge inventory-status-badge--${ingredientTone}`}>
                              {ingredientStatusLabel}
                            </span>
                          </td>
                          <td className="inventory-table-expiration">
                            {item.expirationDate ? (
                              <span style={{ fontSize: '0.875rem', color: item.status === 'expired' ? '#dc2626' : item.status === 'expiring soon' ? '#f59e0b' : '#64748b' }}>
                                {item.expirationDate}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.875rem', color: '#cbd5e1' }}>No Date</span>
                            )}
                          </td>
                          <td className="inventory-table-actions">
                            <div className="inventory-quick-actions">
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--delete"
                                onClick={() => handleDeleteBatch(item)}
                                title="Delete ingredient batch"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--decrease"
                                onClick={() => handleQuickAdjustment(item, -5)}
                                title="Decrease by 5"
                              >
                                -5
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--increase"
                                onClick={() => handleQuickAdjustment(item, +10)}
                                title="Increase by 10"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                className="inventory-quick-btn inventory-quick-btn--increase"
                                onClick={() => handleQuickAdjustment(item, +25)}
                                title="Increase by 25"
                              >
                                +25
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content inventory-batch-modal" onClick={(event) => event.stopPropagation()}>
            <div className="inventory-modal-head">
              <div>
                <span className="inventory-panel-kicker">{isEditingRecord ? 'Update Batch' : 'Create Batch'}</span>
                <h2>
                  {editorType === 'product'
                    ? 'Edit finished product stock'
                    : isEditingRecord
                      ? 'Edit inventory batch'
                      : 'Add ingredient batch'}
                </h2>
              </div>
              <button type="button" className="inventory-icon-button" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveBatch} className="inventory-batch-form">
              <div className="inventory-form-grid">
                <div className="modal-form-group">
                  <label htmlFor="inventory-product-name">{editorType === 'product' ? 'Product name' : 'Ingredient name'}</label>
                  <input
                    id="inventory-product-name"
                    list={undefined}
                    className="modal-input"
                    value={draftBatch.productName}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, productName: event.target.value }))}
                    placeholder={editorType === 'product' ? 'Select or type a product' : 'Type an ingredient name'}
                    readOnly={editorType === 'product'}
                    required
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="inventory-batch-id">Batch / Tray ID</label>
                  <input
                    id="inventory-batch-id"
                    className="modal-input"
                    value={draftBatch.batchId}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, batchId: event.target.value.toUpperCase() }))}
                    placeholder={editorType === 'product' ? 'TRAY-001' : 'ING-001'}
                    readOnly={editorType === 'product'}
                    required
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="inventory-quantity">Quantity</label>
                  <input
                    id="inventory-quantity"
                    type="number"
                    min="0"
                    className="modal-input"
                    value={draftBatch.quantity}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, quantity: event.target.value }))}
                    placeholder="0"
                    required
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="inventory-unit">Unit</label>
                  <input
                    id="inventory-unit"
                    list="inventory-unit-options"
                    className="modal-input"
                    value={draftBatch.unit}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, unit: event.target.value }))}
                    placeholder="pcs"
                    readOnly={editorType === 'product'}
                  />
                  <datalist id="inventory-unit-options">
                    <option value="pcs" />
                    <option value="trays" />
                    <option value="boxes" />
                    <option value="packs" />
                    <option value="kg" />
                    <option value="g" />
                    <option value="ml" />
                    <option value="liters" />
                  </datalist>
                </div>

                <div className="modal-form-group">
                  <label htmlFor="inventory-date-created">Date created</label>
                  <input
                    id="inventory-date-created"
                    type="date"
                    className="modal-input"
                    value={draftBatch.dateCreated}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, dateCreated: event.target.value }))}
                  />
                </div>

                <div className="modal-form-group">
                  <label htmlFor="inventory-expiration-date">Expiration date</label>
                  <input
                    id="inventory-expiration-date"
                    type="date"
                    className="modal-input"
                    value={draftBatch.expirationDate}
                    onChange={(event) => setDraftBatch((current) => ({ ...current, expirationDate: event.target.value }))}
                  />
                </div>
              </div>

              <div className="inventory-form-status-preview">
                <span>Status preview</span>
                <strong>{formatPreviewStatus(previewStatus)}</strong>
                <small>
                  {editorType === 'product'
                    ? `Status updates automatically from the current date. Finished products use the ${warningDays}-day warning window.`
                    : 'Status updates automatically from the current date. Ingredient batches can keep dates for tracking, while admin popup alerts stay focused on finished products.'}
                </small>
              </div>

              {formError && <div className="inventory-form-error">{formError}</div>}

              <div className="inventory-modal-actions">
                <button type="button" className="inventory-secondary-button" onClick={closeModal}>
                  Cancel
                </button>
                <LoadingButton type="submit" className="inventory-primary-button" isLoading={isSaving}>
                  {isEditingRecord ? 'Save Changes' : 'Create Batch'}
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInventory;
