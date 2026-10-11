import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Trash2, X, ImagePlus, Link2, Upload, Box, Package, BadgePercent, ShoppingCart, ChevronDown, ShieldCheck, TriangleAlert } from 'lucide-react';
import LoadingButton from '../components/LoadingButton';
import { useProducts } from '../context/ProductContext';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../utils/currency';
import { getProductDiscountConfig, getProductPricing, getProfitPreview, validateProductPrice, validateProductQuantity, validateDiscountTiers } from '../../../dessert-ai-system/shared/productPricing.js';
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

const ProductField = ({ id, label, icon, required = false, wholePesos = false, onChange, ...inputProps }) => (
  <div className="modal-form-group">
    <label htmlFor={id}>{label}{required && <span className="product-required" aria-hidden="true">*</span>}</label>
    <div className={`product-input-wrap${icon ? ' has-icon' : ''}`}>
      {icon && <span className="product-input-icon" aria-hidden="true">{icon}</span>}
      <input id={id} className="modal-input" required={required} {...inputProps}
        onChange={event => { if (!wholePesos || /^\d*$/.test(event.target.value)) onChange?.(event); }}
        onKeyDown={wholePesos ? event => {
          if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 && !/^[0-9]$/.test(event.key)) event.preventDefault();
        } : undefined}
        onPaste={wholePesos ? event => {
          if (!/^\d+$/.test(event.clipboardData.getData('text').trim())) event.preventDefault();
        } : undefined} />
    </div>
  </div>
);

const DiscountTierFields = ({ tier, index, onChange, required }) => (
  <div className="product-form-columns">
    <ProductField id={`discount-quantity-${index}`} label="Minimum Quantity" icon={<ShoppingCart size={20} />}
      type="number" inputMode="numeric" min="2" step="1" placeholder="e.g. 5" required={required}
      value={tier.minQuantity} onChange={event => onChange(index, 'minQuantity', event.target.value)} />
    <ProductField id={`discount-price-${index}`} label="Discounted Price (₱)" icon="₱"
      type="number" inputMode="numeric" min="0" step="1" wholePesos placeholder="e.g. 125" required={required}
      value={tier.price} onChange={event => onChange(index, 'price', event.target.value)} />
  </div>
);

const AdminProducts = () => {
  const { products, addProduct, editProduct, deleteProduct } = useProducts();
  const { userRole } = useAuth();
  const canViewProfit = userRole === 'admin';
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
  const [isReadingProductImage, setIsReadingProductImage] = useState(false);
  const [imageValidationError, setImageValidationError] = useState('');
  const productImageFileInputRef = useRef(null);
  const modalRef = useRef(null);
  const modalTriggerRef = useRef(null);
  const [advancedTiersOpen, setAdvancedTiersOpen] = useState(false);
  const [inventoryDatesOpen, setInventoryDatesOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    modalRef.current?.querySelector('#product-name')?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      modalTriggerRef.current?.focus();
    };
  }, [isModalOpen]);

  const updateField = (field, value) => {
    setCurrentProduct(product => ({ ...product, [field]: value,
      ...(['expirationDate', 'expirationTime'].includes(field) ? { expirationAt: undefined } : {}) }));
    setFormError('');
  };
  const updateTier = (index, field, value) => {
    setCurrentProduct(product => ({ ...product, discountTiers: product.discountTiers.map((tier, i) => i === index ? { ...tier, [field]: value } : tier) }));
    setFormError('');
  };
  const addTier = () => {
    setCurrentProduct(product => ({ ...product, discountTiers: [...product.discountTiers, { minQuantity: '', price: '' }] }));
    setAdvancedTiersOpen(true);
  };
  const closeModal = () => {
    if (!isSavingProduct && !isReadingProductImage) setIsModalOpen(false);
  };
  const handleModalKeys = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); closeModal(); }
    if (event.key !== 'Tab') return;
    const controls = [...modalRef.current.querySelectorAll('button, input, select, textarea, [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

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
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  };

  const handleOpenModal = (product = null) => {
    modalTriggerRef.current = document.activeElement;
    const discount = getProductDiscountConfig(product || { discountEnabled: false });
    const today = getTodayInputValue();
    const expiry = new Date(`${today}T12:00:00+08:00`);
    expiry.setUTCDate(expiry.getUTCDate() + 30);
    const selectedProduct = product || {
      name: '', price: '', stock: '', category: 'Puddings', description: '', image: '', status: 'active', type: 'product', dateCreated: today, expirationDate: expiry.toISOString().slice(0, 10), expirationTime: '23:59',
    };
    setCurrentProduct({ ...selectedProduct, costPrice: product?.costPrice ?? '',
      discountEnabled: discount.enabled, discountTiers: discount.tiers.length ? discount.tiers.map(tier => ({ ...tier })) : [{ minQuantity: 5, price: '' }] });
    setAdvancedTiersOpen(discount.tiers.length > 1);
    setInventoryDatesOpen(false);
    setFormError('');
    const existingImageUrl = product?.imageUrl ?? product?.image ?? '';
    setIsCustomCategory(false);
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
    if (isReadingProductImage || isSavingProduct) return;
    let pricing;
    try {
      const price = validateProductPrice(currentProduct.price, 'Selling price');
      pricing = { price, stock: validateProductQuantity(currentProduct.stock),
        discountEnabled: currentProduct.discountEnabled,
        discountTiers: currentProduct.discountEnabled ? validateDiscountTiers(currentProduct.discountTiers, price) : [],
        ...(canViewProfit ? { costPrice: currentProduct.costPrice === '' ? null : validateProductPrice(currentProduct.costPrice, 'Cost price') } : {}),
      };
      if (!currentProduct.name.trim() || !currentProduct.category.trim()) throw new Error('Enter a product name and category.');
      if (currentProduct.expirationDate && currentProduct.expirationDate < currentProduct.dateCreated) {
        setInventoryDatesOpen(true);
        throw new Error('Expiry date must be on or after the creation date.');
      }
    } catch (error) {
      if (currentProduct.discountEnabled && currentProduct.discountTiers.length > 1) setAdvancedTiersOpen(true);
      setFormError(error.message);
      return;
    }
    let image = currentProduct.imageUrl ?? currentProduct.image ?? '';
    if (imageMode === 'url') {
      const imageUrl = imageUrlDraft.trim();
      if (imageUrl) {
        if (!validateImageUrl(imageUrl)) {
          setImageValidationError('Enter a valid image URL beginning with http:// or https://.');
          return;
        }
        if (imageUrlPreviewStatus !== 'loaded') {
          setImageValidationError(imageUrlPreviewStatus === 'error'
            ? 'This link could not be loaded as an image. Check the URL and try again.'
            : 'Wait for the image preview to load before saving.');
          return;
        }
        image = imageUrl;
      }
    } else {
      if (imageValidationError) return;
      image = uploadedImagePreview || image;
    }
    setImageValidationError('');
    setIsSavingProduct(true);
    const stock = pricing.stock;
    const liveStatus = stock === 0 ? 'out' : stock <= 10 ? 'low' : 'active';
    const productToSave = { ...currentProduct, ...pricing, image, imageUrl: image, stock, status: liveStatus };
    if (!canViewProfit) delete productToSave.costPrice;
    try {
      if (currentProduct.id) {
        await editProduct(productToSave);
      } else {
        await addProduct(productToSave);
      }
      setIsModalOpen(false);
    } catch (error) {
      setFormError(error.message || 'Unable to save this product right now.');
    } finally {
      setIsSavingProduct(false);
    }
  };

  const profit = currentProduct && canViewProfit ? getProfitPreview(currentProduct) : null;
  const firstTier = currentProduct?.discountTiers?.[0];
  const previewPricing = getProductPricing(currentProduct || { discountEnabled: false }, Number(firstTier?.minQuantity) || 1);
  const previewImage = imageMode === 'upload' ? uploadedImagePreview || currentProduct?.imageUrl || ''
    : (validateImageUrl(imageUrlDraft) ? imageUrlDraft.trim() : currentProduct?.imageUrl || '');
  const expiryTimestamp = currentProduct?.expirationDate
    ? Date.parse(`${currentProduct.expirationDate}T${currentProduct.expirationTime || '23:59'}:00+08:00`) : NaN;
  const previewAvailability = currentProduct?.availability === 'hidden' ? 'Hidden'
    : expiryTimestamp <= Date.now() ? 'Expired' : Number(currentProduct?.stock) > 0 ? 'Available' : 'Out of stock';

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

      {/* The existing form serves both Add and Edit. */}
      {isModalOpen && createPortal(
        <div className="modal-overlay product-modal-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeModal(); }}>
          <div ref={modalRef} className="modal-content admin-product-modal" role="dialog" aria-modal="true"
            aria-labelledby="product-modal-title" aria-describedby="product-modal-subtitle" onKeyDown={handleModalKeys}>
            <header className="product-modal-header">
              <Box className="product-modal-cube" size={40} strokeWidth={1.8} aria-hidden="true" />
              <div>
                <h2 id="product-modal-title">{currentProduct.id ? 'Edit Product' : 'Add New Product'}</h2>
                <p id="product-modal-subtitle">Fill in the details below to {currentProduct.id ? 'update this product in' : 'add a new product to'} your store.</p>
              </div>
              <button type="button" className="product-modal-close" onClick={closeModal} aria-label="Close product form"
                disabled={isSavingProduct || isReadingProductImage}><X size={26} /></button>
            </header>

            <form className="product-modal-form" onSubmit={handleSave} noValidate>
              <div className="product-modal-scroll">
                <fieldset className="product-form-fields" disabled={isSavingProduct || isReadingProductImage}>
                  <ProductField id="product-name" label="Product Name" placeholder="e.g. Leche Flan Cake" required
                    value={currentProduct.name} onChange={event => updateField('name', event.target.value)} />

                  <div className="product-form-columns">
                    {canViewProfit && <ProductField id="product-cost" label="Cost Price (₱)" icon="₱"
                      type="number" inputMode="numeric" min="0" step="1" wholePesos placeholder="e.g. 80"
                      value={currentProduct.costPrice} onChange={event => updateField('costPrice', event.target.value)} />}
                    <ProductField id="product-price" label="Selling Price (₱)" icon="₱"
                      type="number" inputMode="numeric" min="0" step="1" wholePesos placeholder="e.g. 140" required
                      value={currentProduct.price} onChange={event => updateField('price', event.target.value)} />
                  </div>
                  <ProductField id="product-stock" label="Stock" icon={<Package size={20} />}
                    type="number" inputMode="numeric" min="0" step="1" placeholder="e.g. 50" required
                    value={currentProduct.stock} onChange={event => updateField('stock', event.target.value)} />

                  <div className="modal-form-group">
                    <label htmlFor="product-category">Category<span className="product-required" aria-hidden="true">*</span></label>
                    <div className="product-select-wrap">
                      <select id="product-category" className="modal-input" value={isCustomCategory ? '__custom__' : currentProduct.category}
                        required onChange={event => {
                          const custom = event.target.value === '__custom__';
                          setIsCustomCategory(custom);
                          updateField('category', custom ? '' : event.target.value);
                        }}>
                        {Array.from(new Set(['Puddings', ...productCategories, ...(!isCustomCategory && currentProduct.category ? [currentProduct.category] : [])])).map(category =>
                          <option key={category} value={category}>{category}</option>)}
                        <option value="__custom__">Add a new category…</option>
                      </select>
                      <ChevronDown size={20} aria-hidden="true" />
                    </div>
                    {isCustomCategory && <ProductField id="product-custom-category" label="New Category" placeholder="Enter category name" required
                      value={currentProduct.category} onChange={event => updateField('category', event.target.value)} />}
                  </div>

                  <section className={`product-discount-panel${currentProduct.discountEnabled ? '' : ' is-disabled'}`} aria-labelledby="product-discount-title">
                    <div className="product-discount-heading">
                      <BadgePercent className="product-discount-icon" size={32} aria-hidden="true" />
                      <div className="product-discount-copy">
                        <h3 id="product-discount-title">Quantity Discount <span>(Optional)</span></h3>
                        <p>Set a discount price that will be automatically applied when the customer buys the minimum quantity or more.</p>
                      </div>
                      <div className="product-discount-toggle">
                        <button type="button" className="product-switch" role="switch" aria-label="Enable Discount"
                          aria-checked={currentProduct.discountEnabled} onClick={() => updateField('discountEnabled', !currentProduct.discountEnabled)}>
                          <span />
                        </button>
                        <span>Enable Discount</span>
                      </div>
                    </div>
                    <fieldset className="product-discount-fields" disabled={!currentProduct.discountEnabled}>
                      <DiscountTierFields tier={firstTier} index={0} onChange={updateTier} required={currentProduct.discountEnabled} />
                      <div className="product-advanced-tiers">
                        <div className="product-advanced-heading">
                          <button type="button" className="product-advanced-toggle" aria-expanded={advancedTiersOpen}
                            aria-controls="product-extra-tiers" onClick={() => setAdvancedTiersOpen(!advancedTiersOpen)}>
                            <ChevronDown size={20} className={advancedTiersOpen ? 'is-open' : ''} />
                            <span><strong>Advanced Discount Tiers</strong> (Optional)<small>Add more quantity tiers if you want to offer different discounts.</small></span>
                          </button>
                          <button type="button" className="product-add-tier" onClick={addTier} disabled={currentProduct.discountTiers.length >= 10}>
                            <Plus size={17} /> Add Tier
                          </button>
                        </div>
                        <div id="product-extra-tiers" hidden={!advancedTiersOpen}>
                          {currentProduct.discountTiers.slice(1).map((tier, i) => (
                            <div className="product-extra-tier" key={i + 1}>
                              <div className="product-extra-tier-heading"><span>Tier {i + 2}</span>
                                <button type="button" aria-label={`Remove tier ${i + 2}`} onClick={() => {
                                  updateField('discountTiers', currentProduct.discountTiers.filter((_, index) => index !== i + 1));
                                }}><Trash2 size={16} /> Remove</button>
                              </div>
                              <DiscountTierFields tier={tier} index={i + 1} onChange={updateTier} required={currentProduct.discountEnabled} />
                            </div>
                          ))}
                          {currentProduct.discountTiers.length === 1 && <p className="product-tiers-empty">Add a tier to offer a lower price for larger quantities.</p>}
                        </div>
                      </div>
                    </fieldset>
                  </section>

                  {canViewProfit && <section className="product-profit-panel" aria-labelledby="product-profit-title">
                    <div className="product-profit-heading"><h3 id="product-profit-title"><ShieldCheck size={17} /> Profit Preview</h3><span>Admin only</span></div>
                    {profit ? <>
                      <dl className="product-profit-values">
                        <div><dt>Regular profit / unit</dt><dd>{formatCurrency(profit.regularProfit)}</dd></div>
                        <div><dt>Profit margin</dt><dd>{profit.margin == null ? '—' : `${profit.margin.toFixed(2)}%`}</dd></div>
                        {profit.tiers[0] && <>
                          <div><dt>Discounted profit / unit</dt><dd>{formatCurrency(profit.tiers[0].profitPerUnit)}</dd></div>
                          <div><dt>Profit for {profit.tiers[0].minQuantity} units</dt><dd>{formatCurrency(profit.tiers[0].estimatedProfit)}</dd></div>
                        </>}
                      </dl>
                      {profit.tiers.length > 1 && <p className="product-profit-help">Additional tiers: {profit.tiers.slice(1).map(tier =>
                        `${tier.minQuantity}+ packs: ${formatCurrency(tier.profitPerUnit)} profit / unit`).join(' · ')}</p>}
                      {profit.belowCost && <p className="product-profit-warning" role="status"><TriangleAlert size={16} /> A selling price is below cost. This sale would make a loss.</p>}
                    </> : <p className="product-profit-help">Enter cost and selling prices to calculate profit. Leaving cost blank keeps it unrecorded.</p>}
                  </section>}

                  <div className="modal-form-group product-image-section">
                    <h3 className="product-image-field-label">Product Image <span>(optional)</span></h3>
                    <p className="product-image-optional-help">You can save this product now and add a picture later with Edit.</p>
                    <div className="product-image-mode-tabs" role="group" aria-label="Choose product image method">
                      <button type="button" className={`product-image-mode-button${imageMode === 'url' ? ' is-active' : ''}`}
                        aria-pressed={imageMode === 'url'} onClick={() => { setImageMode('url'); setImageValidationError(''); }}>
                        <Link2 size={20} /> Use Image URL
                      </button>
                      <button type="button" className={`product-image-mode-button${imageMode === 'upload' ? ' is-active' : ''}`}
                        aria-pressed={imageMode === 'upload'} onClick={() => { setImageMode('upload'); setImageValidationError(''); }}>
                        <Upload size={20} /> Upload Image
                      </button>
                    </div>
                    {imageMode === 'url' ? <ProductField id="product-image-url" label="Image URL" type="url"
                      value={imageUrlDraft} placeholder="https://..." autoComplete="url" aria-invalid={Boolean(imageValidationError)}
                      aria-describedby={imageValidationError ? 'product-image-error' : undefined}
                      onChange={event => {
                        setImageUrlDraft(event.target.value);
                        setImageUrlPreviewStatus(event.target.value.trim() ? 'loading' : 'empty');
                        setImageValidationError('');
                      }} /> : <div className="product-image-upload-panel">
                      <button type="button" className="product-image-upload-button" onClick={() => productImageFileInputRef.current?.click()}>
                        <ImagePlus size={20} /> Choose Image
                      </button>
                      <input ref={productImageFileInputRef} id="product-image-file" type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                        aria-label="Upload product image" onChange={async event => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          setImageValidationError('');
                          setIsReadingProductImage(true);
                          try {
                            const preview = await readProductImage(file);
                            setUploadedImagePreview(preview);
                            setUploadedImageName(file.name);
                          } catch (error) {
                            setUploadedImagePreview('');
                            setUploadedImageName('');
                            setImageValidationError(error.message || 'Unable to use that image.');
                            event.target.value = '';
                          } finally { setIsReadingProductImage(false); }
                        }} />
                      <span className="product-image-upload-help">{uploadedImageName || 'PNG or JPG/JPEG, up to 5MB.'}</span>
                    </div>}
                    {imageValidationError && <span id="product-image-error" className="product-image-validation-error" role="alert">{imageValidationError}</span>}
                    {imageMode === 'url' && imageUrlDraft.trim() && <p className="product-image-upload-help">
                      {imageUrlPreviewStatus === 'loading' ? 'Loading image preview…' : imageUrlPreviewStatus === 'error' ? 'This link could not be loaded as an image.' : ''}
                    </p>}
                  </div>

                  <div className="modal-form-group">
                    <label htmlFor="product-description">Description</label>
                    <textarea id="product-description" className="modal-input" rows={3} placeholder="Enter product description..."
                      value={currentProduct.description} onChange={event => updateField('description', event.target.value)} />
                  </div>

                  <section className="product-inventory-dates">
                    <button type="button" aria-expanded={inventoryDatesOpen} aria-controls="product-inventory-fields" onClick={() => setInventoryDatesOpen(!inventoryDatesOpen)}>
                      <ChevronDown size={17} className={inventoryDatesOpen ? 'is-open' : ''} />
                      Inventory dates <span>{currentProduct.expirationDate ? `Expires ${currentProduct.expirationDate} at ${currentProduct.expirationTime || '23:59'}` : 'No expiry date'}</span>
                    </button>
                    <div id="product-inventory-fields" className="product-date-columns" hidden={!inventoryDatesOpen}>
                      <ProductField id="product-created" label="Date Created" type="date" value={currentProduct.dateCreated || ''} onChange={event => updateField('dateCreated', event.target.value)} />
                      <ProductField id="product-expiry" label="Expiry Date" type="date" min={currentProduct.dateCreated || undefined}
                        value={currentProduct.expirationDate || ''} onChange={event => updateField('expirationDate', event.target.value)} />
                      <ProductField id="product-expiry-time" label="Expiry Time" type="time" value={currentProduct.expirationTime || ''}
                        onChange={event => updateField('expirationTime', event.target.value)} />
                    </div>
                  </section>

                  <section className="product-live-preview" aria-label="Customer product preview">
                    <div className="product-preview-image">
                      {previewImage && !(imageMode === 'url' && imageUrlPreviewStatus === 'error') ? <img
                        key={previewImage} src={previewImage} alt={currentProduct.name || 'Product preview'}
                        onLoad={() => { if (imageMode === 'url') setImageUrlPreviewStatus('loaded'); }}
                        onError={() => { if (imageMode === 'url') setImageUrlPreviewStatus('error'); }} />
                        : <Package size={38} aria-hidden="true" />}
                    </div>
                    <div className="product-preview-details">
                      {previewPricing.isBulkPrice && <span className="product-preview-badge">Discount Preview</span>}
                      <h3>{currentProduct.name.trim() || 'Product name'}</h3>
                      <span className={`product-preview-availability${previewAvailability === 'Available' ? ' is-available' : ''}`}><i />{previewAvailability}</span>
                      <div className="product-preview-prices">
                        {previewPricing.isBulkPrice && <del>{formatCurrency(previewPricing.regularPrice)}</del>}
                        <strong>{formatCurrency(previewPricing.unitPrice)}</strong><span>each</span>
                        {previewPricing.isBulkPrice && <span className="product-preview-quantity">{previewPricing.bulkQuantityLabel}</span>}
                      </div>
                    </div>
                    {previewPricing.isBulkPrice && previewPricing.savings > 0 && <div className="product-preview-savings">
                      <BadgePercent size={28} aria-hidden="true" /><div><strong>Save {formatCurrency(previewPricing.savings)}</strong>
                        <span>when you buy {previewPricing.bulkMinQuantity}<br />or more!</span></div>
                    </div>}
                  </section>
                </fieldset>
              </div>
              <footer className="product-modal-footer">
                {formError && <p className="product-form-error" role="alert">{formError}</p>}
                <div className="product-modal-actions">
                  <button type="button" className="product-cancel-button" onClick={closeModal} disabled={isSavingProduct || isReadingProductImage}>Cancel</button>
                  <LoadingButton type="submit" className="product-save-button" isLoading={isSavingProduct || isReadingProductImage}>Save Product</LoadingButton>
                </div>
              </footer>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
};

export default AdminProducts;
