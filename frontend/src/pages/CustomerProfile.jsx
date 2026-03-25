import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Mail, MapPin, Phone, Save, UserRound, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './CustomerProfile.css';

const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;

const getInitials = (value = '') => (
  String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CU'
);

const readImageFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

const validateImageFile = (file) => {
  if (!file) {
    return;
  }

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    throw new Error('Only PNG and JPG/JPEG profile pictures are supported.');
  }

  if (file.size > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Profile pictures must be 2MB or smaller.');
  }
};

const mapCustomerToForm = (customer) => ({
  username: customer?.username || '',
  fullName: customer?.fullName || '',
  phoneNumber: customer?.phoneNumber || '',
  address: customer?.address || '',
  avatarUrl: customer?.avatarUrl || '',
});

const AvatarPreview = ({ avatarUrl, label }) => (
  <div className="customer-profile-avatar">
    {avatarUrl ? (
      <img src={avatarUrl} alt={label} className="customer-profile-avatar-image" />
    ) : (
      <span>{getInitials(label)}</span>
    )}
  </div>
);

const CustomerProfile = () => {
  const { loggedInCustomer, profile, isAuthLoading, updateMyProfile } = useAuth();
  const [formData, setFormData] = useState(() => mapCustomerToForm(loggedInCustomer));
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFormData(mapCustomerToForm(loggedInCustomer));
  }, [loggedInCustomer]);

  const joinedOnLabel = useMemo(() => {
    if (!profile?.createdAt) {
      return 'Recently joined';
    }

    try {
      return new Date(profile.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'Recently joined';
    }
  }, [profile?.createdAt]);

  const hasChanges = useMemo(() => {
    const original = mapCustomerToForm(loggedInCustomer);
    return (
      original.username !== formData.username
      || original.fullName !== formData.fullName
      || original.phoneNumber !== formData.phoneNumber
      || original.address !== formData.address
      || original.avatarUrl !== formData.avatarUrl
    );
  }, [formData, loggedInCustomer]);

  const handleImageFileSelection = async (file) => {
    try {
      validateImageFile(file);
      const nextDataUrl = await readImageFileAsDataUrl(file);
      setSaveError('');
      setSaveNotice('');
      setFormData((current) => ({
        ...current,
        avatarUrl: nextDataUrl,
      }));
    } catch (error) {
      setSaveNotice('');
      setSaveError(error.message || 'Unable to use that image file.');
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setSaveError('');
    setSaveNotice('');
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleReset = () => {
    setFormData(mapCustomerToForm(loggedInCustomer));
    setSaveError('');
    setSaveNotice('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveError('');
    setSaveNotice('');

    try {
      const updatedProfile = await updateMyProfile({
        username: formData.username.trim(),
        fullName: formData.fullName.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        avatarUrl: formData.avatarUrl.trim(),
      });

      setFormData(mapCustomerToForm(updatedProfile));
      setSaveNotice('Your customer profile was updated.');
    } catch (error) {
      setSaveError(error.message || 'Unable to update your profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="customer-profile-page">
        <div className="customer-profile-empty">
          <h1>Loading your profile...</h1>
          <p>Please wait while we load your customer account details.</p>
        </div>
      </div>
    );
  }

  if (!loggedInCustomer) {
    return (
      <div className="customer-profile-page">
        <div className="customer-profile-empty">
          <h1>Customer Profile</h1>
          <p>Please log in first so you can view and edit your profile.</p>
          <Link to="/login" className="customer-profile-login-link">Go to Login</Link>
        </div>
      </div>
    );
  }

  const displayName = loggedInCustomer.fullName || loggedInCustomer.username || 'Customer';

  return (
    <div className="customer-profile-page">
      <section className="customer-profile-hero">
        <div>
          <p className="customer-profile-eyebrow">My Account</p>
          <h1>Customer Profile</h1>
          <p className="customer-profile-subtitle">
            Update your nickname, contact details, delivery address, and profile picture anytime.
          </p>
        </div>
        <div className="customer-profile-summary-chip">
          <span>Joined</span>
          <strong>{joinedOnLabel}</strong>
        </div>
      </section>

      <div className="customer-profile-grid">
        <aside className="customer-profile-sidebar">
          <div className="customer-profile-card customer-profile-card-highlight">
            <AvatarPreview avatarUrl={formData.avatarUrl} label={displayName} />
            <h2>{displayName}</h2>
            <p>@{loggedInCustomer.username || 'customer'}</p>

            <div className="customer-profile-meta">
              <div>
                <Mail size={16} />
                <span>{loggedInCustomer.email || 'No email saved'}</span>
              </div>
              <div>
                <UserRound size={16} />
                <span>Nickname is used for your account greeting and login name.</span>
              </div>
            </div>
          </div>

          <div className="customer-profile-card">
            <div className="customer-profile-card-title">
              <Camera size={18} />
              <h3>Profile Picture</h3>
            </div>

            <label className="customer-profile-upload-label">
              Upload PNG or JPG
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleImageFileSelection(file);
                  }
                  event.target.value = '';
                }}
              />
            </label>

            <div className="customer-profile-form-group">
              <label htmlFor="avatarUrl">Or paste image link</label>
              <input
                id="avatarUrl"
                name="avatarUrl"
                type="url"
                className="customer-profile-input"
                placeholder="https://example.com/my-photo.jpg"
                value={formData.avatarUrl.startsWith('data:') ? '' : formData.avatarUrl}
                onChange={handleFieldChange}
              />
            </div>

            {formData.avatarUrl.startsWith('data:') && (
              <p className="customer-profile-helper">
                Uploaded image selected. Save your profile to apply it.
              </p>
            )}

            <button
              type="button"
              className="customer-profile-secondary-button"
              onClick={() => {
                setSaveError('');
                setSaveNotice('');
                setFormData((current) => ({
                  ...current,
                  avatarUrl: '',
                }));
              }}
            >
              <X size={16} /> Remove Picture
            </button>
          </div>
        </aside>

        <section className="customer-profile-main customer-profile-card">
          <div className="customer-profile-card-title">
            <UserRound size={18} />
            <h3>Edit Details</h3>
          </div>

          <form className="customer-profile-form" onSubmit={handleSubmit}>
            <div className="customer-profile-form-row">
              <div className="customer-profile-form-group">
                <label htmlFor="username">Nickname</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  className="customer-profile-input"
                  placeholder="Enter your nickname"
                  value={formData.username}
                  onChange={handleFieldChange}
                  required
                />
              </div>

              <div className="customer-profile-form-group">
                <label htmlFor="fullName">Full Name</label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  className="customer-profile-input"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleFieldChange}
                />
              </div>
            </div>

            <div className="customer-profile-form-row">
              <div className="customer-profile-form-group">
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="customer-profile-input"
                  value={loggedInCustomer.email || ''}
                  disabled
                />
              </div>

              <div className="customer-profile-form-group">
                <label htmlFor="phoneNumber">Phone Number</label>
                <div className="customer-profile-input-shell">
                  <Phone size={16} />
                  <input
                    id="phoneNumber"
                    name="phoneNumber"
                    type="text"
                    className="customer-profile-input customer-profile-input-plain"
                    placeholder="09123456789"
                    value={formData.phoneNumber}
                    onChange={handleFieldChange}
                  />
                </div>
              </div>
            </div>

            <div className="customer-profile-form-group">
              <label htmlFor="address">Default Address</label>
              <div className="customer-profile-input-shell customer-profile-input-shell-area">
                <MapPin size={16} />
                <textarea
                  id="address"
                  name="address"
                  className="customer-profile-input customer-profile-input-plain"
                  placeholder="House/Unit No., Street, Barangay, City"
                  value={formData.address}
                  onChange={handleFieldChange}
                  rows={4}
                />
              </div>
            </div>

            {saveError && <div className="customer-profile-feedback error">{saveError}</div>}
            {saveNotice && <div className="customer-profile-feedback success">{saveNotice}</div>}

            <div className="customer-profile-actions">
              <button
                type="button"
                className="customer-profile-secondary-button"
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset Changes
              </button>
              <button
                type="submit"
                className="customer-profile-primary-button"
                disabled={isSaving || !hasChanges}
              >
                <Save size={16} /> {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
};

export default CustomerProfile;
