import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import {
  Camera,
  CheckCircle2,
  QrCode,
  ScanLine,
  Search,
  ShoppingBag,
  Square,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import './AdminQR.css';

const STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  processing: 'Processing',
  completed: 'Completed',
  received: 'Received',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const getStatusLabel = (status = '') => STATUS_LABELS[String(status || '').toLowerCase()] || String(status || 'pending');

const IDLE_SCAN_MESSAGE = 'Tap Start Scan to open the camera and verify pickup orders.';

const getCameraErrorMessage = (error) => {
  const errorName = String(error?.name || '').toLowerCase();
  const errorMessage = String(error?.message || '').toLowerCase();

  if (errorName.includes('notallowed') || errorMessage.includes('permission')) {
    return 'Camera access was blocked. Please allow camera permissions and try again.';
  }

  if (errorName.includes('notfound') || errorMessage.includes('no camera')) {
    return 'No camera was found on this device.';
  }

  if (errorName.includes('notreadable') || errorMessage.includes('busy')) {
    return 'The camera is busy or cannot be opened right now.';
  }

  return error?.message || 'Unable to open the camera on this device.';
};

const AdminQR = () => {
  const { session } = useAuth();
  const [lookupValue, setLookupValue] = useState('');
  const [activeOrder, setActiveOrder] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerMessage, setScannerMessage] = useState(IDLE_SCAN_MESSAGE);
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scannerReaderRef = useRef(null);

  const canConfirmPickup = useMemo(() => (
    Boolean(activeOrder)
    && activeOrder.status === 'ready'
    && activeOrder.qrActive
  ), [activeOrder]);

  useEffect(() => () => {
    try {
      scannerControlsRef.current?.stop?.();
    } catch (error) {
      void error;
    }

    scannerControlsRef.current = null;
    BrowserQRCodeReader.releaseAllStreams();
  }, []);

  const stopScanner = (nextMessage = IDLE_SCAN_MESSAGE) => {
    try {
      scannerControlsRef.current?.stop?.();
    } catch (error) {
      void error;
    }

    scannerControlsRef.current = null;
    BrowserQRCodeReader.releaseAllStreams();
    setIsScanning(false);
    setScannerMessage(nextMessage);
  };

  const lookupOrder = async (identifierInput = lookupValue) => {
    const identifier = String(identifierInput || '').trim();

    if (!identifier) {
      setLookupError('Enter or scan an Order ID first.');
      setActiveOrder(null);
      setSuccessMessage('');
      return;
    }

    setIsSearching(true);
    setLookupError('');
    setSuccessMessage('');

    try {
      const result = await apiRequest('/api/orders/lookup', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
        }),
      }, {
        auth: true,
        accessToken: session?.access_token,
      });

      setActiveOrder(result);
    } catch (error) {
      setActiveOrder(null);
      setLookupError(error.message || 'Unable to find that order right now.');
    } finally {
      setIsSearching(false);
    }
  };

  const onDecodedResult = (result) => {
    const scannedValue = String(result?.getText?.() || result?.text || '').trim();

    if (!scannedValue) {
      return;
    }

    setLookupValue(scannedValue);
    stopScanner('QR detected. Looking up the order...');
    void lookupOrder(scannedValue);
  };

  const startScanner = async () => {
    if (isScanning) {
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setLookupError('This device does not support camera scanning.');
      setScannerMessage('Tap Start Scan to open the camera and verify pickup orders.');
      return;
    }

    const preview = videoRef.current;

    if (!preview) {
      setLookupError('Camera view is not ready yet. Please try again.');
      return;
    }

    setLookupError('');
    setSuccessMessage('');
    setScannerMessage('Opening the camera...');
    setIsScanning(true);
    BrowserQRCodeReader.releaseAllStreams();

    const reader = scannerReaderRef.current || new BrowserQRCodeReader();
    scannerReaderRef.current = reader;
    const scanConstraints = [
      {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      },
      {
        audio: false,
        video: {
          facingMode: 'environment',
        },
      },
      {
        audio: false,
        video: true,
      },
    ];

    let lastError = null;

    for (const constraints of scanConstraints) {
      try {
        const controls = await reader.decodeFromConstraints(
          constraints,
          preview,
          (result, error) => {
            if (result) {
              onDecodedResult(result);
              return;
            }

            if (error) {
              const errorName = String(error.name || '');

              if (!['NotFoundException', 'ChecksumException', 'FormatException'].includes(errorName)) {
                setScannerMessage(getCameraErrorMessage(error));
              }
            }
          },
        );

        scannerControlsRef.current = controls;
        setScannerMessage('Point the camera at a QR code.');
        return;
      } catch (error) {
        lastError = error;
        BrowserQRCodeReader.releaseAllStreams();
      }
    }

    setIsScanning(false);
    setLookupError(getCameraErrorMessage(lastError));
    setScannerMessage(IDLE_SCAN_MESSAGE);
  };

  const confirmPickup = async () => {
    if (!activeOrder) {
      return;
    }

    setIsConfirming(true);
    setLookupError('');
    setSuccessMessage('');

    try {
      const result = await apiRequest(`/api/orders/${activeOrder.id}/confirm-pickup`, {
        method: 'POST',
      }, {
        auth: true,
        accessToken: session?.access_token,
      });

      setActiveOrder(result);
      setSuccessMessage('Order confirmed and QR code expired.');
    } catch (error) {
      setLookupError(error.message || 'Unable to confirm this pickup right now.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="admin-qr-page">
      <div className="admin-qr-hero">
        <div className="admin-qr-hero-copy">
          <p className="admin-qr-kicker">Pickup Validation</p>
          <h1>QR Scanner</h1>
          <p className="admin-qr-subtitle">
            Scan or enter the Order ID to validate pickup orders.
          </p>
        </div>

        <div className={`admin-qr-status-pill ${isScanning ? 'is-scanning' : ''}`}>
          <ScanLine size={16} />
          <span>{isScanning ? 'Camera active' : 'Manual + camera mode'}</span>
        </div>
      </div>

      <div className="admin-qr-layout">
        <section className="scan-box">
          <div className="scanner-frame">
            <video
              ref={videoRef}
              className={`scanner-video ${isScanning ? 'is-visible' : ''}`}
              muted
              autoPlay
              playsInline
            />

            {!isScanning && (
              <div className="scanner-placeholder">
                <div className="scanner-placeholder-icon">
                  <Camera size={28} />
                </div>
                <div className="scanner-placeholder-copy">
                  <h2>Ready to scan</h2>
                  <p>
                    Tap Start Scan to open the camera and scan the pickup QR code on mobile.
                  </p>
                </div>
              </div>
            )}

            <div className="scan-corner corner-tl" />
            <div className="scan-corner corner-tr" />
            <div className="scan-corner corner-bl" />
            <div className="scan-corner corner-br" />
          </div>

          <div className="scanner-actions">
            <button
              type="button"
              className="btn-verify scanner-primary-button"
              onClick={startScanner}
              disabled={isScanning}
            >
              <ScanLine size={18} />
              {isScanning ? 'Camera Active' : 'Start Scan'}
            </button>

            {isScanning && (
              <button
                type="button"
                className="scanner-secondary-button"
                onClick={() => stopScanner(IDLE_SCAN_MESSAGE)}
              >
                <Square size={16} />
                Stop Camera
              </button>
            )}
          </div>

          <p className="qr-helper-copy">
            The QR code contains only the Order ID. Once the cashier confirms the order, the code expires immediately.
          </p>

          <div className="scanner-message-bar" aria-live="polite">
            <ScanLine size={16} />
            <span>{scannerMessage}</span>
          </div>
        </section>

        <section className="lookup-card">
          <div className="lookup-card-header">
            <div className="lookup-card-heading">
              <p className="lookup-eyebrow">Lookup Result</p>
              <h3>Order Details</h3>
              <p className="lookup-card-copy">
                Search manually or scan a code, then confirm pickup from the details below.
              </p>
            </div>
            <ShoppingBag size={20} />
          </div>

          <div className="qr-input-group">
            <label htmlFor="orderLookup">Order ID</label>
            <div className="qr-input-row">
              <input
                id="orderLookup"
                type="text"
                placeholder="Scan or enter Order ID"
                className="qr-input"
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    lookupOrder();
                  }
                }}
              />
              <button type="button" className="btn-verify" onClick={lookupOrder} disabled={isSearching}>
                <Search size={18} />
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {lookupError && <div className="qr-error-banner">{lookupError}</div>}
          {successMessage && <div className="qr-success-banner">{successMessage}</div>}

          {!activeOrder ? (
            <div className="lookup-empty-state">
              <QrCode size={44} />
              <p>Scan an order QR or enter the Order ID to view products, total, and pickup status.</p>
            </div>
          ) : (
            <div className="lookup-result">
              <div className="lookup-order-meta">
                <div>
                  <span>Order ID</span>
                  <strong>{activeOrder.displayId || activeOrder.orderCode || activeOrder.id}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong className={`status-badge status-${activeOrder.status}`}>{getStatusLabel(activeOrder.status)}</strong>
                </div>
              </div>

              <div className="lookup-detail-grid">
                <div>
                  <span>Customer</span>
                  <strong>{activeOrder.customer}</strong>
                </div>
                <div>
                  <span>Pickup</span>
                  <strong>{activeOrder.subtext || 'Walk-in / Cash on Pickup'}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{activeOrder.total}</strong>
                </div>
                <div>
                  <span>QR Status</span>
                  <strong>{activeOrder.qrActive ? 'Active' : 'Expired'}</strong>
                </div>
              </div>

              <div className="lookup-items-list">
                <h4>Items</h4>
                {(activeOrder.lineItems || []).map((item) => (
                  <div key={`${activeOrder.id}-${item.id || item.productId || item.name}`} className="lookup-item-row">
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.quantity} x PHP {Number(item.price || 0).toFixed(2)}</p>
                    </div>
                    <span>PHP {Number(item.lineTotal || (item.quantity * item.price) || 0).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {activeOrder.readyNotifiedAt && (
                <div className="lookup-ready-banner">
                  <CheckCircle2 size={18} />
                  <div>
                    <strong>Ready notification sent</strong>
                    <p>{activeOrder.readyNotificationMessage || 'Your order is ready for pickup. Please proceed to the cashier and present your QR code.'}</p>
                  </div>
                </div>
              )}

              <div className="qr-actions">
                <button
                  type="button"
                  className="btn-verify"
                  onClick={confirmPickup}
                  disabled={!canConfirmPickup || isConfirming}
                >
                  <CheckCircle2 size={18} />
                  {isConfirming ? 'Confirming...' : 'Confirm Order'}
                </button>
              </div>

              {!canConfirmPickup && (
                <p className="lookup-footnote">
                  {activeOrder.qrActive
                    ? 'This order can be confirmed only when its status is Ready for Pickup.'
                    : 'This QR has already been used or expired.'}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default AdminQR;
