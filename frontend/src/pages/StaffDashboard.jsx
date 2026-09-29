import React from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ClipboardList, Package, ShoppingBag } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './StaffDashboard.css';

const StaffDashboard = () => {
  const { profile } = useAuth();
  const displayName = profile?.fullName || profile?.username || 'Staff Member';

  return (
    <div className="staff-dashboard">
      <section className="staff-dashboard-head">
        <div>
          <p>Staff Dashboard</p>
          <h1>{displayName}</h1>
        </div>
        <span>{profile?.role === 'admin' ? 'Admin' : 'Staff'} Access</span>
      </section>

      <div className="staff-dashboard-grid">
        <Link to="/admin/orders" className="staff-dashboard-tile">
          <ShoppingBag size={22} />
          <div>
            <h2>Orders</h2>
            <p>Review and update order workflow.</p>
          </div>
        </Link>
        <Link to="/admin/products" className="staff-dashboard-tile">
          <Package size={22} />
          <div>
            <h2>Products</h2>
            <p>Maintain product availability.</p>
          </div>
        </Link>
        <Link to="/admin/inventory" className="staff-dashboard-tile">
          <ClipboardList size={22} />
          <div>
            <h2>Inventory</h2>
            <p>Track stock and batch status.</p>
          </div>
        </Link>
        <Link to="/admin/reports" className="staff-dashboard-tile">
          <BarChart3 size={22} />
          <div>
            <h2>Reports</h2>
            <p>Submit and review sales reports.</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default StaffDashboard;
