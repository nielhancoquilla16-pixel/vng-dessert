const ADDRESS_LABELS = new Set(['Home', 'Work', 'Other']);

const normalizeText = (value = '') => String(value ?? '').trim();

const firstText = (...values) => (
  values.map((value) => normalizeText(value)).find(Boolean) || ''
);

const normalizeCoordinate = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (value == null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeLabel = (value = 'Home') => {
  const normalized = normalizeText(value).toLowerCase();
  const label = normalized ? `${normalized[0].toUpperCase()}${normalized.slice(1)}` : 'Home';
  return ADDRESS_LABELS.has(label) ? label : 'Other';
};

export const mapCustomerAddress = (row = {}) => ({
  id: row.id,
  userId: row.user_id,
  label: normalizeLabel(row.label),
  recipientName: row.recipient_name || '',
  phoneNumber: row.phone_number || '',
  streetAddress: row.street_address || '',
  barangay: row.barangay || '',
  city: row.city || '',
  province: row.province || '',
  region: row.region || '',
  postalCode: row.postal_code || '',
  formattedAddress: row.formatted_address || '',
  placeId: row.place_id || '',
  latitude: normalizeCoordinate(row.latitude),
  longitude: normalizeCoordinate(row.longitude),
  isDefault: Boolean(row.is_default),
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null,
});

export const normalizeCustomerAddressInput = (input = {}) => {
  const label = normalizeLabel(input.label);
  const recipientName = firstText(input.recipientName, input.recipient_name);
  const phoneNumber = firstText(input.phoneNumber, input.phone_number, input.contactNumber, input.contact_number);
  const streetAddress = firstText(input.streetAddress, input.street_address);
  const barangay = firstText(input.barangay);
  const city = firstText(input.city);
  const province = firstText(input.province);
  const region = firstText(input.region);
  const postalCode = firstText(input.postalCode, input.postal_code);
  const formattedAddress = firstText(input.formattedAddress, input.formatted_address, input.address);
  const placeId = firstText(input.placeId, input.place_id);
  const latitude = normalizeCoordinate(input.latitude);
  const longitude = normalizeCoordinate(input.longitude);

  return {
    label,
    recipient_name: recipientName,
    phone_number: phoneNumber,
    street_address: streetAddress || null,
    barangay: barangay || null,
    city: city || null,
    province: province || null,
    region: region || null,
    postal_code: postalCode || null,
    formatted_address: formattedAddress,
    place_id: placeId || null,
    latitude,
    longitude,
    is_default: Boolean(input.isDefault ?? input.is_default),
  };
};

export const getCustomerAddressValidationError = (address = {}) => {
  if (!normalizeText(address.recipient_name)) {
    return 'Recipient name is required.';
  }

  if (!normalizeText(address.phone_number)) {
    return 'Recipient contact number is required.';
  }

  if (!normalizeText(address.street_address) || !normalizeText(address.city) || !normalizeText(address.province)) {
    return 'Street address, city/municipality, and province are required.';
  }

  if (!normalizeText(address.formatted_address)) {
    return 'Enter a complete delivery address before saving it.';
  }

  const rawLatitude = address.latitude;
  const rawLongitude = address.longitude;
  const latitude = Number(rawLatitude);
  const longitude = Number(rawLongitude);
  if (rawLatitude == null || rawLongitude == null
    || String(rawLatitude).trim() === '' || String(rawLongitude).trim() === ''
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || (latitude === 0 && longitude === 0)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return 'Select the exact delivery location on the map before saving it.';
  }

  return '';
};

export const toOrderDeliveryAddress = (address = {}) => {
  const mapped = mapCustomerAddress(address);
  return {
    recipientName: mapped.recipientName,
    contactNumber: mapped.phoneNumber,
    streetAddress: mapped.streetAddress,
    barangay: mapped.barangay,
    city: mapped.city,
    province: mapped.province,
    postalCode: mapped.postalCode,
    formattedAddress: mapped.formattedAddress,
    address: mapped.formattedAddress,
    placeId: mapped.placeId,
    latitude: mapped.latitude,
    longitude: mapped.longitude,
  };
};

export const getOwnedCustomerAddress = async (supabase, userId, addressId) => {
  if (!addressId) {
    return null;
  }

  const { data, error } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('id', addressId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const getAddressSnapshot = (address = {}) => {
  const mapped = mapCustomerAddress(address);
  return {
    address: mapped.formattedAddress,
    phoneNumber: mapped.phoneNumber,
    deliveryAddress: toOrderDeliveryAddress(address),
  };
};

const addressMatchKey = (value) => normalizeText(value).replace(/\s+/g, ' ').toLowerCase();

export const syncProfileDefaultAddress = async (supabase, profile) => {
  const addressText = normalizeText(profile.address);
  if (profile.role !== 'customer' || !addressText) return null;

  const { data: addresses, error: listError } = await supabase
    .from('customer_addresses')
    .select('*')
    .eq('user_id', profile.id)
    .order('is_default', { ascending: false });
  if (listError) throw listError;

  const previousDefault = (addresses || []).find((address) => address.is_default);
  let savedAddress = (addresses || []).find((address) => (
    addressMatchKey(address.formatted_address) === addressMatchKey(addressText)
  ));
  if (savedAddress?.is_default) return savedAddress;

  let createdAddress = false;
  if (!savedAddress) {
    const { data, error } = await supabase
      .from('customer_addresses')
      .insert({
        ...normalizeCustomerAddressInput({
          label: 'Home',
          recipientName: firstText(profile.full_name, profile.username, 'Customer'),
          phoneNumber: profile.phone_number || '',
          streetAddress: addressText,
          formattedAddress: addressText,
        }),
        user_id: profile.id,
      })
      .select('*')
      .single();
    if (error) throw error;
    savedAddress = data;
    createdAddress = true;
  }

  // Keep the old default until the new address exists. Incomplete profile
  // addresses intentionally have no pin and still need delivery validation.
  let clearedDefault = false;
  try {
    const { error: clearError } = await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('user_id', profile.id)
      .eq('is_default', true);
    if (clearError) throw clearError;
    clearedDefault = true;

    const { data, error } = await supabase
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', savedAddress.id)
      .eq('user_id', profile.id)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  } catch (error) {
    if (clearedDefault && previousDefault) {
      const { error: restoreError } = await supabase
        .from('customer_addresses')
        .update({ is_default: true })
        .eq('id', previousDefault.id)
        .eq('user_id', profile.id);
      if (restoreError) console.error('Unable to restore the previous default address:', restoreError);
    }
    if (createdAddress) {
      const { error: cleanupError } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', savedAddress.id)
        .eq('user_id', profile.id)
        .eq('is_default', false);
      if (cleanupError) console.error('Unable to remove the incomplete address save:', cleanupError);
    }
    throw error;
  }
};
