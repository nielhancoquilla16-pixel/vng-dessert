import React, { useState } from 'react';
import { Check, MapPin, Pencil, Star, Trash2, X } from 'lucide-react';
import LoadingButton from './LoadingButton';
import LocationPinPicker from './LocationPinPicker';
import { useCustomerAddresses } from '../context/CustomerAddressesContext';
import { useShopSettings } from '../context/ShopSettingsContext';
import useDialogFocus from '../hooks/useDialogFocus';
import {
  ADDRESS_PIN_ERROR,
  buildDeliveryAddressText,
  isValidLocation,
} from '../lib/deliveryLocation';
import './SavedAddressManager.css';

const emptyAddress = () => ({
  label: 'Home',
  recipientName: '',
  phoneNumber: '',
  streetAddress: '',
  barangay: '',
  city: '',
  province: '',
  region: '',
  postalCode: '',
  formattedAddress: '',
  placeId: '',
  latitude: '',
  longitude: '',
  isDefault: false,
});

const mapAddressToDraft = (address = null) => ({
  ...emptyAddress(),
  ...(address || {}),
  streetAddress: address?.streetAddress || address?.formattedAddress || '',
  latitude: address?.latitude ?? '',
  longitude: address?.longitude ?? '',
});

const SavedAddressManager = () => {
  const {
    addresses,
    isAddressesLoading,
    addressesError,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  } = useCustomerAddresses();
  const { shopSettings } = useShopSettings();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState('');
  const [draft, setDraft] = useState(emptyAddress);
  const [formError, setFormError] = useState('');
  const [addressStatus, setAddressStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [busyAddressId, setBusyAddressId] = useState('');

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingAddressId('');
    setDraft(emptyAddress());
    setFormError('');
    setAddressStatus('');
  };

  const dialogRef = useDialogFocus({ isOpen: isEditorOpen, onClose: closeEditor, closeDisabled: isSaving });

  const openEditEditor = (address) => {
    setEditingAddressId(address.id);
    setDraft(mapAddressToDraft(address));
    setFormError('');
    setAddressStatus('');
    setIsEditorOpen(true);
  };

  const handleFieldChange = (event) => {
    const { name, value, type, checked } = event.target;
    const shouldClearLocation = [
      'streetAddress',
      'barangay',
      'city',
      'province',
      'region',
      'postalCode',
    ].includes(name);

    setDraft((current) => {
      const next = {
        ...current,
        [name]: type === 'checkbox' ? checked : value,
      };

      if (!shouldClearLocation) {
        return next;
      }

      return {
        ...next,
        formattedAddress: buildDeliveryAddressText(next),
        placeId: '',
        latitude: '',
        longitude: '',
      };
    });
    setFormError('');
    if (shouldClearLocation) {
      setAddressStatus('Address changed. Select the matching delivery pin on the map again.');
    }
  };

  const handlePinChange = ({ latitude, longitude }) => {
    setDraft((current) => ({
      ...current,
      formattedAddress: buildDeliveryAddressText(current),
      placeId: '',
      latitude,
      longitude,
    }));
    setFormError('');
    setAddressStatus(isValidLocation({ latitude, longitude })
      ? 'Delivery pin selected. Check your address details, then save.'
      : ADDRESS_PIN_ERROR);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!isValidLocation(draft)) {
      setFormError(ADDRESS_PIN_ERROR);
      return;
    }
    setIsSaving(true);
    setFormError('');

    try {
      const addressPayload = {
        ...draft,
        formattedAddress: buildDeliveryAddressText(draft),
      };
      await updateAddress(editingAddressId, addressPayload);
      closeEditor();
    } catch (error) {
      setFormError(error.message || 'Unable to save this address.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (addressId) => {
    setBusyAddressId(addressId);
    try {
      await setDefaultAddress(addressId);
    } catch (error) {
      setFormError(error.message || 'Unable to update the default address.');
    } finally {
      setBusyAddressId('');
    }
  };

  const handleDelete = async (addressId) => {
    setBusyAddressId(addressId);
    setFormError('');
    try {
      await deleteAddress(addressId);
    } catch (error) {
      setFormError(error.message || 'Unable to delete this address.');
    } finally {
      setBusyAddressId('');
    }
  };

  return (
    <section className="saved-addresses-section customer-profile-card">
      <div className="saved-addresses-heading">
        <div>
          <span className="saved-addresses-kicker">Delivery Addresses</span>
          <h2>Saved Addresses</h2>
        </div>
      </div>

      {formError && !isEditorOpen && <div className="saved-addresses-feedback error" role="alert">{formError}</div>}
      {addressesError && <div className="saved-addresses-feedback error" role="alert">{addressesError}</div>}

      {isAddressesLoading ? (
        <p className="saved-addresses-empty">Loading saved addresses...</p>
      ) : addresses.length === 0 ? (
        <p className="saved-addresses-empty">No saved delivery addresses yet. Save your Default Address above to add one.</p>
      ) : (
        <div className="saved-addresses-list">
          {addresses.map((address) => (
            <article key={address.id} className="saved-address-card">
              <div className="saved-address-card-topline">
                <span className="saved-address-label"><MapPin size={15} /> {address.label}</span>
                {address.isDefault && <span className="saved-address-default"><Star size={14} /> Default</span>}
              </div>
              <strong>{address.recipientName}</strong>
              <span>{address.phoneNumber}</span>
              <p>{address.formattedAddress}</p>
              <div className="saved-address-actions">
                <button type="button" onClick={() => openEditEditor(address)} disabled={busyAddressId === address.id}>
                  <Pencil size={15} /> Edit
                </button>
                {!address.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(address.id)} disabled={busyAddressId === address.id}>
                    <Check size={15} /> Set Default
                  </button>
                )}
                <button type="button" className="is-danger" onClick={() => handleDelete(address.id)} disabled={busyAddressId === address.id}>
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {isEditorOpen && (
        <div className="saved-address-modal-backdrop" role="presentation">
          <div ref={dialogRef} tabIndex={-1} className="saved-address-modal" role="dialog" aria-modal="true" aria-labelledby="saved-address-title">
            <div className="saved-address-modal-header">
              <div>
                <span className="saved-addresses-kicker">Delivery Address</span>
                <h2 id="saved-address-title">Edit Address</h2>
              </div>
              <button type="button" className="saved-address-modal-close" onClick={closeEditor} disabled={isSaving} aria-label="Close address form">
                <X size={20} />
              </button>
            </div>

            <form className="saved-address-form" onSubmit={handleSave}>
              <div className="saved-address-form-grid">
                <label>
                  Address Label
                  <select name="label" value={draft.label} onChange={handleFieldChange}>
                    <option value="Home">Home</option>
                    <option value="Work">Work</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label>
                  Recipient Name
                  <input name="recipientName" autoComplete="name" value={draft.recipientName} onChange={handleFieldChange} required />
                </label>
                <label>
                  Contact Number
                  <input name="phoneNumber" type="tel" autoComplete="tel" value={draft.phoneNumber} onChange={handleFieldChange} required />
                </label>
                <label className="saved-address-form-wide">
                  Street Address
                  <input name="streetAddress" autoComplete="street-address" value={draft.streetAddress} onChange={handleFieldChange} placeholder="House/unit number and street" required />
                </label>
                <label>
                  Barangay
                  <input name="barangay" value={draft.barangay} onChange={handleFieldChange} />
                </label>
                <label>
                  City/Municipality
                  <input name="city" value={draft.city} onChange={handleFieldChange} required />
                </label>
                <label>
                  Province
                  <input name="province" value={draft.province} onChange={handleFieldChange} required />
                </label>
                <label>
                  Region
                  <input name="region" value={draft.region} onChange={handleFieldChange} />
                </label>
                <label>
                  ZIP/Postal Code
                  <input name="postalCode" inputMode="numeric" autoComplete="postal-code" value={draft.postalCode} onChange={handleFieldChange} />
                </label>
              </div>

              <LocationPinPicker
                latitude={draft.latitude}
                longitude={draft.longitude}
                initialCenter={shopSettings}
                onChange={handlePinChange}
                label="Delivery location"
                disabled={isSaving}
              />

              {addressStatus && <p className="saved-address-status" role="status">{addressStatus}</p>}
              {formError && <div className="saved-addresses-feedback error" role="alert">{formError}</div>}

              <label className="saved-address-default-toggle">
                <input name="isDefault" type="checkbox" checked={draft.isDefault} onChange={handleFieldChange} />
                Set as default delivery address
              </label>

              <div className="saved-address-modal-actions">
                <button type="button" className="saved-address-cancel" onClick={closeEditor} disabled={isSaving}>Cancel</button>
                <LoadingButton type="submit" className="saved-address-save" isLoading={isSaving}>
                  Save Address
                </LoadingButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default SavedAddressManager;
