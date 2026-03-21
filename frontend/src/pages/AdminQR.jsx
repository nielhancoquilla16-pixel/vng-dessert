import React from 'react';
import { Camera, Search, Maximize } from 'lucide-react';
import './AdminQR.css';

const AdminQR = () => {
  return (
    <div>
      <div className="admin-products-header">
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>QR Scanner</h1>
          <p style={{ color: '#64748b' }}>Scan product or order QR codes</p>
        </div>
      </div>

      <div className="qr-container">
        <div className="scan-box">
          <div className="viewport-mock">
            <div className="scan-corner corner-tl"></div>
            <div className="scan-corner corner-tr"></div>
            <div className="scan-corner corner-bl"></div>
            <div className="scan-corner corner-br"></div>
            <Camera size={64} style={{ color: '#cbd5e1' }} />
          </div>
          
          <button className="btn-scan-start">
            <Maximize size={20} /> Start Scan
          </button>
        </div>

        <div className="lookup-card">
          <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>Manual Lookup</h3>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input 
              type="text" 
              placeholder="Product name or order ID" 
              className="modal-input"
              style={{ flex: 1 }}
            />
            <button className="btn-add-item" style={{ height: 'auto' }}>
              Search
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminQR;
