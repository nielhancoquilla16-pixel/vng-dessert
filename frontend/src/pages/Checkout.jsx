import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import LoadingButton from '../components/LoadingButton';
import LocationPinPicker from '../components/LocationPinPicker';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import { useProducts } from '../context/ProductContext';
import { useCustomerAddresses } from '../context/CustomerAddressesContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import { apiRequest } from '../lib/api';
import { CreditCard, Banknote, Store, Truck } from 'lucide-react';
import {
  ADDRESS_PIN_ERROR,
  buildDeliveryAddressText,
  isValidLocation,
} from '../lib/deliveryLocation';
import { hasLecheFlanItems } from '../utils/orderWorkflow';
import { isWithinOperatingHours } from '../utils/shopHours';
import { formatCurrency, formatCurrencyText } from '../utils/currency';
import './Checkout.css';

const DELIVERY_FEE = 50;

const applySavedAddressToForm = (current, savedAddress) => ({
  ...current,
  fullName: current.fullName || savedAddress.recipientName,
  phone: savedAddress.phoneNumber || current.phone,
  address: savedAddress.formattedAddress,
  deliveryAddressId: savedAddress.id,
  deliveryRecipientName: savedAddress.recipientName,
  deliveryContactNumber: savedAddress.phoneNumber,
  deliveryStreetAddress: savedAddress.streetAddress,
  deliveryBarangay: savedAddress.barangay,
  deliveryCity: savedAddress.city,
  deliveryProvince: savedAddress.province,
  deliveryPostalCode: savedAddress.postalCode,
  deliveryFormattedAddress: savedAddress.formattedAddress,
  deliveryPlaceId: savedAddress.placeId,
  deliveryLatitude: savedAddress.latitude ?? '',
  deliveryLongitude: savedAddress.longitude ?? '',
});

const getSavedDeliveryAddress = (savedAddress) => {
  const address = savedAddress.formattedAddress || buildDeliveryAddressText(savedAddress);

  return {
    recipientName: savedAddress.recipientName || '',
    contactNumber: savedAddress.phoneNumber || '',
    streetAddress: savedAddress.streetAddress || '',
    barangay: savedAddress.barangay || '',
    city: savedAddress.city || '',
    province: savedAddress.province || '',
    postalCode: savedAddress.postalCode || '',
    formattedAddress: savedAddress.formattedAddress || address,
    address,
    placeId: savedAddress.placeId || '',
    latitude: savedAddress.latitude ?? '',
    longitude: savedAddress.longitude ?? '',
  };
};

const Checkout = () => {
  const { cartItems: allCartItems, removeFromCart } = useCart();
  const location = useLocation();
  const selectedCartIds = location.state?.selectedCartIds;
  const cartItems = Array.isArray(selectedCartIds)
    ? allCartItems.filter((item) => selectedCartIds.includes(item.id))
    : allCartItems;
  const { loggedInCustomer, updateLoggedInCustomer } = useAuth();
  const { addOrder, refreshOrders } = useOrders();
  const { validateStockAvailability, refreshProducts } = useProducts();
  const { shopSettings, isShopOpen, isShopSettingsLoading, shopSettingsError, operatingHoursLabel, refreshShopSettings } = useShopSettings();
  const canCheckout = isShopOpen && !isShopSettingsLoading && !shopSettingsError;
  const {
    addresses,
    defaultAddress,
    isAddressesLoading,
    hasLoadedAddresses,
    createAddress,
  } = useCustomerAddresses();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    fullName: loggedInCustomer?.fullName || loggedInCustomer?.username || '',
    phone: loggedInCustomer?.phoneNumber || '',
    address: loggedInCustomer?.address || '',
    deliveryMethod: 'delivery',
    paymentMethod: 'online',
    deliveryAddressId: '',
    deliveryDistanceKm: '',
    deliveryRecipientName: loggedInCustomer?.fullName || loggedInCustomer?.username || '',
    deliveryContactNumber: loggedInCustomer?.phoneNumber || '',
    deliveryStreetAddress: '',
    deliveryBarangay: '',
    deliveryCity: '',
    deliveryProvince: '',
    deliveryPostalCode: '',
    deliveryFormattedAddress: loggedInCustomer?.address || '',
    deliveryPlaceId: '',
    deliveryLatitude: '',
    deliveryLongitude: '',
    deliveryInstructions: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [addressStatus, setAddressStatus] = useState('');
  const [isSavingDeliveryAddress, setIsSavingDeliveryAddress] = useState(false);
  const [saveAddressAsDefault, setSaveAddressAsDefault] = useState(false);
  const [savedAddressNotice, setSavedAddressNotice] = useState('');
  const [isPaymentStatusLoading, setIsPaymentStatusLoading] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState({
    configured: false,
    paymentMethodTypes: [],
  });
  const hasHydratedDefaultAddressRef = useRef(false);
  const hasManualDeliveryAddressChangeRef = useRef(false);
  const checkoutCompletedRef = useRef(false);

  useEffect(() => {
    if (cartItems.length === 0 && !isSubmitting && !checkoutCompletedRef.current) {
      navigate('/cart');
    }
  }, [cartItems, navigate, isSubmitting]);

  useEffect(() => {
    if (!loggedInCustomer) {
      return;
    }

    setFormData((current) => ({
      ...current,
      fullName: current.fullName || loggedInCustomer.fullName || loggedInCustomer.username || '',
      phone: current.phone || loggedInCustomer.phoneNumber || '',
      address: current.address || loggedInCustomer.address || '',
      deliveryRecipientName: current.deliveryRecipientName || loggedInCustomer.fullName || loggedInCustomer.username || '',
      deliveryContactNumber: current.deliveryContactNumber || loggedInCustomer.phoneNumber || '',
      deliveryFormattedAddress: current.deliveryFormattedAddress || loggedInCustomer.address || '',
    }));
  }, [loggedInCustomer]);

  useEffect(() => {
    hasHydratedDefaultAddressRef.current = false;
    hasManualDeliveryAddressChangeRef.current = false;
    setSavedAddressNotice('');
  }, [loggedInCustomer?.id]);

  useEffect(() => {
    if (
      !hasLoadedAddresses
      || isAddressesLoading
      || !defaultAddress
      || hasHydratedDefaultAddressRef.current
      || hasManualDeliveryAddressChangeRef.current
    ) {
      return;
    }

    setFormData((current) => applySavedAddressToForm(current, defaultAddress));
    setAddressStatus('');
    hasHydratedDefaultAddressRef.current = true;
  }, [defaultAddress, hasLoadedAddresses, isAddressesLoading]);

  useEffect(() => {
    let isActive = true;

    const loadPaymentStatus = async () => {
      try {
        const status = await apiRequest('/api/payments/status');
        if (isActive) {
          setPaymentStatus(status || { configured: false, paymentMethodTypes: [] });
        }
      } catch {
        if (isActive) {
          setPaymentStatus({ configured: false, paymentMethodTypes: [] });
        }
      } finally {
        if (isActive) {
          setIsPaymentStatusLoading(false);
        }
      }
    };

    loadPaymentStatus();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!paymentStatus.configured && formData.paymentMethod === 'online') {
      setFormData((current) => ({
        ...current,
        paymentMethod: 'cash',
      }));
    }
  }, [formData.paymentMethod, paymentStatus.configured]);

  useEffect(() => {
    if (formData.deliveryMethod === 'pickup' && formData.deliveryDistanceKm) {
      setFormData((current) => ({
        ...current,
        deliveryDistanceKm: '',
      }));
    }
  }, [formData.deliveryMethod, formData.deliveryDistanceKm]);

  const subtotal = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  const deliveryFee = formData.deliveryMethod === 'delivery' ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const containsLecheFlan = hasLecheFlanItems(cartItems);
  const deliveryDistance = Number(formData.deliveryDistanceKm);
  const deliveryAddress = {
    recipientName: formData.deliveryRecipientName.trim(),
    contactNumber: formData.deliveryContactNumber.trim(),
    streetAddress: formData.deliveryStreetAddress.trim(),
    barangay: formData.deliveryBarangay.trim(),
    city: formData.deliveryCity.trim(),
    province: formData.deliveryProvince.trim(),
    postalCode: formData.deliveryPostalCode.trim(),
    formattedAddress: formData.deliveryFormattedAddress.trim(),
    address: formData.deliveryFormattedAddress.trim() || formData.address.trim() || buildDeliveryAddressText({
      streetAddress: formData.deliveryStreetAddress,
      barangay: formData.deliveryBarangay,
      city: formData.deliveryCity,
      province: formData.deliveryProvince,
      postalCode: formData.deliveryPostalCode,
    }),
    placeId: formData.deliveryPlaceId,
    latitude: formData.deliveryLatitude,
    longitude: formData.deliveryLongitude,
  };
  const selectedSavedAddress = formData.deliveryAddressId
    ? addresses.find((address) => address.id === formData.deliveryAddressId) || null
    : null;
  const hasSelectedSavedAddress = Boolean(selectedSavedAddress);
  const selectedDeliveryAddress = selectedSavedAddress
    ? getSavedDeliveryAddress(selectedSavedAddress)
    : null;
  const isLecheFlanRestricted = formData.deliveryMethod === 'delivery'
    && containsLecheFlan
    && Number.isFinite(deliveryDistance)
    && deliveryDistance > 3;

  const handleChange = (e) => {
    const { name, value } = e.target;
    const changesDeliveryRecipient = ['deliveryRecipientName', 'deliveryContactNumber'].includes(name);

    if (changesDeliveryRecipient) {
      hasManualDeliveryAddressChangeRef.current = true;
      setSavedAddressNotice('');
    }

    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(changesDeliveryRecipient ? { deliveryAddressId: '' } : {}),
    }));
  };

  const handleDeliveryAddressFieldChange = (e) => {
    const { name, value } = e.target;
    hasManualDeliveryAddressChangeRef.current = true;
    setSavedAddressNotice('');

    setFormData((current) => {
      const next = {
        ...current,
        [name]: value,
        deliveryAddressId: '',
        deliveryFormattedAddress: '',
        deliveryPlaceId: '',
        deliveryLatitude: '',
        deliveryLongitude: '',
      };
      const nextAddress = buildDeliveryAddressText({
        streetAddress: next.deliveryStreetAddress,
        barangay: next.deliveryBarangay,
        city: next.deliveryCity,
        province: next.deliveryProvince,
        postalCode: next.deliveryPostalCode,
      });

      return {
        ...next,
        address: nextAddress,
        deliveryFormattedAddress: nextAddress,
      };
    });
    setSubmitError('');
    setAddressStatus('Address changed. Select the matching delivery pin on the map again.');
  };

  const handleDeliveryPinChange = ({ latitude, longitude }) => {
    hasManualDeliveryAddressChangeRef.current = true;
    setSavedAddressNotice('');
    setSubmitError('');
    setFormData((current) => {
      const nextAddress = buildDeliveryAddressText({
        streetAddress: current.deliveryStreetAddress,
        barangay: current.deliveryBarangay,
        city: current.deliveryCity,
        province: current.deliveryProvince,
        postalCode: current.deliveryPostalCode,
      });
      return {
        ...current,
        address: nextAddress,
        deliveryAddressId: '',
        deliveryFormattedAddress: nextAddress,
        deliveryPlaceId: '',
        deliveryLatitude: latitude,
        deliveryLongitude: longitude,
      };
    });
    setAddressStatus(isValidLocation({ latitude, longitude })
      ? 'Delivery pin selected. Check that it matches your complete address.'
      : ADDRESS_PIN_ERROR);
  };

  const handleSelectSavedAddress = (selectedAddress) => {
    hasHydratedDefaultAddressRef.current = true;
    hasManualDeliveryAddressChangeRef.current = true;
    setSubmitError('');
    setAddressStatus('');
    setSavedAddressNotice('');
    setFormData((current) => applySavedAddressToForm(current, selectedAddress));
  };

  const handleSaveDeliveryAddress = async () => {
    setSubmitError('');
    setSavedAddressNotice('');

    if (!loggedInCustomer) {
      setSubmitError('Please log in first before saving a delivery address.');
      return;
    }

    if (!hasLoadedAddresses || isAddressesLoading) {
      setSubmitError('Your saved delivery addresses are still loading. Please wait a moment and try again.');
      return;
    }

    if (!deliveryAddress.recipientName || !deliveryAddress.contactNumber) {
      setSubmitError('Recipient name and contact number are required before saving an address.');
      return;
    }

    if (!deliveryAddress.streetAddress || !deliveryAddress.city || !deliveryAddress.province) {
      setSubmitError('Street address, city/municipality, and province are required before saving an address.');
      return;
    }

    if (!isValidLocation(deliveryAddress)) {
      setSubmitError(ADDRESS_PIN_ERROR);
      return;
    }

    setIsSavingDeliveryAddress(true);
    try {
      const savedAddress = await createAddress({
        label: 'Home',
        recipientName: deliveryAddress.recipientName,
        phoneNumber: deliveryAddress.contactNumber,
        streetAddress: deliveryAddress.streetAddress,
        barangay: deliveryAddress.barangay,
        city: deliveryAddress.city,
        province: deliveryAddress.province,
        postalCode: deliveryAddress.postalCode,
        formattedAddress: deliveryAddress.formattedAddress || deliveryAddress.address,
        placeId: deliveryAddress.placeId,
        latitude: deliveryAddress.latitude,
        longitude: deliveryAddress.longitude,
        isDefault: addresses.length === 0 || saveAddressAsDefault,
      });

      hasHydratedDefaultAddressRef.current = true;
      hasManualDeliveryAddressChangeRef.current = false;
      setFormData((current) => applySavedAddressToForm(current, savedAddress));
      setSaveAddressAsDefault(Boolean(savedAddress.isDefault));
      setSavedAddressNotice(savedAddress.isDefault
        ? 'Delivery address saved as your default for future orders.'
        : 'Delivery address saved. It is selected for this order.');
    } catch (error) {
      setSubmitError(error.message || 'Unable to save the delivery address right now.');
    } finally {
      setIsSavingDeliveryAddress(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      if (!loggedInCustomer) {
        throw new Error('Please log in first before checking out.');
      }

      const latestShopSettings = await refreshShopSettings();
      const shopReferenceTime = latestShopSettings.serverTime
        ? new Date(latestShopSettings.serverTime)
        : undefined;
      if (!isWithinOperatingHours(latestShopSettings, shopReferenceTime)) {
        throw new Error('The shop is closed for orders. Your cart is saved; please return during our ordering hours.');
      }

      const checkoutDeliveryAddress = selectedDeliveryAddress || deliveryAddress;
      const checkoutDeliveryLatitude = Number(checkoutDeliveryAddress.latitude);
      const checkoutDeliveryLongitude = Number(checkoutDeliveryAddress.longitude);

      if (formData.deliveryMethod === 'delivery') {
        if (!hasLoadedAddresses || isAddressesLoading) {
          throw new Error('Your saved delivery address is still loading. Please wait a moment and try again.');
        }

        if (!checkoutDeliveryAddress.recipientName || !checkoutDeliveryAddress.contactNumber) {
          throw new Error('Recipient name and contact number are required before booking delivery.');
        }

        if (!checkoutDeliveryAddress.streetAddress || !checkoutDeliveryAddress.city || !checkoutDeliveryAddress.province) {
          throw new Error('Street address, city/municipality, and province are required before booking delivery.');
        }

        if (!isValidLocation(checkoutDeliveryAddress)) {
          throw new Error(ADDRESS_PIN_ERROR);
        }
      }

      if (formData.deliveryMethod === 'delivery' && containsLecheFlan && (!Number.isFinite(deliveryDistance) || deliveryDistance <= 0)) {
        throw new Error('Please enter the delivery distance so we can verify the leche flan restriction.');
      }

      if (isLecheFlanRestricted) {
        throw new Error('Leche flan delivery is limited to 3 km only.');
      }

      const submittedFullName = formData.fullName.trim();

      if (submittedFullName) {
        await updateLoggedInCustomer({
          fullName: submittedFullName,
          phoneNumber: formData.phone.trim(),
          ...(hasSelectedSavedAddress
            ? {}
            : { address: formData.deliveryMethod === 'delivery' ? checkoutDeliveryAddress.address : formData.address.trim() }),
        });
      }

      const lineItems = cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        category: item.category || 'Uncategorized',
        quantity: item.quantity,
        price: Number(item.price) || 0,
        lineTotal: (Number(item.price) || 0) * item.quantity,
      }));

      const stockCheck = validateStockAvailability(lineItems);

      if (!stockCheck.isAvailable) {
        const shortageSummary = stockCheck.shortages
          .map((item) => `${item.name} (${item.available} left, you selected ${item.requested})`)
          .join(', ');

        setSubmitError(`Not enough stock for: ${shortageSummary}. Please update your cart and try again.`);
        return;
      }

      const selectedAddressId = hasSelectedSavedAddress ? formData.deliveryAddressId : '';
      const isDeliveryOrder = formData.deliveryMethod === 'delivery';

      if (formData.paymentMethod === 'online') {
        if (!paymentStatus.configured) {
          throw new Error('Error 503: Online payment is temporarily unavailable. Please choose cash or try again later.');
        }

        const checkoutSession = await apiRequest('/api/payments/checkout-sessions', {
          method: 'POST',
          body: JSON.stringify({
            customerName: submittedFullName || loggedInCustomer.username || 'Customer',
            phoneNumber: formData.phone.trim(),
            address: isDeliveryOrder ? checkoutDeliveryAddress.address : formData.address.trim(),
            deliveryMethod: formData.deliveryMethod,
            paymentMethod: 'online',
            deliveryAddressId: isDeliveryOrder ? selectedAddressId : '',
            deliveryDistanceKm: isDeliveryOrder ? deliveryDistance : null,
            deliveryLatitude: isDeliveryOrder && Number.isFinite(checkoutDeliveryLatitude)
              ? checkoutDeliveryLatitude
              : null,
            deliveryLongitude: isDeliveryOrder && Number.isFinite(checkoutDeliveryLongitude)
              ? checkoutDeliveryLongitude
              : null,
            deliveryRecipientName: isDeliveryOrder ? checkoutDeliveryAddress.recipientName : '',
            deliveryContactNumber: isDeliveryOrder ? checkoutDeliveryAddress.contactNumber : '',
            deliveryStreetAddress: isDeliveryOrder ? checkoutDeliveryAddress.streetAddress : '',
            deliveryBarangay: isDeliveryOrder ? checkoutDeliveryAddress.barangay : '',
            deliveryCity: isDeliveryOrder ? checkoutDeliveryAddress.city : '',
            deliveryProvince: isDeliveryOrder ? checkoutDeliveryAddress.province : '',
            deliveryPostalCode: isDeliveryOrder ? checkoutDeliveryAddress.postalCode : '',
            deliveryFormattedAddress: isDeliveryOrder ? checkoutDeliveryAddress.formattedAddress || checkoutDeliveryAddress.address : '',
            deliveryPlaceId: isDeliveryOrder ? checkoutDeliveryAddress.placeId : '',
            deliveryInstructions: formData.deliveryInstructions.trim(),
            lineItems,
          }),
        }, {
          auth: true,
        });

        if (!checkoutSession?.checkoutUrl) {
          throw new Error('PayMongo did not return a checkout URL.');
        }

        if (!checkoutSession?.referenceNumber) {
          throw new Error('PayMongo did not return a checkout reference.');
        }

        for (const item of cartItems) {
          await removeFromCart(item.id);
        }
        void refreshOrders();
        checkoutCompletedRef.current = true;
        navigate(`/checkout/paymongo/success?reference=${encodeURIComponent(checkoutSession.referenceNumber)}&stage=payment-selection`);
        return;
      }

      await addOrder({
        customer: submittedFullName || (loggedInCustomer ? loggedInCustomer.username : 'Guest'),
        customerUsername: loggedInCustomer?.username || '',
        phoneNumber: formData.phone,
        address: isDeliveryOrder ? checkoutDeliveryAddress.address : formData.address,
        subtext: isDeliveryOrder ? checkoutDeliveryAddress.address : 'Pick-up / Pay at Store',
        lineItems,
        totalAmount: total,
        total: `PHP ${total.toFixed(2)}`,
        paymentMethod: formData.paymentMethod,
        deliveryMethod: formData.deliveryMethod,
        deliveryAddressId: isDeliveryOrder ? selectedAddressId : '',
        status: isDeliveryOrder && formData.paymentMethod === 'cash' ? 'pending' : 'confirmed',
        deliveryDistanceKm: isDeliveryOrder && Number.isFinite(deliveryDistance) ? deliveryDistance : null,
        deliveryLatitude: isDeliveryOrder && Number.isFinite(checkoutDeliveryLatitude)
          ? checkoutDeliveryLatitude
          : null,
        deliveryLongitude: isDeliveryOrder && Number.isFinite(checkoutDeliveryLongitude)
          ? checkoutDeliveryLongitude
          : null,
        deliveryRecipientName: isDeliveryOrder ? checkoutDeliveryAddress.recipientName : '',
        deliveryContactNumber: isDeliveryOrder ? checkoutDeliveryAddress.contactNumber : '',
        deliveryStreetAddress: isDeliveryOrder ? checkoutDeliveryAddress.streetAddress : '',
        deliveryBarangay: isDeliveryOrder ? checkoutDeliveryAddress.barangay : '',
        deliveryCity: isDeliveryOrder ? checkoutDeliveryAddress.city : '',
        deliveryProvince: isDeliveryOrder ? checkoutDeliveryAddress.province : '',
        deliveryPostalCode: isDeliveryOrder ? checkoutDeliveryAddress.postalCode : '',
        deliveryFormattedAddress: isDeliveryOrder ? checkoutDeliveryAddress.formattedAddress || checkoutDeliveryAddress.address : '',
        deliveryPlaceId: isDeliveryOrder ? checkoutDeliveryAddress.placeId : '',
        deliveryInstructions: formData.deliveryInstructions.trim(),
      });

      await refreshProducts();
      for (const item of cartItems) {
        await removeFromCart(item.id);
      }
      // Cart cleanup must not redirect a completed checkout back to an empty cart
      // while React Router is transitioning to the order confirmation page.
      checkoutCompletedRef.current = true;
      navigate('/orders');
    } catch (error) {
      const shortageItems = error?.details?.shortages;
      if (Array.isArray(shortageItems) && shortageItems.length > 0) {
        setSubmitError(shortageItems
          .map((item) => `${item.productName} (${item.available} left, you selected ${item.requested})`)
          .join(', '));
      } else {
        setSubmitError(error.message || 'Unable to place the order right now.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0 && !isSubmitting) return null;

  return (
    <div className="checkout-container">
      <div className="checkout-page-heading">
        <Link to="/cart" className="checkout-back-link">← Back to cart</Link>
        <h1>Checkout</h1>
        <p>Just a few details, then your treats are on their way.</p>
        <p>Ordering hours: {operatingHoursLabel}.</p>
        {!canCheckout && <p role="status">{isShopSettingsLoading ? 'Checking shop hours…' : shopSettingsError ? 'We cannot confirm shop hours right now. Please try again shortly.' : 'The shop is closed for orders. Your cart is saved for later.'}</p>}
      </div>

      <div className="checkout-content">
        <form id="customer-checkout-form" className="checkout-form" onSubmit={handleSubmit}>
          {submitError && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.9rem 1rem',
                borderRadius: '0.85rem',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: '0.92rem',
                lineHeight: 1.5,
                fontWeight: 600,
              }}
            >
              {formatCurrencyText(submitError)}
            </div>
          )}

          {!isPaymentStatusLoading && formData.deliveryMethod === 'delivery' && !paymentStatus.configured && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.95rem 1rem',
                borderRadius: '0.85rem',
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                fontSize: '0.92rem',
                lineHeight: 1.6,
              }}
            >
              Online payment is currently unavailable. You can pay with cash when your order arrives or at pick-up.
            </div>
          )}

          <div className="form-section">
            <h2 className="section-title">1. Contact Information</h2>
            <div className="form-group">
              <label htmlFor="checkout-fullName">Full Name</label>
              <input
                type="text"
                id="checkout-fullName"
                  autoComplete="name"
                  name="fullName"
                className="text-input"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="Juan Dela Cruz"
              />
            </div>
            <div className="form-group">
              <label htmlFor="checkout-phone">Contact Number</label>
              <input
                type="text"
                id="checkout-phone"
                  autoComplete="tel"
                  name="phone"
                className="text-input"
                value={formData.phone}
                onChange={handleChange}
                required
                placeholder="09123456789"
              />
            </div>
          </div>

          <div className="form-section">
            <h2 className="section-title">2. Delivery Method</h2>
            <div className="method-options">
              <label className={`method-card ${formData.deliveryMethod === 'delivery' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="delivery"
                  checked={formData.deliveryMethod === 'delivery'}
                  onChange={handleChange}
                  className="checkout-method-radio"
                />
                <Truck size={24} className="method-icon" />
                <div className="method-details">
                  <span className="method-name">Delivery</span>
                  <span className="method-desc">We deliver to your door</span>
                </div>
              </label>

              <label className={`method-card ${formData.deliveryMethod === 'pickup' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="pickup"
                  checked={formData.deliveryMethod === 'pickup'}
                  onChange={handleChange}
                  className="checkout-method-radio"
                />
                <Store size={24} className="method-icon" />
                <div className="method-details">
                  <span className="method-name">Pick-up</span>
                  <span className="method-desc">Pick up at our store (Free)</span>
                </div>
              </label>
            </div>
          </div>

          {formData.deliveryMethod === 'delivery' && (
            <div className="form-section">
              <h2 className="section-title">Delivery address</h2>
              <div className="checkout-saved-addresses">
                <div className="checkout-saved-addresses-heading">
                  <div>
                    <strong>Saved Delivery Addresses</strong>
                  </div>
                  <button type="button" className="checkout-manage-addresses" onClick={() => navigate('/profile')}>
                    Manage
                  </button>
                </div>

                {!hasLoadedAddresses || isAddressesLoading ? (
                  <p className="checkout-saved-addresses-empty">Loading saved addresses...</p>
                ) : addresses.length === 0 ? (
                  <p className="checkout-saved-addresses-empty">Save the completed address below to use it automatically on future orders.</p>
                ) : (
                  <div className="checkout-saved-address-grid">
                    {addresses.map((savedAddress) => (
                      <button
                        key={savedAddress.id}
                        type="button"
                        className={`checkout-saved-address-card ${formData.deliveryAddressId === savedAddress.id ? 'is-selected' : ''}`}
                        onClick={() => handleSelectSavedAddress(savedAddress)}
                      >
                        <span className="checkout-saved-address-card-topline">
                          <strong>{savedAddress.label}</strong>
                          {savedAddress.isDefault && <em>Default</em>}
                        </span>
                        <span>{savedAddress.recipientName}</span>
                        <small>{savedAddress.phoneNumber}</small>
                        <small>{savedAddress.formattedAddress}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="checkout-address-grid">
                <div className="form-group">
                  <label htmlFor="checkout-deliveryRecipientName">Recipient Name</label>
                  <input
                    type="text"
                    id="checkout-deliveryRecipientName"
                  autoComplete="shipping name"
                  name="deliveryRecipientName"
                    className="text-input"
                    value={formData.deliveryRecipientName}
                    onChange={handleChange}
                    required={!hasSelectedSavedAddress}
                    placeholder="Juan Dela Cruz"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-deliveryContactNumber">Contact Number</label>
                  <input
                    type="tel"
                    id="checkout-deliveryContactNumber"
                  autoComplete="shipping tel"
                  name="deliveryContactNumber"
                    className="text-input"
                    value={formData.deliveryContactNumber}
                    onChange={handleChange}
                    required={!hasSelectedSavedAddress}
                    placeholder="09123456789"
                  />
                </div>

                <div className="form-group checkout-address-grid-wide">
                  <label htmlFor="checkout-deliveryStreetAddress">Street Address</label>
                  <input
                    type="text"
                    id="checkout-deliveryStreetAddress"
                  autoComplete="shipping address-line1"
                  name="deliveryStreetAddress"
                    className="text-input"
                    value={formData.deliveryStreetAddress}
                    onChange={handleDeliveryAddressFieldChange}
                    required={!hasSelectedSavedAddress}
                    placeholder="House/unit number and street"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-deliveryBarangay">Barangay (optional)</label>
                  <input
                    type="text"
                    id="checkout-deliveryBarangay"
                  autoComplete="shipping address-line2"
                  name="deliveryBarangay"
                    className="text-input"
                    value={formData.deliveryBarangay}
                    onChange={handleDeliveryAddressFieldChange}
                    placeholder="Barangay"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-deliveryCity">City/Municipality</label>
                  <input
                    type="text"
                    id="checkout-deliveryCity"
                  autoComplete="shipping address-level2"
                  name="deliveryCity"
                    className="text-input"
                    value={formData.deliveryCity}
                    onChange={handleDeliveryAddressFieldChange}
                    required={!hasSelectedSavedAddress}
                    placeholder="City or municipality"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-deliveryProvince">Province</label>
                  <input
                    type="text"
                    id="checkout-deliveryProvince"
                  autoComplete="shipping address-level1"
                  name="deliveryProvince"
                    className="text-input"
                    value={formData.deliveryProvince}
                    onChange={handleDeliveryAddressFieldChange}
                    required={!hasSelectedSavedAddress}
                    placeholder="Province"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="checkout-deliveryPostalCode">ZIP/Postal Code (optional)</label>
                  <input
                    type="text"
                    id="checkout-deliveryPostalCode"
                  autoComplete="shipping postal-code"
                  name="deliveryPostalCode"
                    inputMode="numeric"
                    className="text-input"
                    value={formData.deliveryPostalCode}
                    onChange={handleDeliveryAddressFieldChange}
                    placeholder="Postal code"
                  />
                </div>
              </div>

              <LocationPinPicker
                latitude={formData.deliveryLatitude}
                longitude={formData.deliveryLongitude}
                initialCenter={shopSettings}
                onChange={handleDeliveryPinChange}
                label="Delivery location"
                disabled={isSubmitting || isSavingDeliveryAddress}
              />
              {addressStatus && <p className="checkout-address-status" role="status">{addressStatus}</p>}

              {!hasSelectedSavedAddress && (
                <div className="checkout-save-address">
                  <div>
                    <strong>Save this delivery address</strong>
                    <span>Keep it in your account so you can select it on future orders.</span>
                  </div>
                  <label className="checkout-save-address-default">
                    <input
                      type="checkbox"
                      checked={addresses.length === 0 || saveAddressAsDefault}
                      disabled={addresses.length === 0}
                      onChange={(event) => setSaveAddressAsDefault(event.target.checked)}
                    />
                    <span>{addresses.length === 0 ? 'This will be your default address' : 'Make this my default address'}</span>
                  </label>
                  <LoadingButton
                    type="button"
                    className="checkout-save-address-button"
                    isLoading={isSavingDeliveryAddress}
                    onClick={handleSaveDeliveryAddress}
                  >
                    Save Address
                  </LoadingButton>
                </div>
              )}

              {savedAddressNotice && <p className="checkout-save-address-notice">{savedAddressNotice}</p>}

              <div className="form-group">
                <label htmlFor="checkout-deliveryDistanceKm">Delivery Distance (km)</label>
                <input
                  type="number"
                  id="checkout-deliveryDistanceKm"
                  autoComplete="off"
                  name="deliveryDistanceKm"
                  inputMode="decimal"
                  className="text-input"
                  value={formData.deliveryDistanceKm}
                  onChange={handleChange}
                  min="0"
                  step="0.1"
                  required={containsLecheFlan}
                  placeholder="e.g. 2.5"
                />
              </div>

              {containsLecheFlan && (
                <div className={`checkout-warning ${isLecheFlanRestricted ? 'is-blocked' : ''}`}>
                  {isLecheFlanRestricted
                    ? 'Leche flan delivery is limited to 3 km only.'
                    : 'Your cart contains leche flan. Delivery distance must be 3 km or less.'}
                </div>
              )}

              <div className="form-group">
                <label htmlFor="checkout-deliveryInstructions">Special Delivery Instructions</label>
                <textarea
                  id="checkout-deliveryInstructions"
                  autoComplete="off"
                  name="deliveryInstructions"
                  className="text-input"
                  value={formData.deliveryInstructions}
                  onChange={handleChange}
                  placeholder="Gate code, landmark, preferred handoff note"
                  style={{ minHeight: '74px' }}
                />
              </div>
            </div>
          )}

          <div className="form-section">
            <h2 className="section-title">3. Payment Method</h2>
            <div className="method-options">
              <label className={`method-card ${formData.paymentMethod === 'online' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="online"
                  checked={formData.paymentMethod === 'online'}
                  onChange={handleChange}
                  className="checkout-method-radio"
                  disabled={!paymentStatus.configured}
                />
                <CreditCard size={24} className="method-icon" style={{ color: '#3b82f6' }} />
                <div className="method-details">
                  <span className="method-name">Pay Online</span>
                  <span className="method-desc">
                    {paymentStatus.configured
                      ? 'Generate your order reference instantly, then continue through PayMongo.'
                      : 'Online payment is temporarily unavailable. Please choose cash or try again later.'}
                  </span>
                </div>
              </label>

              <label className={`method-card ${formData.paymentMethod === 'cash' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={formData.paymentMethod === 'cash'}
                  onChange={handleChange}
                  className="checkout-method-radio"
                />
                <Banknote size={24} className="method-icon" style={{ color: '#10b981' }} />
                <div className="method-details">
                  <span className="method-name">{formData.deliveryMethod === 'delivery' ? 'Cash on Delivery (COD)' : 'Pay at Store'}</span>
                  <span className="method-desc">
                    {formData.deliveryMethod === 'delivery'
                      ? 'Pay when you receive your order.'
                      : 'Generate your Order ID right away and pay during pickup.'}
                  </span>
                </div>
              </label>
            </div>

            {formData.deliveryMethod === 'pickup' && formData.paymentMethod === 'online' && paymentStatus.configured && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.9rem 1rem',
                  borderRadius: '0.85rem',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  color: '#1d4ed8',
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                }}
              >
                Your Order ID and QR will appear right after you continue, before you leave for PayMongo payment.
              </div>
            )}

            {formData.deliveryMethod === 'pickup' && formData.paymentMethod === 'cash' && (
              <div
                style={{
                  marginTop: '0.9rem',
                  padding: '0.9rem 1rem',
                  borderRadius: '0.85rem',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  color: '#166534',
                  fontSize: '0.92rem',
                  lineHeight: 1.6,
                }}
              >
                Your Order ID and QR will be generated as soon as you place this pickup order. No staff confirmation is needed before your reference appears.
              </div>
            )}
          </div>

        </form>

        <div className="checkout-summary">
          <div className="summary-card">
            <h2 className="summary-title">Order Summary</h2>

            <div className="summary-items">
              {cartItems.map((item) => (
                <div key={item.id} className="summary-item">
                  <div className="summary-item-info">
                    <span className="summary-item-qty">{item.quantity}x</span>
                    <span className="summary-item-name">{item.name}</span>
                  </div>
                  <span className="summary-item-price">{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="summary-divider"></div>

            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="summary-row">
              <span>Delivery Fee</span>
              <span>{formatCurrency(deliveryFee)}</span>
            </div>
            {formData.deliveryMethod === 'delivery' && containsLecheFlan && (
              <div className="summary-row">
                <span>Leche Flan Check</span>
                <span className={isLecheFlanRestricted ? 'summary-flag-danger' : 'summary-flag-ok'}>
                  {isLecheFlanRestricted ? 'Blocked over 3 km' : 'Within limit'}
                </span>
              </div>
            )}

            <div className="summary-divider"></div>

            <div className="summary-total">
              <span>Total</span>
              <span className="amount">{formatCurrency(total)}</span>
            </div>
            <LoadingButton type="submit" form="customer-checkout-form" className="btn-primary place-order-btn" isLoading={isSubmitting} disabled={!canCheckout}>
              {isShopSettingsLoading ? 'Checking hours' : shopSettingsError ? 'Hours unavailable' : !isShopOpen ? 'Shop closed' : formData.paymentMethod === 'online'
                ? 'Review QR and Continue'
                : 'Place Order'}
            </LoadingButton>
            <p className="checkout-helper-copy">Review your details and total before placing your order.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
