export const ADDRESS_PIN_ERROR = 'Select the actual pickup or drop-off location on the map before booking delivery.';

const hasCoordinate = (value) => (
  (typeof value === 'number' || typeof value === 'string')
  && String(value).trim() !== ''
  && Number.isFinite(Number(value))
);

export const isValidLocation = (location = {}) => {
  const latitude = location?.destinationLatitude ?? location?.latitude;
  const longitude = location?.destinationLongitude ?? location?.longitude;
  if (!hasCoordinate(latitude) || !hasCoordinate(longitude)) return false;

  const lat = Number(latitude);
  const lng = Number(longitude);
  return lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
};

export const formatCoordinate = (value) => (
  hasCoordinate(value) ? Number(value).toFixed(8).replace(/\.?0+$/, '') : ''
);

export const buildDeliveryAddressText = ({
  streetAddress = '',
  barangay = '',
  city = '',
  province = '',
  postalCode = '',
} = {}) => (
  [streetAddress, barangay, city, province, postalCode]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .join(', ')
);
