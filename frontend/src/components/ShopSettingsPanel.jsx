import React, { useState } from 'react';
import { Clock3, MapPin, Save, Store } from 'lucide-react';
import LoadingButton from './LoadingButton';
import LocationPinPicker from './LocationPinPicker';
import { isValidLocation } from '../lib/deliveryLocation';
import { useShopSettings } from '../context/ShopSettingsContext';
import './ShopSettingsPanel.css';

const ShopSettingsPanel = () => {
  const { shopSettings, updateShopSettings, canEditShopSettings, isShopSettingsLoading, shopSettingsError } = useShopSettings();
  // Store only the edited fields. Live refreshes may update the saved values,
  // but must never discard a closing time the admin is still typing.
  const [changes, setChanges] = useState({});
  const draft = { ...shopSettings, ...changes };
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const inputsDisabled = isSaving || isShopSettingsLoading;

  if (!canEditShopSettings) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setSaveFailed(false);
    setIsSaving(true);

    try {
      const hasPickupCoordinates = [draft.latitude, draft.longitude].some((value) => value != null && String(value).trim() !== '');
      if ((hasPickupCoordinates || Object.hasOwn(changes, 'address')) && !isValidLocation(draft)) {
        throw new Error('Select the store’s pickup location on the map before saving.');
      }
      await updateShopSettings(changes);
      setChanges({});
      setMessage('Shop settings updated.');
    } catch (error) {
      setSaveFailed(true);
      setMessage(error.message || 'Unable to update shop settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const setField = (field, value) => {
    setMessage('');
    setChanges((current) => ({
      ...current,
      [field]: value,
      ...(field === 'address' ? { latitude: '', longitude: '' } : {}),
    }));
  };

  return (
    <section className="shop-settings-panel" aria-labelledby="shop-settings-title">
      <div className="shop-settings-heading">
        <div className="shop-settings-heading-icon"><Store size={20} /></div>
        <div>
          <h2 id="shop-settings-title">Shop Settings</h2>
          <p>{shopSettings.address}</p>
        </div>
      </div>
      <p className="shop-settings-timezone">Operating hours use Philippine time (Asia/Manila).</p>
      <p className="shop-settings-timezone">A closing time before opening continues into the next day. 12:00 AM closes at midnight at the end of the operating day.</p>
      {shopSettingsError && <p className="shop-settings-error" role="status">{shopSettingsError}</p>}

      <form className="shop-settings-form" onSubmit={handleSubmit}>
        <label>
          <span>Shop Name</span>
          <input value={draft.shopName || ''} onChange={(event) => setField('shopName', event.target.value)} disabled={inputsDisabled} required />
        </label>
        <label className="shop-settings-wide">
          <span><MapPin size={14} /> Complete Business Address</span>
          <input value={draft.address || ''} onChange={(event) => setField('address', event.target.value)} disabled={inputsDisabled} required />
        </label>
        <label>
          <span>Contact Number</span>
          <input value={draft.phoneNumber || ''} onChange={(event) => setField('phoneNumber', event.target.value)} disabled={inputsDisabled} />
        </label>
        <div className="shop-settings-wide">
          <LocationPinPicker
            label="Store pickup pin"
            latitude={draft.latitude}
            longitude={draft.longitude}
            disabled={inputsDisabled}
            onChange={({ latitude, longitude }) => {
              setMessage('');
              setChanges((current) => ({ ...current, latitude, longitude }));
            }}
          />
        </div>
        <label>
          <span><Clock3 size={14} /> Opening Time</span>
          <input type="time" value={draft.openingTime || ''} onChange={(event) => setField('openingTime', event.target.value)} disabled={inputsDisabled} required />
        </label>
        <label>
          <span><Clock3 size={14} /> Closing Time</span>
          <input type="time" value={draft.closingTime || ''} onChange={(event) => setField('closingTime', event.target.value)} disabled={inputsDisabled} required />
        </label>
        <div className="shop-settings-actions">
          {message && <span className={saveFailed ? 'shop-settings-error' : ''} role={saveFailed ? 'alert' : 'status'}>{message}</span>}
          <LoadingButton type="submit" className="shop-settings-save" isLoading={isSaving} disabled={isShopSettingsLoading || Object.keys(changes).length === 0}>
            <Save size={16} /> Save Settings
          </LoadingButton>
        </div>
      </form>
    </section>
  );
};

export default ShopSettingsPanel;
