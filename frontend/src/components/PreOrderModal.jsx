import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import LoadingButton from './LoadingButton';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Package2,
  Phone,
  Store,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePreOrders } from '../context/PreOrderContext';
import {
  formatPreOrderDateTime,
  getPreOrderMethodLabel,
  getTomorrowDateValue,
  isValidPhilippinePhoneNumber,
} from '../utils/preOrders';
import './PreOrderModal.css';

const buildInitialFormState = (product, customer) => ({
  fullName: customer?.fullName || customer?.username || '',
  address: customer?.address || '',
  phoneNumber: customer?.phoneNumber || '',
  quantity: 1,
  preferredOrderDate: '',
  preferredOrderTime: '',
  deliveryMethod: 'cod',
  pickupDate: '',
  pickupTime: '',
  productName: product?.name || '',
});

const PreOrderModal = ({ product, isOpen, onClose }) => {
  const { loggedInCustomer, updateLoggedInCustomer } = useAuth();
  const { createPreOrder } = usePreOrders();
  const [formData, setFormData] = useState(() => buildInitialFormState(product, loggedInCustomer));
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedPreOrder, setSubmittedPreOrder] = useState(null);
  const tomorrowDate = useMemo(() => getTomorrowDateValue(), []);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = '';
      return undefined;
    }

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSubmittedPreOrder(null);
      setFormError('');
    }

    setFormData(buildInitialFormState(product, loggedInCustomer));
  }, [isOpen, loggedInCustomer, product]);

  if (!isOpen || !product) {
    return null;
  }

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => {
      const nextState = {
        ...current,
        [name]: value,
      };

      if (name === 'deliveryMethod' && value === 'pickup') {
        nextState.pickupDate = current.pickupDate || current.preferredOrderDate;
        nextState.pickupTime = current.pickupTime || current.preferredOrderTime;
      }

      return nextState;
    });
    setFormError('');
  };

  const validateForm = () => {
    if (!formData.fullName.trim()) {
      return 'Full name is required.';
    }

    if (!formData.address.trim()) {
      return 'Address is required.';
    }

    if (!formData.phoneNumber.trim()) {
      return 'Contact number is required.';
    }

    if (!isValidPhilippinePhoneNumber(formData.phoneNumber)) {
      return 'Contact number must be a valid Philippine mobile number.';
    }

    const quantity = Number(formData.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return 'Quantity must be at least 1.';
    }

    if (!formData.preferredOrderDate || formData.preferredOrderDate < tomorrowDate) {
      return 'Preferred order date must be at least 1 day ahead.';
    }

    if (!formData.preferredOrderTime) {
      return 'Preferred time is required.';
    }

    if (formData.deliveryMethod === 'pickup') {
      if (!formData.pickupDate || formData.pickupDate < tomorrowDate) {
        return 'Pickup date must be at least 1 day ahead.';
      }

      if (!formData.pickupTime) {
        return 'Pickup time is required when pickup is selected.';
      }
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      await updateLoggedInCustomer({
        fullName: formData.fullName.trim(),
        address: formData.address.trim(),
        phoneNumber: formData.phoneNumber.trim(),
      });

      const createdPreOrder = await createPreOrder({
        productId: product.id,
        customerName: formData.fullName.trim(),
        address: formData.address.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        quantity: Number(formData.quantity),
        preferredOrderDate: formData.preferredOrderDate,
        preferredOrderTime: formData.preferredOrderTime,
        deliveryMethod: formData.deliveryMethod,
        pickupDate: formData.deliveryMethod === 'pickup' ? formData.pickupDate : '',
        pickupTime: formData.deliveryMethod === 'pickup' ? formData.pickupTime : '',
      });

      setSubmittedPreOrder(createdPreOrder);
    } catch (error) {
      setFormError(error.message || 'Unable to place the pre-order right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scheduledDate = submittedPreOrder?.scheduledDate || (
    formData.deliveryMethod === 'pickup'
      ? formData.pickupDate
      : formData.preferredOrderDate
  );
  const scheduledTime = submittedPreOrder?.scheduledTime || (
    formData.deliveryMethod === 'pickup'
      ? formData.pickupTime
      : formData.preferredOrderTime
  );
  const confirmationText = scheduledDate
    ? `Your pre-order has been successfully placed for ${formatPreOrderDateTime(scheduledDate, scheduledTime)}.`
    : 'Your pre-order has been successfully placed.';

  return createPortal(
    <div
      className="preorder-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div className="preorder-shell">
        <button
          type="button"
          className="preorder-close"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close pre-order form"
        >
          <X size={20} />
        </button>

        {submittedPreOrder ? (
          <div className="preorder-success">
            <div className="preorder-success-icon">
              <CheckCircle2 size={42} />
            </div>
            <p className="preorder-kicker">Pre-Order</p>
            <h2>Pre-Order Successful!</h2>
            <p className="preorder-success-copy">{confirmationText}</p>

            <div className="preorder-summary-card">
              <h3>Order Summary</h3>
              <div className="preorder-summary-row">
                <span>Product</span>
                <strong>{submittedPreOrder.productName}</strong>
              </div>
              <div className="preorder-summary-row">
                <span>Quantity</span>
                <strong>{submittedPreOrder.quantity}</strong>
              </div>
              <div className="preorder-summary-row">
                <span>Schedule</span>
                <strong>{formatPreOrderDateTime(submittedPreOrder.scheduledDate, submittedPreOrder.scheduledTime)}</strong>
              </div>
              <div className="preorder-summary-row">
                <span>Method</span>
                <strong>{getPreOrderMethodLabel(submittedPreOrder.deliveryMethod)}</strong>
              </div>
            </div>

            <button type="button" className="preorder-submit" onClick={onClose}>
              OK, Got it
            </button>
          </div>
        ) : (
          <form className="preorder-form" onSubmit={handleSubmit}>
            <div className="preorder-header">
              <div>
                <p className="preorder-kicker">Advance Orders</p>
                <h2>Pre-Order</h2>
              </div>
              <p className="preorder-header-copy">
                Schedule your dessert in advance for bulk orders, events, or planned pickup and delivery.
              </p>
            </div>

            {formError && (
              <div className="preorder-error" role="alert">
                {formError}
              </div>
            )}

            <div className="preorder-grid">
              <section className="preorder-section">
                <h3>1. Customer Information</h3>

                <label className="preorder-field">
                  <span>Full Name</span>
                  <div className="preorder-input-wrap">
                    <User size={16} />
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                </label>

                <label className="preorder-field">
                  <span>Address</span>
                  <div className="preorder-input-wrap preorder-input-wrap--textarea">
                    <MapPin size={16} />
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      placeholder="Enter your complete address"
                      rows="3"
                      required
                    />
                  </div>
                </label>

                <label className="preorder-field">
                  <span>Contact Number</span>
                  <div className="preorder-input-wrap">
                    <Phone size={16} />
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      placeholder="09123456789"
                      required
                    />
                  </div>
                </label>

                <h3>2. Order Details</h3>

                <label className="preorder-field">
                  <span>Product</span>
                  <div className="preorder-input-wrap">
                    <Package2 size={16} />
                    <input
                      type="text"
                      name="productName"
                      value={formData.productName}
                      readOnly
                    />
                  </div>
                </label>

                <label className="preorder-field">
                  <span>Quantity</span>
                  <input
                    type="number"
                    name="quantity"
                    value={formData.quantity}
                    onChange={handleChange}
                    min="1"
                    step="1"
                    placeholder="Enter quantity"
                    required
                  />
                </label>
              </section>

              <section className="preorder-section">
                <h3>3. Schedule</h3>

                <label className="preorder-field">
                  <span>Preferred Date of Order</span>
                  <div className="preorder-input-wrap">
                    <CalendarDays size={16} />
                    <input
                      type="date"
                      name="preferredOrderDate"
                      value={formData.preferredOrderDate}
                      onChange={handleChange}
                      min={tomorrowDate}
                      required
                    />
                  </div>
                  <small>Minimum 1 day in advance.</small>
                </label>

                <label className="preorder-field">
                  <span>Preferred Time</span>
                  <div className="preorder-input-wrap">
                    <Clock3 size={16} />
                    <input
                      type="time"
                      name="preferredOrderTime"
                      value={formData.preferredOrderTime}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </label>

                <h3>4. Delivery / Payment Method</h3>
                <div className="preorder-method-grid">
                  <label className={`preorder-method-card ${formData.deliveryMethod === 'cod' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="cod"
                      checked={formData.deliveryMethod === 'cod'}
                      onChange={handleChange}
                    />
                    <Truck size={18} />
                    <div>
                      <strong>Cash on Delivery</strong>
                      <span>Schedule advance delivery and pay upon arrival.</span>
                    </div>
                  </label>

                  <label className={`preorder-method-card ${formData.deliveryMethod === 'pickup' ? 'is-selected' : ''}`}>
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="pickup"
                      checked={formData.deliveryMethod === 'pickup'}
                      onChange={handleChange}
                    />
                    <Store size={18} />
                    <div>
                      <strong>Pickup</strong>
                      <span>Reserve now and pick it up on your chosen schedule.</span>
                    </div>
                  </label>
                </div>

                {formData.deliveryMethod === 'pickup' && (
                  <div className="preorder-pickup-panel">
                    <h4>Pickup Details</h4>
                    <div className="preorder-inline-grid">
                      <label className="preorder-field">
                        <span>Pickup Date</span>
                        <div className="preorder-input-wrap">
                          <CalendarDays size={16} />
                          <input
                            type="date"
                            name="pickupDate"
                            value={formData.pickupDate}
                            onChange={handleChange}
                            min={tomorrowDate}
                            required
                          />
                        </div>
                      </label>

                      <label className="preorder-field">
                        <span>Pickup Time</span>
                        <div className="preorder-input-wrap">
                          <Clock3 size={16} />
                          <input
                            type="time"
                            name="pickupTime"
                            value={formData.pickupTime}
                            onChange={handleChange}
                            required
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="preorder-footer">
              <p className="preorder-footer-note">Your pre-order will be saved with a pending status for admin review.</p>
              <div className="preorder-footer-actions">
                <button type="button" className="preorder-cancel" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <LoadingButton type="submit" className="preorder-submit" isLoading={isSubmitting}>
                  Submit Pre-Order
                </LoadingButton>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default PreOrderModal;
