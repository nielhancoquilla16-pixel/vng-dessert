import React, { useRef, useState } from 'react';
import { Search, Plus, Edit, Trash2, X, ImagePlus, Link2, Upload } from 'lucide-react';
import LoadingButton from '../components/LoadingButton';
import { useProducts } from '../context/ProductContext';
import { formatCurrency } from '../utils/currency';
import './AdminProducts.css';

const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const validateImageUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
};

const readProductImage = async (file) => {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Choose a PNG or JPG/JPEG image.');
  }
  if (file.size <= 0 || file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error('Product images must be smaller than 5MB.');
  }

  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng = file.type === 'image/png'
    && PNG_SIGNATURE.every((value, index) => header[index] === value);
  const isJpeg = file.type === 'image/jpeg'
    && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw new Error('The selected file is not a valid PNG or JPG image.');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });

  await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = () => reject(new Error('The selected file cannot be displayed as an image.'));
    image.src = dataUrl;
  });

  return dataUrl;
};

const AdminProducts = () => {
  const { products, addProduct, editProduct, deleteProduct } = useProducts();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [imageMode, setImageMode] = useState('url');
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [imageUrlPreviewStatus, setImageUrlPreviewStatus] = useState('empty');
  const [uploadedImagePreview, setUploadedImagePreview] = useState('');
  const [uploadedImageName, setUploadedImageName] = useState('');
  const [imageValidationError, setImageValidationError] = useState('');
  const productImageFileInputRef = useRef(null);

  const productCategories = Array.from(new Set(
    products
      .filter(p => p.type === 'product' || !p.type)
      .map(p => p.category)
      .filter(Boolean)
      .map(cat => cat.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '))
  )).sort();
  
  const categories = ['All', ...productCategories];

  const filteredProducts = products.filter(p => {
    const isProduct = p.type === 'product' || !p.type;
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || (p.category && p.category.toLowerCase() === selectedCategory.toLowerCase());
    return isProduct && matchesSearch && matchesCategory;
  });

  const getTodayInputValue = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleOpenModal = (product = null) => {
    const selectedProduct = product || {
      name: '', price: '', stock: '', category: 'Puddings', description: '', image: '', status: 'active', type: 'product', dateCreated: getTodayInputValue(), expirationDate: '', expirationTime: '23:59',
    };
    setCurrentProduct(selectedProduct);
    const existingImageUrl = product?.image || product?.imageUrl || '';
    setImageMode('url');
    setImageUrlDraft(existingImageUrl);
    setImageUrlPreviewStatus(existingImageUrl ? 'loading' : 'empty');
    setUploadedImagePreview('');
    setUploadedImageName('');
    setImageValidationError('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(currentProduct.price || '').trim())) {
      window.alert('Price must contain numbers only, with up to two decimal places.');
      return;
    }
    let image;
    if (imageMode === 'url') {
      image = imageUrlDraft.trim();
      if (!validateImageUrl(image)) {
        setImageValidationError('Enter a valid image URL beginning with http:// or https://.');
        return;
      }
      if (imageUrlPreviewStatus !== 'loaded') {
        setImageValidationError(imageUrlPreviewStatus === 'error'
          ? 'This link could not be loaded as an image. Check the URL and try again.'
          : 'Wait for the image preview to load before saving.');
        return;
      }
    } else {
      image = uploadedImagePreview;
      if (!image) {
        setImageValidationError('Choose a PNG or JPG image to upload.');
        return;
      }
    }
    setImageValidationError('');
    setIsSavingProduct(true);
    const stock = Number(currentProduct.stock) || 0;
    const liveStatus = stock === 0 ? 'out' : stock <= 10 ? 'low' : 'active';
    const productToSave = { ...currentProduct, image, stock, status: liveStatus };
    try {
      if (currentProduct.id) {
        await editProduct(productToSave);
      } else {
        await addProduct(productToSave);
      }
      setIsModalOpen(false);
    } catch (error) {
      window.alert(error.message || 'Unable to save this product right now.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Product Management</h1>
        </div>
        
        <div className="search-and-add">
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="Search products..." 
              className="admin-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="btn-add-item" onClick={() => handleOpenModal()}>
            <Plus size={20} /> Add Items
          </button>
        </div>
      </div>

      {/* Category Filters */}
      <div className="admin-filters">
        {categories.map(cat => (
          <button 
            key={cat} 
            className={`filter-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Product Grid */}
      <div className="admin-product-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="admin-product-card">
            <div className="card-top">
              <span className="card-category-tag">{product.category}</span>
              <span className={`card-status-tag status-${product.availability === 'expired' || product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'active'}`}>
                {product.availability === 'expired' ? 'expired' : (product.stock === 0 ? 'out' : product.stock <= 10 ? 'low' : 'active')}
              </span>
              <img src={product.image} alt={product.name} className="card-product-img" />
            </div>
            
            <div className="card-bottom">
              <h3 className="card-title">{product.name}</h3>
              <p className="card-desc">{product.description}</p>
              
              <div className="card-meta">
                <div className="card-price">{formatCurrency(product.price)}</div>
                <div className="card-stock">{product.stock} in stock</div>
              </div>

              <div className="card-actions">
                <button className="btn-card-edit" onClick={() => handleOpenModal(product)}>
                  <Edit size={16} /> Edit
                </button>
                <button className="btn-card-delete" onClick={() => deleteProduct(product.id)}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content admin-product-modal">
            <div className="admin-products-header" style={{ marginBottom: '1.5rem' }}>
              <h2>{currentProduct.id ? 'Edit Product' : 'Add New Product'}</h2>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#64748b' }} disabled={isSavingProduct}>
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-form-group">
                <label>Product Name</label>
                <input 
                  className="modal-input" 
                  value={currentProduct.name}
                  onChange={(e) => setCurrentProduct({...currentProduct, name: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="modal-form-group">
                  <label>Price (₱)</label>
                  <input 
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="10"
                    className="modal-input" 
                    value={currentProduct.price}
                    onChange={(e) => setCurrentProduct({...currentProduct, price: e.target.value})}
                    required
                  />
                </div>
                <div className="modal-form-group">
                  <label>Stock</label>
                  <input 
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="10"
                    className="modal-input" 
                    value={currentProduct.stock}
                    onChange={(e) => setCurrentProduct({...currentProduct, stock: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="modal-form-group">
                <label>Category</label>
                <input 
                  list="category-options"
                  className="modal-input"
                  value={currentProduct.category}
                  onChange={(e) => setCurrentProduct({...currentProduct, category: e.target.value})}
                  placeholder="Select or type a category"
                />
                <datalist id="category-options">
                  {categories.filter(c => c !== 'All').map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </datalist>
              </div>

              <div className="modal-form-group">
                <span className="product-image-field-label">Product image</span>
                <div className="product-image-mode-tabs" role="group" aria-label="Choose product image method">
                  <button
                    type="button"
                    className={`product-image-mode-button${imageMode === 'url' ? ' is-active' : ''}`}
                    aria-pressed={imageMode === 'url'}
                    onClick={() => { setImageMode('url'); setImageValidationError(''); }}
                    disabled={isSavingProduct}
                  >
                    <Link2 size={16} /> Use Image URL
                  </button>
                  <button
                    type="button"
                    className={`product-image-mode-button${imageMode === 'upload' ? ' is-active' : ''}`}
                    aria-pressed={imageMode === 'upload'}
                    onClick={() => { setImageMode('upload'); setImageValidationError(''); }}
                    disabled={isSavingProduct}
                  >
                    <Upload size={16} /> Upload Image
                  </button>
                </div>

                {imageMode === 'url' ? (
                  <>
                    <label htmlFor="product-image-url">Image URL</label>
                    <input
                      id="product-image-url"
                      type="url"
                      className="modal-input"
                      value={imageUrlDraft}
                      onChange={(event) => {
                        const value = event.target.value;
                        setImageUrlDraft(value);
                        setImageUrlPreviewStatus(value.trim() ? 'loading' : 'empty');
                        setImageValidationError('');
                      }}
                      placeholder="https://..."
                      autoComplete="url"
                      aria-invalid={Boolean(imageValidationError)}
                      disabled={isSavingProduct}
                    />
                    {validateImageUrl(imageUrlDraft) && (
                      <div className="product-image-preview" aria-live="polite">
                        <img
                          key={imageUrlDraft}
                          src={imageUrlDraft.trim()}
                          alt="Product image preview from URL"
                          onLoad={() => setImageUrlPreviewStatus('loaded')}
                          onError={() => setImageUrlPreviewStatus('error')}
                        />
                        {imageUrlPreviewStatus === 'loading' && <span>Loading image preview…</span>}
                        {imageUrlPreviewStatus === 'error' && <span role="status">This link could not be loaded as an image.</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="product-image-upload-panel">
                    <button
                      type="button"
                      className="product-image-upload-button"
                      onClick={() => productImageFileInputRef.current?.click()}
                      disabled={isSavingProduct}
                    >
                      <ImagePlus size={18} /> Choose Image
                    </button>
                    <input
                      ref={productImageFileInputRef}
                      id="product-image-file"
                      type="file"
                      accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        setImageValidationError('');
                        try {
                          const preview = await readProductImage(file);
                          setUploadedImagePreview(preview);
                          setUploadedImageName(file.name);
                        } catch (error) {
                          setUploadedImagePreview('');
                          setUploadedImageName('');
                          setImageValidationError(error.message || 'Unable to use that image.');
                          event.target.value = '';
                        }
                      }}
                      disabled={isSavingProduct}
                    />
                    <span className="product-image-upload-help">PNG or JPG/JPEG, up to 5MB.</span>
                    {uploadedImagePreview && (
                      <div className="product-image-preview">
                        <img src={uploadedImagePreview} alt="Selected product image preview" />
                        <span>{uploadedImageName}</span>
                      </div>
                    )}
                  </div>
                )}
                {imageValidationError && <span className="product-image-validation-error" role="alert">{imageValidationError}</span>}
              </div>

              <div className="modal-form-group">
                <label>Description</label>
                <textarea 
                  className="modal-input" 
                  style={{ height: '100px', resize: 'none' }}
                  value={currentProduct.description}
                  onChange={(e) => setCurrentProduct({...currentProduct, description: e.target.value})}
                ></textarea>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
                <div className="modal-form-group">
                  <label>Date Created</label>
                  <input 
                    type="date" 
                    className="modal-input" 
                    value={currentProduct.dateCreated || ''}
                    onChange={(e) => setCurrentProduct({...currentProduct, dateCreated: e.target.value})}
                    required
                  />
                </div>
                <div className="modal-form-group">
                  <label>Expiry Date</label>
                  <input 
                    type="date" 
                    className="modal-input" 
                    value={currentProduct.expirationDate || ''}
                    onChange={(e) => setCurrentProduct({...currentProduct, expirationDate: e.target.value})}
                    required
                  />
                </div>
                <div className="modal-form-group">
                  <label>Expiry Time</label>
                  <input
                    type="time"
                    className="modal-input"
                    value={currentProduct.expirationTime || ''}
                    onChange={(e) => setCurrentProduct({...currentProduct, expirationTime: e.target.value})}
                    required
                  />
                </div>
              </div>

              <LoadingButton
                type="submit"
                className="btn-add-item"
                style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
                isLoading={isSavingProduct}
              >
                {currentProduct.id ? 'Save Changes' : 'Add Product'}
              </LoadingButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProducts;
