import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Login.css';

const Login = () => {
  const [view, setView] = useState('selection');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const navigate = useNavigate();
  const { loginAdmin, loginCustomer } = useAuth();
  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [error, setError] = useState('');
  
  // Customer login state
  const [customerUsername, setCustomerUsername] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerError, setCustomerError] = useState('');
  
  // Register state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const result = loginAdmin(adminUser, adminPass);
    if (result.success) {
      console.log(`${result.role} logged in`);
      navigate('/admin/dashboard');
    } else {
      setError(result.message);
    }
  };

  const handleCustomerLogin = (e) => {
    e.preventDefault();
    setCustomerError('');
    
    if (!customerUsername.trim() || !customerPassword.trim()) {
      setCustomerError('Please fill in all fields');
      return;
    }
    
    if (customerPassword.length < 6) {
      setCustomerError('Password must be at least 6 characters');
      return;
    }
    
    // Simple validation - store customer in localStorage
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    const foundCustomer = customers.find(c => c.username === customerUsername);
    
    if (!foundCustomer) {
      setCustomerError('Username not found. Please create an account first.');
      return;
    }
    
    if (foundCustomer.password !== customerPassword) {
      setCustomerError('Incorrect password');
      return;
    }
    
    // Save login state
    loginCustomer({
      username: customerUsername,
      email: foundCustomer.email
    });
    
    navigate('/');
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setRegError('');
    
    if (!regUsername.trim() || !regEmail.trim() || !regPassword.trim() || !regConfirmPassword.trim()) {
      setRegError('Please fill in all fields');
      return;
    }
    
    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match');
      return;
    }
    
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters');
      return;
    }
    
    // Check if username already exists
    const customers = JSON.parse(localStorage.getItem('customers') || '[]');
    if (customers.some(c => c.username === regUsername)) {
      setRegError('Username already taken');
      return;
    }
    
    // Save new customer
    customers.push({
      username: regUsername,
      email: regEmail,
      password: regPassword
    });
    localStorage.setItem('customers', JSON.stringify(customers));
    
    // Auto-login
    loginCustomer({
      username: regUsername,
      email: regEmail
    });
    
    // Store welcome message
    const welcomeMsg = `Welcome to V&G website ${regUsername}`;
    
    // Reset form
    setRegUsername('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    
    navigate('/', { state: { welcomeMessage: welcomeMsg } });
  };

  if (view === 'admin') {
    return (
      <div style={{ maxWidth: '450px', margin: '4rem auto', background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Admin/Staff Login</h2>
        
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleAdminLogin}>
          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{error}</div>}
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Username</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type="text" 
                placeholder="Enter username"
                className="text-input" 
                style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 1rem 0.75rem 3rem' }} 
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                required
              />
            </div>
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="••••••••"
                className="text-input" 
                style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 3rem' }} 
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            className="btn-primary" 
            style={{ width: '100%', marginTop: '1rem', background: '#ff9800', border: 'none', padding: '0.75rem', borderRadius: '9999px', fontSize: '1rem', fontWeight: 600, color: 'white' }}
          >
            Login
          </button>
          
          <div style={{ marginTop: '1.5rem' }}>
            <button 
              type="button"
              onClick={() => setView('selection')}
              style={{ color: '#475569', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', padding: 0 }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div style={{ maxWidth: '450px', margin: '4rem auto', background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Create Account</h2>
        
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} onSubmit={handleRegister}>
          {regError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{regError}</div>}
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Username</label>
            <input 
              type="text" 
              placeholder="Choose a username"
              className="text-input" 
              style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 1rem' }} 
              value={regUsername}
              onChange={(e) => setRegUsername(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Email or Mobile No.</label>
            <input 
              type="text" 
              placeholder="you@example.com or 09123456789"
              className="text-input" 
              style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 1rem' }} 
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                className="text-input"
                placeholder="Enter password"
                style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 2.5rem 0.75rem 1rem' }} 
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showConfirmPassword ? "text" : "password"} 
                className="text-input"
                placeholder="Confirm password"
                style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 2.5rem 0.75rem 1rem' }} 
                value={regConfirmPassword}
                onChange={(e) => setRegConfirmPassword(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            className="btn-primary" 
            style={{ width: '100%', marginTop: '0.5rem', background: '#ff9800', border: 'none', padding: '0.75rem', borderRadius: '9999px', fontSize: '1rem', fontWeight: 600, color: 'white' }}
          >
            Create Account
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
            <button 
              type="button"
              onClick={() => setView('customer')}
              style={{ color: '#d97706', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Already have an account? Login
            </button>
            <button 
              type="button"
              onClick={() => setView('selection')}
              style={{ color: '#475569', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginLeft: '0.5rem' }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'customer') {
    return (
      <div style={{ maxWidth: '450px', margin: '4rem auto', background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Customer Login</h2>
        
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleCustomerLogin}>
          {customerError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{customerError}</div>}
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Username</label>
            <input 
              type="text" 
              placeholder="Enter your username"
              className="text-input" 
              style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 1rem' }} 
              value={customerUsername}
              onChange={(e) => setCustomerUsername(e.target.value)}
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? "text" : "password"} 
                className="text-input" 
                placeholder="Enter your password"
                style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 2.5rem 0.75rem 1rem' }} 
                value={customerPassword}
                onChange={(e) => setCustomerPassword(e.target.value)}
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit"
            className="btn-primary" 
            style={{ width: '100%', marginTop: '0.5rem', background: '#ff9800', border: 'none', padding: '0.75rem', borderRadius: '9999px', fontSize: '1rem', fontWeight: 600, color: 'white', cursor: 'pointer' }}
          >
            Login
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <button 
              type="button"
              onClick={() => setView('register')} 
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#d97706', fontWeight: 600, fontSize: '0.95rem' }}
            >
              Don't have an account? Create one
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button 
              type="button"
              onClick={() => setView('forgot')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#475569', fontWeight: 600, fontSize: '0.95rem' }}
            >
              Forgot password?
            </button>
          </div>
          
          <div style={{ marginTop: '1.5rem' }}>
            <button 
              type="button"
              onClick={() => setView('selection')}
              style={{ color: '#475569', fontWeight: 600, fontSize: '0.9rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'forgot') {
    return (
      <div style={{ maxWidth: '450px', margin: '4rem auto', background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#0f172a' }}>Forgot Password</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>Enter your email or mobile number and we'll send you a link to reset your password.</p>
        
        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={(e) => { e.preventDefault(); alert('Password reset link sent!'); setView('customer'); }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#334155', fontSize: '0.9rem' }}>Email or Mobile No.</label>
            <input 
              type="text" 
              placeholder="you@example.com or 09123456789"
              className="text-input" 
              style={{ width: '100%', borderRadius: '0.75rem', padding: '0.75rem 1rem' }} 
              required
            />
          </div>
          
          <button 
            type="submit"
            className="btn-primary" 
            style={{ width: '100%', marginTop: '0.5rem', background: '#ff9800', border: 'none', padding: '0.75rem', borderRadius: '9999px', fontSize: '1rem', fontWeight: 600, color: 'white', cursor: 'pointer' }}
          >
            Send Reset Link
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <button 
              type="button"
              onClick={() => setView('customer')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#d97706', fontWeight: 600, fontSize: '0.9rem' }}
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '450px', margin: '4rem auto', background: 'white', padding: '3rem', borderRadius: '1rem', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
      <h2 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#0f172a' }}>Login</h2>
      <p style={{ color: '#64748b', marginBottom: '2.5rem', fontSize: '0.95rem' }}>Select how you want to log in.</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <button className="btn-gradient" onClick={() => setView('admin')}>
          Admin Login
        </button>
        
        <button className="btn-gradient" onClick={() => setView('customer')}>
          Customer Login
        </button>
      </div>
    </div>
  );
};

export default Login;
