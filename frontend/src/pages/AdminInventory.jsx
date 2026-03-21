import React, { useState } from 'react';
import { CheckSquare, AlertTriangle, XCircle, Plus, X } from 'lucide-react';
import { useProducts } from '../context/ProductContext';
import './AdminInventory.css';

const getProductStatus = (stock) => {
  if (stock <= 0) return 'out';
  if (stock <= 10) return 'low';
  return 'active';
};

const getInventoryStatus = (stock) => {
  if (stock <= 0) return 'out of stock';
  if (stock <= 10) return 'low stock';
  return 'in stock';
};

const AdminInventory = () => {
  const {
    products,
    inventoryItems,
    editProduct,
    addInventoryItem,
    editInventoryItem,
  } = useProducts();
  const [viewMode, setViewMode] = useState('products');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newIngredient, setNewIngredient] = useState({ name: '', stock: '', unit: 'pcs' });

  const isProductsView = viewMode === 'products';
  const filteredItems = isProductsView
    ? products.filter((item) => item.type === 'product' || !item.type)
    : inventoryItems;

  const handleAdjustStock = async (item, delta) => {
    const nextStock = Math.max(0, Number(item.stock) + delta);

    if (isProductsView) {
      await editProduct({
        ...item,
        stock: nextStock,
        status: getProductStatus(nextStock),
      });
      return;
    }

    await editInventoryItem({
      ...item,
      stock: nextStock,
      status: getInventoryStatus(nextStock),
    });
  };

  const handleAddIngredient = async (e) => {
    e.preventDefault();
    await addInventoryItem({
      name: newIngredient.name,
      stock: parseInt(newIngredient.stock, 10) || 0,
      unit: newIngredient.unit,
    });
    setIsModalOpen(false);
    setNewIngredient({ name: '', stock: '', unit: 'pcs' });
  };

  const inStockCount = filteredItems.filter((item) => Number(item.stock) > 10).length;
  const lowStockCount = filteredItems.filter((item) => Number(item.stock) > 0 && Number(item.stock) <= 10).length;
  const outOfStockCount = filteredItems.filter((item) => Number(item.stock) === 0).length;

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>Inventory</h1>
          <p style={{ color: '#64748b' }}>Track and manage {isProductsView ? 'finished products' : 'ingredients'} stock levels</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="admin-filters" style={{ margin: 0, background: '#f1f5f9', padding: '4px', borderRadius: '12px' }}>
            <button
              className={`filter-pill ${viewMode === 'products' ? 'active' : ''}`}
              onClick={() => setViewMode('products')}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              Finished Products
            </button>
            <button
              className={`filter-pill ${viewMode === 'ingredients' ? 'active' : ''}`}
              onClick={() => setViewMode('ingredients')}
              style={{ padding: '0.5rem 1.25rem' }}
            >
              Ingredients
            </button>
          </div>
          {!isProductsView && (
            <button className="btn-add-item" onClick={() => setIsModalOpen(true)}>
              <Plus size={20} /> Add Ingredient
            </button>
          )}
        </div>
      </div>

      <div className="inventory-summary">
        <div className="inventory-card">
          <div className="inv-icon-box inv-green"><CheckSquare size={24} /></div>
          <div>
            <div className="inv-value">{inStockCount}</div>
            <div className="inv-label">In Stock</div>
          </div>
        </div>
        <div className="inventory-card">
          <div className="inv-icon-box inv-orange"><AlertTriangle size={24} /></div>
          <div>
            <div className="inv-value">{lowStockCount}</div>
            <div className="inv-label">Low Stock</div>
          </div>
        </div>
        <div className="inventory-card">
          <div className="inv-icon-box inv-red"><XCircle size={24} /></div>
          <div>
            <div className="inv-value">{outOfStockCount}</div>
            <div className="inv-label">Out of Stock</div>
          </div>
        </div>
      </div>

      <div className="recent-orders-card" style={{ padding: '0' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: '2rem' }}>{isProductsView ? 'PRODUCT' : 'INGREDIENT'}</th>
              <th>{isProductsView ? 'CATEGORY' : 'UNIT'}</th>
              <th>STOCK LEVEL</th>
              <th>COUNT</th>
              <th>STATUS</th>
              <th style={{ paddingRight: '2rem' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const stock = Number(item.stock) || 0;
              const stockPercent = Math.min(100, stock);
              const liveStatus = isProductsView
                ? getProductStatus(stock)
                : getInventoryStatus(stock);
              const barColor = stock === 0 ? 'bar-red' : (stock <= 10 ? 'bar-orange' : 'bar-green');

              return (
                <tr key={item.id}>
                  <td style={{ paddingLeft: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <img src={item.image || '/logo.png'} alt="" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
                      <span style={{ fontWeight: 700 }}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ color: '#64748b' }}>{isProductsView ? item.category : item.unit}</td>
                  <td>
                    <div className="stock-level-container">
                      <div className={`stock-level-bar ${barColor}`} style={{ width: `${stockPercent}%` }}></div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 700 }}>{stock}</td>
                  <td>
                    <span className={`status-badge status-${stock === 0 ? 'out' : stock <= 10 ? 'low' : 'active'}`}>
                      {liveStatus}
                    </span>
                  </td>
                  <td style={{ paddingRight: '2rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn-adj btn-neg" onClick={() => handleAdjustStock(item, -5)}>-5</button>
                      <button className="btn-adj btn-pos-10" onClick={() => handleAdjustStock(item, 10)}>+10</button>
                      <button className="btn-adj btn-pos-25" onClick={() => handleAdjustStock(item, 25)}>+25</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="admin-products-header" style={{ marginBottom: '1.5rem' }}>
              <h2>Add New Ingredient</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b' }}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddIngredient}>
              <div className="modal-form-group">
                <label>Ingredient Name</label>
                <input
                  className="modal-input"
                  value={newIngredient.name}
                  onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Initial Stock Count</label>
                <input
                  type="text"
                  className="modal-input"
                  value={newIngredient.stock}
                  onChange={(e) => setNewIngredient({ ...newIngredient, stock: e.target.value })}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Unit</label>
                <input
                  list="inventory-unit-options"
                  className="modal-input"
                  value={newIngredient.unit}
                  onChange={(e) => setNewIngredient({ ...newIngredient, unit: e.target.value })}
                  placeholder="Select or type a unit"
                />
                <datalist id="inventory-unit-options">
                  <option value="pcs">pcs</option>
                  <option value="packs">packs</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="liters">liters</option>
                  <option value="ml">ml</option>
                </datalist>
              </div>

              <button type="submit" className="btn-add-item" style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}>
                Add to Inventory
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInventory;
