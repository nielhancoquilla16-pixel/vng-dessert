/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../lib/api';

const CustomerAddressesContext = createContext(null);

const parseOptionalCoordinate = (value) => (
  value == null || String(value).trim() === '' ? Number.NaN : Number(value)
);

const normalizeAddress = (address = {}) => ({
  id: address.id || '',
  label: address.label || 'Home',
  recipientName: address.recipientName || address.recipient_name || '',
  phoneNumber: address.phoneNumber || address.phone_number || '',
  streetAddress: address.streetAddress || address.street_address || '',
  barangay: address.barangay || '',
  city: address.city || '',
  province: address.province || '',
  region: address.region || '',
  postalCode: address.postalCode || address.postal_code || '',
  formattedAddress: address.formattedAddress || address.formatted_address || address.address || '',
  placeId: address.placeId || address.place_id || '',
  latitude: Number.isFinite(parseOptionalCoordinate(address.latitude)) ? parseOptionalCoordinate(address.latitude) : null,
  longitude: Number.isFinite(parseOptionalCoordinate(address.longitude)) ? parseOptionalCoordinate(address.longitude) : null,
  isDefault: Boolean(address.isDefault ?? address.is_default),
  createdAt: address.createdAt || address.created_at || null,
  updatedAt: address.updatedAt || address.updated_at || null,
});

const sortAddresses = (addresses = []) => (
  [...addresses]
    .map(normalizeAddress)
    .sort((left, right) => (
      Number(right.isDefault) - Number(left.isDefault)
      || (Date.parse(right.updatedAt || '') || 0) - (Date.parse(left.updatedAt || '') || 0)
    ))
);

export const useCustomerAddresses = () => {
  const context = useContext(CustomerAddressesContext);
  if (!context) {
    throw new Error('useCustomerAddresses must be used within CustomerAddressesProvider');
  }
  return context;
};

export const CustomerAddressesProvider = ({ children }) => {
  const { session, userRole, isAuthLoading, updateProfileFromSavedAddress } = useAuth();
  const [addresses, setAddresses] = useState([]);
  const [isAddressesLoading, setIsAddressesLoading] = useState(false);
  const [hasLoadedAddresses, setHasLoadedAddresses] = useState(false);
  const [addressesError, setAddressesError] = useState('');

  const refreshAddresses = useCallback(async () => {
    if (!session?.access_token || userRole !== 'customer') {
      setAddresses([]);
      setAddressesError('');
      setHasLoadedAddresses(true);
      return [];
    }

    setIsAddressesLoading(true);
    setHasLoadedAddresses(false);
    try {
      const response = await apiRequest('/api/profiles/me/addresses', {}, { auth: true });
      const nextAddresses = sortAddresses(Array.isArray(response) ? response : []);
      setAddresses(nextAddresses);
      setAddressesError('');
      return nextAddresses;
    } catch (error) {
      setAddressesError(error.message || 'Unable to load saved addresses.');
      throw error;
    } finally {
      setIsAddressesLoading(false);
      setHasLoadedAddresses(true);
    }
  }, [session?.access_token, userRole]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    refreshAddresses().catch(() => {});
  }, [isAuthLoading, refreshAddresses]);

  const createAddress = useCallback(async (payload) => {
    const createdAddress = await apiRequest('/api/profiles/me/addresses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, { auth: true });
    const normalized = normalizeAddress(createdAddress);
    setAddresses((current) => sortAddresses([
      ...current.map((address) => ({
        ...address,
        isDefault: normalized.isDefault ? false : address.isDefault,
      })),
      normalized,
    ]));
    setAddressesError('');
    if (normalized.isDefault) updateProfileFromSavedAddress(normalized);
    return normalized;
  }, [updateProfileFromSavedAddress]);

  const updateAddress = useCallback(async (addressId, payload) => {
    const updatedAddress = await apiRequest(`/api/profiles/me/addresses/${addressId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }, { auth: true });
    const normalized = normalizeAddress(updatedAddress);
    setAddresses((current) => sortAddresses(current.map((address) => {
      if (address.id === normalized.id) {
        return normalized;
      }

      return {
        ...address,
        isDefault: normalized.isDefault ? false : address.isDefault,
      };
    })));
    setAddressesError('');
    if (normalized.isDefault) updateProfileFromSavedAddress(normalized);
    return normalized;
  }, [updateProfileFromSavedAddress]);

  const setDefaultAddress = useCallback(async (addressId) => {
    const updatedAddress = await apiRequest(`/api/profiles/me/addresses/${addressId}/default`, {
      method: 'POST',
    }, { auth: true });
    const normalized = normalizeAddress(updatedAddress);
    setAddresses((current) => sortAddresses(current.map((address) => ({
      ...address,
      isDefault: address.id === normalized.id,
    }))));
    setAddressesError('');
    updateProfileFromSavedAddress(normalized);
    return normalized;
  }, [updateProfileFromSavedAddress]);

  const deleteAddress = useCallback(async (addressId) => {
    const deletedAddress = addresses.find((address) => address.id === addressId);
    await apiRequest(`/api/profiles/me/addresses/${addressId}`, {
      method: 'DELETE',
    }, { auth: true });
    const nextAddresses = sortAddresses(addresses.filter((address) => address.id !== addressId));
    const replacementDefault = deletedAddress?.isDefault ? nextAddresses[0] || null : null;
    const updatedAddresses = replacementDefault
      ? nextAddresses.map((address) => ({
          ...address,
          isDefault: address.id === replacementDefault.id,
        }))
      : nextAddresses;
    setAddresses(updatedAddresses);
    setAddressesError('');
    if (deletedAddress?.isDefault) {
      updateProfileFromSavedAddress(replacementDefault);
    }
  }, [addresses, updateProfileFromSavedAddress]);

  const defaultAddress = useMemo(
    () => addresses.find((address) => address.isDefault) || null,
    [addresses],
  );

  const value = useMemo(() => ({
    addresses,
    defaultAddress,
    isAddressesLoading,
    hasLoadedAddresses,
    addressesError,
    refreshAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  }), [
    addresses,
    defaultAddress,
    isAddressesLoading,
    hasLoadedAddresses,
    addressesError,
    refreshAddresses,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  ]);

  return (
    <CustomerAddressesContext.Provider value={value}>
      {children}
    </CustomerAddressesContext.Provider>
  );
};
