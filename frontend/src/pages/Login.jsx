import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  TERMS_ACCEPTANCE_LABEL,
  TERMS_LAST_UPDATED_LABEL,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from '../content/termsAndConditions';
import { passwordRecoveryMode } from '../lib/supabase';
import './Login.css';

const panelStyle = {
  maxWidth: '450px',
  margin: '4rem auto',
  background: 'white',
  padding: '3rem',
  borderRadius: '1rem',
  boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
};

const fieldLabelStyle = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: 600,
  color: '#334155',
  fontSize: '0.9rem',
};

const textInputStyle = {
  width: '100%',
  borderRadius: '0.75rem',
  padding: '0.75rem 1rem',
};

const primaryButtonStyle = {
  width: '100%',
  marginTop: '0.5rem',
  background: '#ff9800',
  border: 'none',
  padding: '0.75rem',
  borderRadius: '9999px',
  fontSize: '1rem',
  fontWeight: 600,
  color: 'white',
  cursor: 'pointer',
};

const secondaryTextButtonStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  fontWeight: 600,
};

const passwordFieldStyle = {
  width: '100%',
  borderRadius: '0.75rem',
  padding: '0.75rem 2.75rem 0.75rem 1rem',
};

const iconPasswordFieldStyle = {
  width: '100%',
  borderRadius: '0.75rem',
  padding: '0.75rem 3rem',
};

const passwordToggleStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  position: 'absolute',
  right: '1rem',
  top: '50%',
  transform: 'translateY(-50%)',
  color: '#64748b',
};

const termsContainerStyle = {
  border: '1px solid #fed7aa',
  background: '#fff7ed',
  borderRadius: '1rem',
  padding: '1rem',
};

const termsScrollStyle = {
  maxHeight: '240px',
  overflowY: 'auto',
  marginTop: '0.9rem',
  paddingRight: '0.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const termsSectionTitleStyle = {
  margin: 0,
  color: '#9a3412',
  fontSize: '0.92rem',
  fontWeight: 700,
};

const termsParagraphStyle = {
  margin: '0.45rem 0 0',
  color: '#7c2d12',
  fontSize: '0.84rem',
  lineHeight: 1.55,
};

const checkboxLabelStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.75rem',
  color: '#431407',
  fontSize: '0.9rem',
  lineHeight: 1.5,
  cursor: 'pointer',
};

const termsNoticeStyle = {
  border: '1px solid #fed7aa',
  background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
  borderRadius: '1rem',
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
};

const termsModalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  zIndex: 1000,
};

const termsModalCardStyle = {
  width: 'min(680px, 100%)',
  maxHeight: '85vh',
  background: '#ffffff',
  borderRadius: '1.25rem',
  padding: '1.5rem',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.3)',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

const termsModalFooterStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.75rem',
  flexWrap: 'wrap',
};

const Login = () => {
  const navigate = useNavigate();
  const {
    loginAdmin,
    loginCustomer,
    registerCustomer,
    verifyCustomerSignupCode,
    resendCustomerSignupCode,
    requestPasswordReset,
    verifyPasswordRecoveryCode,
    completePasswordRecovery,
    isPasswordRecovery,
  } = useAuth();

  const [view, setView] = useState('selection');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [adminUser, setAdminUser] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [adminError, setAdminError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  const [customerUsername, setCustomerUsername] = useState('');
  const [customerPassword, setCustomerPassword] = useState('');
  const [customerError, setCustomerError] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const [showCustomerPassword, setShowCustomerPassword] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regError, setRegError] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirmPassword, setShowRegisterConfirmPassword] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [submitAfterTermsAcceptance, setSubmitAfterTermsAcceptance] = useState(false);

  const [pendingVerification, setPendingVerification] = useState({
    email: '',
    username: '',
  });
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyMessage, setVerifyMessage] = useState('');

  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStep, setForgotStep] = useState('request');
  const [pendingRecoveryEmail, setPendingRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotMessageType, setForgotMessageType] = useState('');

  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const isRecoveryCodeMode = passwordRecoveryMode === 'code';
  const activeView = isPasswordRecovery ? 'reset' : view;

  const resetForgotPasswordFlow = () => {
    setForgotIdentifier('');
    setForgotStep('request');
    setPendingRecoveryEmail('');
    setRecoveryCode('');
    setForgotMessage('');
    setForgotMessageType('');
    setResetPassword('');
    setResetConfirmPassword('');
    setResetError('');
  };

  const openTermsModal = (shouldSubmitAfterOpen = false) => {
    setRegError('');
    setSubmitAfterTermsAcceptance(shouldSubmitAfterOpen);
    setIsTermsModalOpen(true);
  };

  const closeTermsModal = () => {
    const attemptedSubmit = submitAfterTermsAcceptance;
    setIsTermsModalOpen(false);
    setSubmitAfterTermsAcceptance(false);

    if (attemptedSubmit && !hasAcceptedTerms) {
      setRegError('You must agree to the Terms and Conditions before creating an account.');
    }
  };

  const openRegisterFlow = () => {
    setView('register');
    openTermsModal(false);
  };

  const submitRegistration = async () => {
    const acceptedTermsAt = new Date().toISOString();

    setIsSubmitting(true);
    const result = await registerCustomer({
      username: regUsername,
      email: regEmail,
      password: regPassword,
      fullName: '',
      acceptedTerms: hasAcceptedTerms,
      acceptedTermsAt,
      termsVersion: TERMS_VERSION,
    });
    setIsSubmitting(false);

    if (!result.success) {
      setRegError(result.message);
      return;
    }

    setRegUsername('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setHasAcceptedTerms(false);

    if (result.needsVerification) {
      setPendingVerification({
        email: result.email || regEmail.trim().toLowerCase(),
        username: result.username || regUsername.trim().toLowerCase(),
      });
      setVerificationCode('');
      setVerifyError('');
      setVerifyMessage(`We sent a 6-digit verification code to ${result.email}.`);
      setView('verify');
      return;
    }

    if (result.autoLoggedIn === false) {
      setCustomerError('');
      setCustomerMessage(result.message || 'Account created successfully. Please log in with your new account.');
      setView('customer');
      return;
    }

    if (!result.needsVerification) {
      const welcomeMsg = `Welcome to V&G website ${result.username || regUsername}`;
      navigate('/', { state: { welcomeMessage: welcomeMsg } });
    }
  };

  const handleAcceptTermsModal = async () => {
    const shouldSubmit = submitAfterTermsAcceptance;
    setIsTermsModalOpen(false);
    setSubmitAfterTermsAcceptance(false);

    if (shouldSubmit) {
      await submitRegistration();
    }
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError('');
    setIsSubmitting(true);
    const result = await loginAdmin(adminUser, adminPass);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/admin/dashboard');
      return;
    }

    setAdminError(result.message);
  };

  const handleCustomerLogin = async (e) => {
    e.preventDefault();
    setCustomerError('');
    setCustomerMessage('');

    if (!customerUsername.trim() || !customerPassword.trim()) {
      setCustomerError('Please fill in all fields');
      return;
    }

    if (customerPassword.length < 6) {
      setCustomerError('Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    const result = await loginCustomer(customerUsername, customerPassword);
    setIsSubmitting(false);

    if (result.success) {
      navigate('/');
      return;
    }

    if (result.requiresVerification && result.email) {
      setPendingVerification({
        email: result.email,
        username: '',
      });
      setVerificationCode('');
      setVerifyMessage(result.message);
      setVerifyError('');
      setView('verify');
      return;
    }

    setCustomerError(result.message);
  };

  const handleRegister = async (e) => {
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

    if (!hasAcceptedTerms) {
      openTermsModal(true);
      return;
    }

    await submitRegistration();
  };

  const handleVerifySignup = async (e) => {
    e.preventDefault();
    setVerifyError('');

    if (!pendingVerification.email.trim()) {
      setVerifyError('Missing email address for verification.');
      return;
    }

    if (!/^\d{6}$/.test(verificationCode.trim())) {
      setVerifyError('Please enter the 6-digit code from your email.');
      return;
    }

    setIsSubmitting(true);
    const result = await verifyCustomerSignupCode(pendingVerification.email, verificationCode);
    setIsSubmitting(false);

    if (!result.success) {
      setVerifyError(result.message);
      return;
    }

    const welcomeName = pendingVerification.username || pendingVerification.email;
    setVerificationCode('');
    navigate('/', {
      state: {
        welcomeMessage: `Welcome to V&G website ${welcomeName}`,
      },
    });
  };

  const handleResendSignupCode = async () => {
    setVerifyError('');
    setVerifyMessage('');

    if (!pendingVerification.email.trim()) {
      setVerifyError('Enter your email address first.');
      return;
    }

    setIsSubmitting(true);
    const result = await resendCustomerSignupCode(pendingVerification.email);
    setIsSubmitting(false);

    if (!result.success) {
      setVerifyError(result.message);
      return;
    }

    setVerifyMessage(`A new 6-digit code was sent to ${pendingVerification.email}.`);
  };

  const handleForgotPassword = async (e) => {
    e?.preventDefault();
    setResetError('');
    setForgotMessage('');
    setForgotMessageType('');

    if (!forgotIdentifier.trim()) {
      setForgotMessage('Enter your username or email first.');
      setForgotMessageType('error');
      return;
    }

    setIsSubmitting(true);
    const result = await requestPasswordReset(forgotIdentifier);
    setIsSubmitting(false);

    if (!result.success) {
      setForgotMessage(result.message);
      setForgotMessageType('error');
      return;
    }

    setPendingRecoveryEmail(result.email || forgotIdentifier.trim().toLowerCase());
    setRecoveryCode('');
    setForgotStep('verify');
    setForgotMessage(
      isRecoveryCodeMode
        ? `We sent a 6-digit reset code to ${result.email || forgotIdentifier.trim()}.`
        : `We sent a password reset email to ${result.email || forgotIdentifier.trim()}. Open the link in that email to continue.`
    );
    setForgotMessageType('success');
  };

  const handleResendRecoveryCode = async () => {
    setResetError('');
    setForgotMessage('');
    setForgotMessageType('');

    if (!pendingRecoveryEmail.trim()) {
      setForgotMessage('Enter your username or email first.');
      setForgotMessageType('error');
      return;
    }

    setIsSubmitting(true);
    const result = await requestPasswordReset(pendingRecoveryEmail);
    setIsSubmitting(false);

    if (!result.success) {
      setForgotMessage(result.message);
      setForgotMessageType('error');
      return;
    }

    setForgotMessage(
      isRecoveryCodeMode
        ? `A new 6-digit reset code was sent to ${result.email || pendingRecoveryEmail}.`
        : `A new password reset email was sent to ${result.email || pendingRecoveryEmail}. Open the link in that email to continue.`
    );
    setForgotMessageType('success');
  };

  const handleResetPasswordWithCode = async (e) => {
    e.preventDefault();
    setResetError('');
    setForgotMessage('');
    setForgotMessageType('');

    if (!pendingRecoveryEmail.trim()) {
      setResetError('Missing email address for password recovery.');
      return;
    }

    if (!/^\d{6}$/.test(recoveryCode.trim())) {
      setResetError('Please enter the 6-digit recovery code from your email.');
      return;
    }

    if (!resetPassword.trim() || !resetConfirmPassword.trim()) {
      setResetError('Please fill in all fields');
      return;
    }

    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    const verifyResult = await verifyPasswordRecoveryCode(pendingRecoveryEmail, recoveryCode);

    if (!verifyResult.success) {
      setIsSubmitting(false);
      setResetError(verifyResult.message);
      return;
    }

    const updateResult = await completePasswordRecovery(resetPassword);
    setIsSubmitting(false);

    if (!updateResult.success) {
      setResetError(updateResult.message);
      return;
    }

    const recoveredEmail = pendingRecoveryEmail;
    resetForgotPasswordFlow();
    setCustomerMessage(`Password updated for ${recoveredEmail}. Please log in with your new password.`);
    setView('customer');
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetError('');

    if (!resetPassword.trim() || !resetConfirmPassword.trim()) {
      setResetError('Please fill in all fields');
      return;
    }

    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters');
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      setResetError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    const result = await completePasswordRecovery(resetPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setResetError(result.message);
      return;
    }

    setResetPassword('');
    setResetConfirmPassword('');
    resetForgotPasswordFlow();
    setCustomerMessage('Password updated. Please log in with your new password.');
    setView('customer');
  };

  if (activeView === 'admin') {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Admin/Staff Login</h2>

        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleAdminLogin}>
          {adminError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{adminError}</div>}

          <div>
            <label style={fieldLabelStyle}>Username or Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Enter username or email"
                className="text-input"
                style={iconPasswordFieldStyle}
                value={adminUser}
                onChange={(e) => setAdminUser(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type={showAdminPassword ? 'text' : 'password'}
                placeholder="Enter password"
                className="text-input"
                style={iconPasswordFieldStyle}
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowAdminPassword((value) => !value)}
                style={passwordToggleStyle}
              >
                {showAdminPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ ...primaryButtonStyle, marginTop: '1rem' }}>
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>

          <div style={{ marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => setView('selection')}
              style={{ ...secondaryTextButtonStyle, color: '#475569', fontSize: '0.9rem' }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (activeView === 'register') {
    return (
      <>
        <div style={panelStyle}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Create Account</h2>

          <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} onSubmit={handleRegister}>
            {regError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{regError}</div>}

            <div>
              <label style={fieldLabelStyle}>Username</label>
              <input
                type="text"
                placeholder="Choose a username"
                className="text-input"
                style={textInputStyle}
                value={regUsername}
                onChange={(e) => setRegUsername(e.target.value)}
              />
            </div>

            <div>
              <label style={fieldLabelStyle}>Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="text-input"
                style={textInputStyle}
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>

            <div>
              <label style={fieldLabelStyle}>Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showRegisterPassword ? 'text' : 'password'}
                  className="text-input"
                  placeholder="Enter password"
                  style={passwordFieldStyle}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword((value) => !value)}
                  style={passwordToggleStyle}
                >
                  {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label style={fieldLabelStyle}>Confirm Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showRegisterConfirmPassword ? 'text' : 'password'}
                  className="text-input"
                  placeholder="Confirm password"
                  style={passwordFieldStyle}
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterConfirmPassword((value) => !value)}
                  style={passwordToggleStyle}
                >
                  {showRegisterConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={termsNoticeStyle}>
              <div>
                <div style={{ color: '#9a3412', fontSize: '0.98rem', fontWeight: 700 }}>Terms and Conditions</div>
                <div style={{ color: '#7c2d12', fontSize: '0.82rem', marginTop: '0.2rem', lineHeight: 1.5 }}>
                  Before we create the account, an alert box will show the full Terms and Conditions for review.
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => openTermsModal(false)}
                  style={{ ...secondaryTextButtonStyle, color: '#c2410c', fontSize: '0.9rem' }}
                >
                  View Terms and Conditions
                </button>
                <div style={{ color: hasAcceptedTerms ? '#15803d' : '#9a3412', fontSize: '0.82rem', fontWeight: 700 }}>
                  {hasAcceptedTerms ? 'Terms accepted for this signup' : 'Terms not accepted yet'}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              style={primaryButtonStyle}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating Account...' : 'Create Account'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setView('customer')}
                style={{ ...secondaryTextButtonStyle, color: '#d97706', fontSize: '0.9rem' }}
              >
                Already have an account? Login
              </button>
              <button
                type="button"
                onClick={() => setView('selection')}
                style={{ ...secondaryTextButtonStyle, color: '#475569', fontSize: '0.9rem' }}
              >
                Back
              </button>
            </div>
          </form>
        </div>

        {isTermsModalOpen && (
          <div style={termsModalOverlayStyle}>
            <div style={termsModalCardStyle} role="dialog" aria-modal="true" aria-labelledby="terms-modal-title">
              <div>
                <h3 id="terms-modal-title" style={{ margin: 0, color: '#0f172a', fontSize: '1.2rem' }}>
                  Terms and Conditions
                </h3>
                <p style={{ margin: '0.45rem 0 0', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.55 }}>
                  Please read the full Terms and Conditions before creating your account. Last updated {TERMS_LAST_UPDATED_LABEL}.
                </p>
              </div>

              <div style={{ ...termsContainerStyle, padding: '1rem 1rem 0.75rem' }}>
                <div style={termsScrollStyle}>
                  {TERMS_SECTIONS.map((section) => (
                    <div key={section.title}>
                      <p style={termsSectionTitleStyle}>{section.title}</p>
                      {section.paragraphs.map((paragraph) => (
                        <p key={paragraph} style={termsParagraphStyle}>{paragraph}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={hasAcceptedTerms}
                  onChange={(e) => setHasAcceptedTerms(e.target.checked)}
                  style={{ marginTop: '0.2rem', accentColor: '#ea580c' }}
                />
                <span>{TERMS_ACCEPTANCE_LABEL}</span>
              </label>

              <div style={termsModalFooterStyle}>
                <button
                  type="button"
                  onClick={closeTermsModal}
                  style={{
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    padding: '0.75rem 1rem',
                    borderRadius: '9999px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAcceptTermsModal}
                  className="btn-primary"
                  style={{
                    ...primaryButtonStyle,
                    width: 'auto',
                    marginTop: 0,
                    opacity: hasAcceptedTerms ? 1 : 0.65,
                    cursor: hasAcceptedTerms ? 'pointer' : 'not-allowed',
                  }}
                  disabled={!hasAcceptedTerms || isSubmitting}
                >
                  {submitAfterTermsAcceptance ? 'Agree and Create Account' : 'Agree and Continue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (activeView === 'verify') {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#0f172a' }}>Verify Your Account</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Enter the 6-digit code sent to your email to activate your customer account.
        </p>

        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} onSubmit={handleVerifySignup}>
          {verifyError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{verifyError}</div>}
          {verifyMessage && <div style={{ color: '#15803d', fontSize: '0.85rem', fontWeight: 600 }}>{verifyMessage}</div>}

          <div>
            <label style={fieldLabelStyle}>Email Address</label>
            <input
              type="email"
              className="text-input"
              style={textInputStyle}
              value={pendingVerification.email}
              onChange={(e) => setPendingVerification((current) => ({ ...current, email: e.target.value }))}
              required
            />
          </div>

          <div>
            <label style={fieldLabelStyle}>6-Digit Code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              className="text-input"
              style={{ ...textInputStyle, letterSpacing: '0.35em', textAlign: 'center', fontSize: '1.05rem' }}
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
          </div>

          <button type="submit" className="btn-primary" style={primaryButtonStyle}>
            {isSubmitting ? 'Verifying...' : 'Verify Account'}
          </button>

          <button
            type="button"
            onClick={handleResendSignupCode}
            style={{ ...secondaryTextButtonStyle, color: '#d97706', fontSize: '0.95rem', alignSelf: 'center' }}
          >
            Resend Code
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setView('customer')}
              style={{ ...secondaryTextButtonStyle, color: '#475569', fontSize: '0.9rem' }}
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (activeView === 'customer') {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: '#0f172a' }}>Customer Login</h2>

        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }} onSubmit={handleCustomerLogin}>
          {customerError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{customerError}</div>}
          {customerMessage && <div style={{ color: '#15803d', fontSize: '0.85rem', fontWeight: 600 }}>{customerMessage}</div>}

          <div>
            <label style={fieldLabelStyle}>Username or Email</label>
            <input
              type="text"
              placeholder="Enter your username or email"
              className="text-input"
              style={textInputStyle}
              value={customerUsername}
              onChange={(e) => setCustomerUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={fieldLabelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showCustomerPassword ? 'text' : 'password'}
                className="text-input"
                placeholder="Enter your password"
                style={passwordFieldStyle}
                value={customerPassword}
                onChange={(e) => setCustomerPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowCustomerPassword((value) => !value)}
                style={passwordToggleStyle}
              >
                {showCustomerPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={primaryButtonStyle}>
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={openRegisterFlow}
              style={{ ...secondaryTextButtonStyle, color: '#d97706', fontSize: '0.95rem' }}
            >
              Do not have an account? Create one
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
            <button
              type="button"
              onClick={() => {
                resetForgotPasswordFlow();
                setView('forgot');
              }}
              style={{ ...secondaryTextButtonStyle, color: '#475569', fontSize: '0.95rem' }}
            >
              Forgot password?
            </button>
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => setView('selection')}
              style={{ ...secondaryTextButtonStyle, color: '#475569', fontSize: '0.9rem' }}
            >
              Back
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (activeView === 'forgot') {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', color: '#0f172a' }}>Forgot Password</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>
          {isRecoveryCodeMode
            ? 'Enter your username or email, send the 6-digit code to Gmail, then enter the code below and choose your new password.'
            : 'Enter your username or email and we will send a password reset email. Open the reset link in that email, then return here to set your new password.'}
        </p>

        <form
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
          onSubmit={isRecoveryCodeMode ? handleResetPasswordWithCode : handleForgotPassword}
        >
          {forgotMessage && (
            <div style={{ color: forgotMessageType === 'success' ? '#15803d' : '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
              {forgotMessage}
            </div>
          )}
          {resetError && (
            <div style={{ color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600 }}>
              {resetError}
            </div>
          )}

          <div>
            <label style={fieldLabelStyle}>Username or Email</label>
            <input
              type="text"
              placeholder="Enter your username or email"
              className="text-input"
              style={textInputStyle}
              value={forgotIdentifier}
              onChange={(e) => setForgotIdentifier(e.target.value)}
              required
            />
          </div>

          {isRecoveryCodeMode && (
            <div>
              <label style={fieldLabelStyle}>6-Digit Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                className="text-input"
                style={{ ...textInputStyle, letterSpacing: '0.35em', textAlign: 'center', fontSize: '1.05rem' }}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
            </div>
          )}

          {isRecoveryCodeMode && (
            <div>
              <label style={fieldLabelStyle}>New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  className="text-input"
                  placeholder="Enter new password"
                  style={passwordFieldStyle}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((value) => !value)}
                  style={passwordToggleStyle}
                >
                  {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {isRecoveryCodeMode && (
            <div>
              <label style={fieldLabelStyle}>Confirm New Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showResetConfirmPassword ? 'text' : 'password'}
                  className="text-input"
                  placeholder="Confirm new password"
                  style={passwordFieldStyle}
                  value={resetConfirmPassword}
                  onChange={(e) => setResetConfirmPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowResetConfirmPassword((value) => !value)}
                  style={passwordToggleStyle}
                >
                  {showResetConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          <button type="button" className="btn-primary" style={primaryButtonStyle} onClick={handleForgotPassword}>
            {isSubmitting ? 'Working...' : (isRecoveryCodeMode ? 'Send Reset Code' : 'Send Reset Email')}
          </button>

          {isRecoveryCodeMode && (
            <button type="submit" className="btn-primary" style={primaryButtonStyle}>
              {isSubmitting ? 'Working...' : 'Verify Code and Reset Password'}
            </button>
          )}

          {forgotStep === 'verify' && (
            <button
              type="button"
              onClick={handleResendRecoveryCode}
              style={{ ...secondaryTextButtonStyle, color: '#d97706', fontSize: '0.95rem', alignSelf: 'center' }}
            >
              Resend Code
            </button>
          )}

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              type="button"
              onClick={() => {
                resetForgotPasswordFlow();
                setView('customer');
              }}
              style={{ ...secondaryTextButtonStyle, color: '#d97706', fontSize: '0.9rem' }}
            >
              Back to Login
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (activeView === 'reset') {
    return (
      <div style={panelStyle}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#0f172a' }}>Set a New Password</h2>
        <p style={{ color: '#64748b', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Your recovery session is active. Enter a new password to finish restoring your customer account.
        </p>

        <form style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} onSubmit={handleResetPassword}>
          {resetError && <div style={{ color: '#ef4444', fontSize: '0.85rem', fontWeight: 600 }}>{resetError}</div>}

          <div>
            <label style={fieldLabelStyle}>New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showResetPassword ? 'text' : 'password'}
                className="text-input"
                placeholder="Enter new password"
                style={passwordFieldStyle}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowResetPassword((value) => !value)}
                style={passwordToggleStyle}
              >
                {showResetPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label style={fieldLabelStyle}>Confirm New Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showResetConfirmPassword ? 'text' : 'password'}
                className="text-input"
                placeholder="Confirm new password"
                style={passwordFieldStyle}
                value={resetConfirmPassword}
                onChange={(e) => setResetConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowResetConfirmPassword((value) => !value)}
                style={passwordToggleStyle}
              >
                {showResetConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" style={primaryButtonStyle}>
            {isSubmitting ? 'Updating Password...' : 'Save New Password'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
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
