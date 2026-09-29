import { useCallback, useEffect, useId, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatCoordinate, isValidLocation } from '../lib/deliveryLocation';
import './LocationPinPicker.css';

const DEFAULT_CENTER = { latitude: 14.455378, longitude: 120.974665 };

const LocationPinPicker = ({
  latitude = '',
  longitude = '',
  onChange,
  initialCenter = DEFAULT_CENTER,
  label = 'Delivery location',
  disabled = false,
}) => {
  const id = useId();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const latestRef = useRef({ disabled, onChange });
  const initialRef = useRef({ latitude, longitude, initialCenter });
  const activeRef = useRef(false);
  const geolocationRef = useRef(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [mapError, setMapError] = useState('');
  const hasPin = isValidLocation({ latitude, longitude });
  const hasCoordinates = String(latitude ?? '').trim() !== '' || String(longitude ?? '').trim() !== '';
  const coordinateError = hasCoordinates && !hasPin
    ? 'Enter both coordinates: latitude from -90 to 90 and longitude from -180 to 180. The location 0, 0 cannot be used.'
    : '';

  useEffect(() => {
    latestRef.current = { disabled, onChange };
    if (disabled && geolocationRef.current) geolocationRef.current.cancelled = true;
  }, [disabled, onChange]);

  useEffect(() => {
    // A newly selected saved address takes precedence over an older GPS request.
    if (geolocationRef.current) geolocationRef.current.cancelled = true;
  }, [latitude, longitude]);

  const selectLocation = useCallback((nextLatitude, nextLongitude) => {
    if (!activeRef.current || latestRef.current.disabled) return;
    if (geolocationRef.current) geolocationRef.current.cancelled = true;
    setLocationError('');
    latestRef.current.onChange?.({ latitude: nextLatitude, longitude: nextLongitude });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const initial = initialRef.current;
    const center = isValidLocation(initial)
      ? initial
      : isValidLocation(initial.initialCenter) ? initial.initialCenter : DEFAULT_CENTER;
    // Centering the map only changes the view. A pin requires an explicit selection.
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(
      [Number(center.latitude), Number(center.longitude)],
      isValidLocation(initial) ? 17 : 13,
    );
    mapRef.current = map;
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
    }).addTo(map);
    tiles.on('tileerror', () => {
      if (activeRef.current) setMapError('The map could not load. Check your connection, or enter the coordinates below.');
    });
    tiles.on('tileload', () => {
      if (activeRef.current) setMapError('');
    });
    map.on('click', ({ latlng }) => {
      const point = latlng.wrap();
      selectLocation(formatCoordinate(point.lat), formatCoordinate(point.lng));
    });

    let resizeFrame;
    const updateSize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateSize) : null;
    observer?.observe(containerRef.current);
    window.addEventListener('resize', updateSize);
    updateSize();

    return () => {
      activeRef.current = false;
      if (geolocationRef.current) geolocationRef.current.cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', updateSize);
      cancelAnimationFrame(resizeFrame);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [selectLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hasPin) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    const point = [Number(latitude), Number(longitude)];
    if (!markerRef.current) {
      const marker = L.marker(point, {
        draggable: !disabled,
        title: `${label} pin`,
        icon: L.divIcon({
          className: 'location-pin-picker__marker',
          html: '<span aria-hidden="true"></span>',
          iconSize: [32, 40],
          iconAnchor: [16, 40],
        }),
      }).addTo(map);
      marker.on('dragend', () => {
        const position = marker.getLatLng().wrap();
        selectLocation(formatCoordinate(position.lat), formatCoordinate(position.lng));
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(point);
      if (disabled) markerRef.current.dragging.disable();
      else markerRef.current.dragging.enable();
    }
    if (!map.getBounds().contains(point)) map.panTo(point, { animate: false });
  }, [disabled, hasPin, label, latitude, longitude, selectLocation]);

  const useCurrentLocation = () => {
    if (disabled || isLocating) return;
    if (!navigator.geolocation) {
      setLocationError('Your browser cannot provide your location. Select a pin on the map or enter coordinates.');
      return;
    }
    const request = { cancelled: false };
    geolocationRef.current = request;
    setLocationError('');
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!activeRef.current || geolocationRef.current !== request) return;
        setIsLocating(false);
        if (request.cancelled || latestRef.current.disabled) return;
        const point = { latitude: coords.latitude, longitude: coords.longitude };
        if (!isValidLocation(point)) {
          setLocationError('Your browser did not return a valid location. Select a pin on the map.');
          return;
        }
        selectLocation(formatCoordinate(point.latitude), formatCoordinate(point.longitude));
        mapRef.current?.setView([point.latitude, point.longitude], 17);
      },
      (error) => {
        if (!activeRef.current || geolocationRef.current !== request) return;
        setIsLocating(false);
        if (request.cancelled || latestRef.current.disabled) return;
        setLocationError(error.code === 1
          ? 'Location access was denied. Allow location access in your browser, or select a pin on the map.'
          : 'Your current location could not be found. Select a pin on the map or enter coordinates.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  return (
    <section className="location-pin-picker" aria-labelledby={`${id}-label`}>
      <div className="location-pin-picker__heading">
        <strong id={`${id}-label`}>{label}</strong>
        <button type="button" className="location-pin-picker__locate" onClick={useCurrentLocation} disabled={disabled || isLocating}>
          {isLocating ? 'Finding your location…' : 'Use my current location'}
        </button>
      </div>
      <p id={`${id}-help`} className="location-pin-picker__help">
        Select the exact entrance on the map, or drag the pin to it. Check the pin matches your written address.
      </p>
      <div ref={containerRef} className="location-pin-picker__map" role="region" aria-label={`${label} map`} aria-describedby={`${id}-help`} />
      <p className={`location-pin-picker__status${hasPin ? ' location-pin-picker__status--selected' : ''}`} role="status">
        {hasPin ? 'Pin selected. This location will be sent to the delivery rider.' : 'No pin selected. Tap the map to choose a location.'}
      </p>
      {(mapError || locationError) && <p className="location-pin-picker__error" role="alert">{locationError || mapError}</p>}
      <details className="location-pin-picker__coordinates">
        <summary>Enter coordinates manually</summary>
        <div className="location-pin-picker__coordinate-fields">
          <label htmlFor={`${id}-latitude`}>
            <span>Latitude</span>
            <input id={`${id}-latitude`} type="text" inputMode="decimal" autoComplete="off" placeholder="e.g. 14.455378" value={latitude ?? ''} disabled={disabled} aria-invalid={Boolean(coordinateError)} aria-describedby={coordinateError ? `${id}-error` : undefined} onChange={(event) => selectLocation(event.target.value, longitude ?? '')} />
          </label>
          <label htmlFor={`${id}-longitude`}>
            <span>Longitude</span>
            <input id={`${id}-longitude`} type="text" inputMode="decimal" autoComplete="off" placeholder="e.g. 120.974665" value={longitude ?? ''} disabled={disabled} aria-invalid={Boolean(coordinateError)} aria-describedby={coordinateError ? `${id}-error` : undefined} onChange={(event) => selectLocation(latitude ?? '', event.target.value)} />
          </label>
        </div>
      </details>
      {coordinateError && <p id={`${id}-error`} className="location-pin-picker__error" role="alert">{coordinateError}</p>}
    </section>
  );
};

export default LocationPinPicker;
