const GOOGLE_MAPS_SCRIPT_ID = 'vng-google-maps-places';
const GOOGLE_MAPS_READY_CALLBACK = '__vngGoogleMapsPlacesReady';
const ADDRESS_GEOCODE_ERROR = "The saved delivery address could not be matched to a precise location. Ask the customer to update their saved address.";

let googleMapsPromise = null;

export const getGoogleMapsApiKey = () => String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

export const isGooglePlacesConfigured = () => Boolean(getGoogleMapsApiKey());

const getGoogleMapsScriptUrl = () => {
  const params = new URLSearchParams({
    key: getGoogleMapsApiKey(),
    libraries: 'places',
    callback: GOOGLE_MAPS_READY_CALLBACK,
  });

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
};

export const loadGooglePlaces = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Address suggestions are only available in the browser.'));
  }

  if (!isGooglePlacesConfigured()) {
    return Promise.reject(new Error('Automatic address lookup needs VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local. Enable Maps JavaScript API and Geocoding API, then restart the frontend.'));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    const cleanup = () => {
      delete window[GOOGLE_MAPS_READY_CALLBACK];
    };

    window[GOOGLE_MAPS_READY_CALLBACK] = () => {
      cleanup();
      resolve(window.google);
    };

    const handleError = () => {
      cleanup();
      googleMapsPromise = null;
      reject(new Error('Address suggestions could not be loaded. Check the Google Maps API key and billing settings.'));
    };

    if (existingScript) {
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = getGoogleMapsScriptUrl();
    script.async = true;
    script.defer = true;
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

const getComponent = (components = [], types = []) => {
  const matchingComponent = components.find((component) => (
    types.some((type) => component.types?.includes(type))
  ));

  if (!matchingComponent) {
    return '';
  }

  return matchingComponent.long_name
    || matchingComponent.longText
    || matchingComponent.short_name
    || matchingComponent.shortText
    || '';
};

const getCoordinateValue = (value) => {
  if (typeof value === 'function') {
    return value();
  }

  return value;
};

export const formatCoordinate = (value) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  return parsed.toFixed(8).replace(/\.?0+$/, '');
};

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

export const parseGooglePlaceAddress = (place = {}) => {
  const components = place.address_components || place.addressComponents || [];
  const streetNumber = getComponent(components, ['street_number']);
  const route = getComponent(components, ['route']);
  const premise = getComponent(components, ['premise', 'subpremise', 'establishment', 'point_of_interest']);
  const streetAddress = [streetNumber, route].filter(Boolean).join(' ')
    || premise
    || place.name
    || place.displayName
    || '';
  const barangay = getComponent(components, [
    'sublocality_level_1',
    'sublocality',
    'neighborhood',
    'administrative_area_level_3',
  ]);
  const city = getComponent(components, [
    'locality',
    'postal_town',
    'administrative_area_level_2',
  ]);
  const province = getComponent(components, ['administrative_area_level_1']);
  const postalCode = getComponent(components, ['postal_code']);
  const location = place.geometry?.location || place.location || {};
  const latitude = getCoordinateValue(location.lat);
  const longitude = getCoordinateValue(location.lng);
  const addressText = buildDeliveryAddressText({
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
  });
  const formattedAddress = place.formatted_address
    || place.formattedAddress
    || addressText;

  return {
    streetAddress,
    barangay,
    city,
    province,
    postalCode,
    formattedAddress,
    address: formattedAddress || addressText,
    placeId: place.place_id || place.id || '',
    latitude: formatCoordinate(latitude),
    longitude: formatCoordinate(longitude),
  };
};

export const isGeocodedDeliveryAddress = ({ destinationLatitude, destinationLongitude, latitude, longitude } = {}) => {
  const rawLatitude = destinationLatitude ?? latitude;
  const rawLongitude = destinationLongitude ?? longitude;
  if (rawLatitude == null || rawLongitude == null || String(rawLatitude).trim() === '' || String(rawLongitude).trim() === '') {
    return false;
  }

  const lat = Number(rawLatitude);
  const lng = Number(rawLongitude);

  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
};

export const geocodeSavedDeliveryAddress = async (deliveryAddress = {}) => {
  if (isGeocodedDeliveryAddress(deliveryAddress)) return deliveryAddress;
  const address = String(
    deliveryAddress.formattedAddress
      || deliveryAddress.address
      || buildDeliveryAddressText(deliveryAddress),
  ).trim();
  if (!address) throw new Error('This order does not contain a saved delivery address.');

  const google = await loadGooglePlaces();
  const { Geocoder } = await google.maps.importLibrary('geocoding');
  const geocoder = new Geocoder();
  const request = deliveryAddress.placeId
    ? { placeId: deliveryAddress.placeId }
    : { address, componentRestrictions: { country: 'PH' }, region: 'PH' };
  const { results = [] } = await geocoder.geocode(request);
  const preciseResult = results.find((result) => (
    result.types?.some((type) => [
      'street_address',
      'premise',
      'subpremise',
      'establishment',
      'point_of_interest',
    ].includes(type))
  ));
  if (!preciseResult) throw new Error(ADDRESS_GEOCODE_ERROR);

  const resolvedAddress = parseGooglePlaceAddress(preciseResult);
  if (!isGeocodedDeliveryAddress(resolvedAddress)) throw new Error(ADDRESS_GEOCODE_ERROR);
  return {
    ...deliveryAddress,
    placeId: deliveryAddress.placeId || resolvedAddress.placeId,
    destinationLatitude: resolvedAddress.latitude,
    destinationLongitude: resolvedAddress.longitude,
  };
};

export const createAddressAutocomplete = async (
  inputElement,
  onAddressSelected,
  {
    country = 'ph',
    onAddressError = () => {},
  } = {},
) => {
  if (!inputElement) {
    return () => {};
  }

  const google = await loadGooglePlaces();
  const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places');
  const parent = inputElement.parentElement;
  if (!parent) return () => {};

  const previousPosition = parent.style.position;
  if (!previousPosition || previousPosition === 'static') parent.style.position = 'relative';

  const suggestionsElement = document.createElement('div');
  suggestionsElement.setAttribute('role', 'listbox');
  suggestionsElement.style.cssText = [
    'position:absolute',
    'top:calc(100% + 4px)',
    'left:0',
    'right:0',
    'z-index:10000',
    'display:none',
    'max-height:280px',
    'overflow-y:auto',
    'border:1px solid #d7deea',
    'border-radius:10px',
    'background:#fff',
    'box-shadow:0 12px 28px rgba(15,23,42,.18)',
    'padding:4px',
  ].join(';');
  parent.appendChild(suggestionsElement);

  const attribution = document.createElement('div');
  attribution.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;padding:6px 8px 4px';
  const googleLogo = document.createElement('img');
  googleLogo.src = 'https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png';
  googleLogo.alt = 'Powered by Google';
  googleLogo.width = 120;
  googleLogo.height = 14;
  attribution.appendChild(googleLogo);

  let sessionToken = new AutocompleteSessionToken();
  let debounceTimer = null;
  let latestRequest = 0;
  let blurTimer = null;

  const hideSuggestions = () => {
    suggestionsElement.style.display = 'none';
    suggestionsElement.replaceChildren();
  };

  const fetchPlaceDetails = async (prediction, button) => {
    latestRequest += 1;
    if (blurTimer) window.clearTimeout(blurTimer);
    button.disabled = true;
    hideSuggestions();

    try {
      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ['addressComponents', 'formattedAddress', 'location', 'displayName', 'id'],
      });
      const selectedAddress = parseGooglePlaceAddress({
        addressComponents: place.addressComponents,
        formattedAddress: place.formattedAddress,
        location: place.location,
        displayName: place.displayName,
        id: place.id,
      });
      if (!isGeocodedDeliveryAddress(selectedAddress)) throw new Error(ADDRESS_GEOCODE_ERROR);

      inputElement.value = selectedAddress.formattedAddress || selectedAddress.address;
      sessionToken = new AutocompleteSessionToken();
      onAddressSelected(selectedAddress);
    } catch (error) {
      onAddressError(error);
    }
  };

  const renderSuggestions = (predictions = []) => {
    suggestionsElement.replaceChildren();
    const validPredictions = predictions.filter(Boolean);
    if (!validPredictions.length) {
      hideSuggestions();
      return;
    }

    validPredictions.forEach((prediction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.textContent = prediction.text?.toString?.() || '';
      button.style.cssText = 'display:block;width:100%;padding:10px 12px;border:0;border-radius:7px;background:#fff;color:#18243a;text-align:left;font:inherit;cursor:pointer';
      button.addEventListener('mouseenter', () => { button.style.background = '#f1f5fb'; });
      button.addEventListener('mouseleave', () => { button.style.background = '#fff'; });
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => { void fetchPlaceDetails(prediction, button); });
      suggestionsElement.appendChild(button);
    });
    suggestionsElement.appendChild(attribution);
    suggestionsElement.style.display = 'block';
  };

  const handleInput = () => {
    const query = inputElement.value.trim();
    latestRequest += 1;
    const requestId = latestRequest;
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (query.length < 3) {
      hideSuggestions();
      return;
    }

    debounceTimer = window.setTimeout(async () => {
      try {
        const request = {
          input: query,
          language: 'en',
          region: country,
          sessionToken,
          ...(country ? { includedRegionCodes: [country.toUpperCase()] } : {}),
        };
        const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (requestId !== latestRequest || inputElement.value.trim() !== query) return;
        renderSuggestions(suggestions.map((suggestion) => suggestion.placePrediction));
      } catch (error) {
        if (requestId === latestRequest) {
          hideSuggestions();
          onAddressError(error);
        }
      }
    }, 250);
  };

  const handleBlur = () => {
    blurTimer = window.setTimeout(hideSuggestions, 180);
  };
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') hideSuggestions();
  };

  inputElement.addEventListener('input', handleInput);
  inputElement.addEventListener('blur', handleBlur);
  inputElement.addEventListener('keydown', handleKeyDown);

  return () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    if (blurTimer) window.clearTimeout(blurTimer);
    inputElement.removeEventListener('input', handleInput);
    inputElement.removeEventListener('blur', handleBlur);
    inputElement.removeEventListener('keydown', handleKeyDown);
    suggestionsElement.remove();
    if (!previousPosition || previousPosition === 'static') parent.style.position = previousPosition;
  };
};

export { ADDRESS_GEOCODE_ERROR };
