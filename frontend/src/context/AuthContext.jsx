import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState('customer'); // 'admin', 'staff', 'customer'
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [loggedInCustomer, setLoggedInCustomer] = useState(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const savedAdmin = localStorage.getItem('isAdmin');
    const savedRole = localStorage.getItem('userRole');
    const savedStaff = localStorage.getItem('staffAccounts');
    const savedCustomer = localStorage.getItem('loggedInCustomer');
    
    if (savedAdmin === 'true') {
      setIsAdmin(true);
      setUserRole(savedRole || 'admin');
    }

    if (savedStaff) {
      setStaffAccounts(JSON.parse(savedStaff));
    }

    if (savedCustomer) {
      try {
        setLoggedInCustomer(JSON.parse(savedCustomer));
      } catch(e) {}
    }
  }, []);

  const loginAdmin = (username, password) => {
    // Admin (Manual check for hardcoded admin)
    if (username === 'admin' && password === 'admin') {
      setIsAdmin(true);
      setUserRole('admin');
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('userRole', 'admin');
      return { success: true, role: 'admin' };
    }

    // Staff
    const staff = staffAccounts.find(s => s.username === username && s.password === password);
    if (staff) {
      setIsAdmin(true);
      setUserRole('staff');
      localStorage.setItem('isAdmin', 'true');
      localStorage.setItem('userRole', 'staff');
      return { success: true, role: 'staff' };
    }

    return { success: false, message: 'Invalid credentials' };
  };

  const createStaffAccount = (username, password) => {
    const newStaff = { id: Date.now(), username, password, createdAt: new Date().toISOString() };
    const updatedStaff = [...staffAccounts, newStaff];
    setStaffAccounts(updatedStaff);
    localStorage.setItem('staffAccounts', JSON.stringify(updatedStaff));
  };

  const deleteStaffAccount = (id) => {
    const updatedStaff = staffAccounts.filter(s => s.id !== id);
    setStaffAccounts(updatedStaff);
    localStorage.setItem('staffAccounts', JSON.stringify(updatedStaff));
  };

  const loginCustomer = (customerData) => {
    setLoggedInCustomer(customerData);
    localStorage.setItem('loggedInCustomer', JSON.stringify(customerData));
  };

  const logout = () => {
    setIsAdmin(false);
    setUserRole('customer');
    setLoggedInCustomer(null);
    localStorage.removeItem('isAdmin');
    localStorage.removeItem('userRole');
    localStorage.removeItem('loggedInCustomer');
  };

  return (
    <AuthContext.Provider value={{ isAdmin, userRole, staffAccounts, loggedInCustomer, loginAdmin, loginCustomer, logout, createStaffAccount, deleteStaffAccount }}>
      {children}
    </AuthContext.Provider>
  );
};
