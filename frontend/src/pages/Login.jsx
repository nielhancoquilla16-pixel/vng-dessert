import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff, Link2, Lock, Mail, RefreshCw, UserPlus } from 'lucide-react';
import { getDashboardPathForRole, useAuth } from '../context/AuthContext';
import useDialogFocus from '../hooks/useDialogFocus';
import {
  TERMS_ACCEPTANCE_LABEL,
  TERMS_LAST_UPDATED_LABEL,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from '../content/termsAndConditions';
import { apiRequest } from '../lib/api';
import { getRememberMePreference, passwordRecoveryMode } from '../lib/supabase';
import { PASSWORD_REQUIREMENTS, validatePassword } from '../utils/passwordValidation';
import './Login.css';

const initialCaptcha = {
  id: '',
  question: '',
  answer: '',
  isLoading: false,
  error: '',
};

const getInitialView = (search = '') => {
  const params = new URLSearchParams(search);
  const mode = String(params.get('mode') || params.get('view') || '').toLowerCase();
  return mode === 'signup' || mode === 'register' ? 'signup' : 'login';
};

const getMessageClass = (type) => (
  type === 'success' ? 'auth-alert auth-alert-success' : 'auth-alert auth-alert-error'
);

const AuthAlert = ({ message, type = 'error' }) => (
  message ? <div className={getMessageClass(type)} role={type === 'success' ? 'status' : 'alert'}>{message}</div> : null
);

const PasswordField = ({
  id,
  label,
  value,
  onChange,
  showPassword,
  onToggle,
  placeholder = 'Enter password',
  maxLength = 20,
  autoComplete = 'current-password',
  isMatch = false,
}) => (
  <div className="auth-field">
    <label htmlFor={id}>{label}</label>
    <div className={`auth-input-shell${isMatch ? ' is-password-match' : ''}`}>
      <Lock size={18} />
      <input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        className="auth-icon-button"
        onClick={onToggle}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
      >
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>
);

const PasswordRequirements = ({ password = '' }) => {
  const value = String(password ?? '');
  const requirementChecks = [
    value.length >= 8 && value.length <= 20,
    /[A-Z]/.test(value),
    /[a-z]/.test(value),
    /[0-9]/.test(value),
    /[!@#$%^&*]/.test(value),
  ];

  return (
    <section className="auth-password-requirements" aria-label="Password Requirements">
      <h3>Password Requirements</h3>
      <ul>
        {PASSWORD_REQUIREMENTS.map((requirement, index) => (
          <li
            key={requirement}
            className={requirementChecks[index] ? 'is-satisfied' : ''}
          >
            {requirement}
          </li>
        ))}
      </ul>
    </section>
  );
};

const CaptchaField = ({ captcha, onAnswerChange, onRefresh, disabled }) => (
  <div className="auth-captcha">
    <div>
      <span className="auth-captcha-label">CAPTCHA</span>
      <strong>{captcha.isLoading ? 'Loading...' : captcha.question || 'Refresh challenge'}</strong>
    </div>
    <input
      type="text"
      inputMode="numeric"
      aria-label="CAPTCHA answer"
      placeholder="Answer"
      value={captcha.answer}
      onChange={(event) => onAnswerChange(event.target.value.replace(/\D/g, '').slice(0, 3))}
      disabled={disabled || captcha.isLoading}
      required
    />
    <button
      type="button"
      className="auth-icon-button auth-refresh-button"
      onClick={onRefresh}
      disabled={disabled || captcha.isLoading}
      aria-label="Refresh CAPTCHA"
    >
      <RefreshCw size={18} />
    </button>
  </div>
);

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    session,
    profile,
    isAuthLoading,
    loginUser,
    registerCustomer,
    resendCustomerSignupLink,
    requestPasswordReset,
    verifyPasswordRecoveryCode,
    completePasswordRecovery,
    isPasswordRecovery,
  } = useAuth();

  const [view, setView] = useState(() => getInitialView(location.search));
  const activeView = isPasswordRecovery ? 'reset' : view;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState({ type: '', message: '' });
  const [captcha, setCaptcha] = useState(initialCaptcha);
  const [resendCooldown, setResendCooldown] = useState(0);

  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getRememberMePreference());

  const [signupUsername, setSignupUsername] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [hasAcceptedTerms, setHasAcceptedTerms] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [hasReachedTermsBottom, setHasReachedTermsBottom] = useState(false);
  const [hasCheckedTermsInModal, setHasCheckedTermsInModal] = useState(false);
  const termsContentRef = useRef(null);
  const termsDialogRef = useDialogFocus({
    isOpen: isTermsModalOpen,
    onClose: () => {
      setIsTermsModalOpen(false);
      setHasReachedTermsBottom(false);
      setHasCheckedTermsInModal(false);
    },
    closeDisabled: isSubmitting,
  });

  const [pendingVerification, setPendingVerification] = useState({ email: '', username: '' });

  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotStep, setForgotStep] = useState('request');
  const [pendingRecoveryEmail, setPendingRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);

  const signupPasswordValidation = useMemo(() => validatePassword(signupPassword), [signupPassword]);
  const signupPasswordsMatch = signupPassword.length > 0 && signupPassword === signupConfirmPassword;
  const resetPasswordValidation = useMemo(() => validatePassword(resetPassword), [resetPassword]);
  const shouldShowCaptcha = activeView === 'signup';
  const isRecoveryCodeMode = passwordRecoveryMode === 'code';

  useEffect(() => {
    if (!isTermsModalOpen) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      const termsContent = termsContentRef.current;
      if (termsContent && termsContent.scrollHeight <= termsContent.clientHeight + 1) {
        setHasReachedTermsBottom(true);
      }
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [isTermsModalOpen]);

  const loadCaptcha = useCallback(async () => {
    setCaptcha((current) => ({ ...current, isLoading: true, error: '' }));

    try {
      const challenge = await apiRequest('/api/auth/captcha');
      setCaptcha({
        id: challenge.id,
        question: challenge.question,
        answer: '',
        isLoading: false,
        error: '',
      });
    } catch (error) {
      setCaptcha({
        ...initialCaptcha,
        error: error.message || 'Unable to load CAPTCHA.',
      });
    }
  }, []);

  useEffect(() => {
    if (shouldShowCaptcha) {
      const timer = window.setTimeout(() => {
        loadCaptcha();
      }, 0);

      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [loadCaptcha, shouldShowCaptcha]);

  useEffect(() => {
    if (resendCooldown <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (
      !isPasswordRecovery
      && !isAuthLoading
      && session
      && profile?.emailVerified
    ) {
      navigate(getDashboardPathForRole(profile.role), { replace: true });
    }
  }, [isAuthLoading, isPasswordRecovery, navigate, profile, session]);

  const showAlert = (message, type = 'error') => {
    setAlert({ message, type });
  };

  const clearAlert = () => {
    setAlert({ type: '', message: '' });
  };

  const switchView = (nextView) => {
    clearAlert();
    setView(nextView);
    setResendCooldown(0);
  };

  const getCaptchaPayload = () => ({
    captchaId: captcha.id,
    captchaAnswer: captcha.answer,
  });

  const handleLogin = async (event) => {
    event.preventDefault();
    clearAlert();

    if (!loginIdentifier.trim() || !loginPassword.trim()) {
      showAlert('Enter your email or username and password.');
      return;
    }

    setIsSubmitting(true);
    const result = await loginUser(loginIdentifier, loginPassword, {
      rememberMe,
      captchaRequired: false,
    });
    setIsSubmitting(false);

    if (result.success) {
      navigate(result.redirectTo || '/', {
        state: { welcomeMessage: `Welcome back, ${loginIdentifier.trim()}` },
      });
      return;
    }

    if (result.requiresVerification && result.email) {
      setPendingVerification({ email: result.email, username: loginIdentifier.trim() });
      setResendCooldown(0);
      clearAlert();
      setView('verify');
      return;
    }

    showAlert(result.message || 'Unable to log in.');
  };

  const submitSignup = async () => {
    const acceptedTermsAt = new Date().toISOString();
    setIsSubmitting(true);
    const result = await registerCustomer({
      username: signupUsername,
      email: signupEmail,
      password: signupPassword,
      acceptedTerms: hasAcceptedTerms,
      termsReadToBottom: hasAcceptedTerms,
      termsExplicitlyAccepted: hasAcceptedTerms,
      acceptedTermsAt,
      termsVersion: TERMS_VERSION,
      ...getCaptchaPayload(),
    });
    setIsSubmitting(false);

    if (!result.success) {
      showAlert(result.message || 'Unable to create the account.');
      loadCaptcha();
      return;
    }

    if (!result.needsVerification) {
      setLoginIdentifier(result.email || signupEmail.trim().toLowerCase());
      setSignupUsername('');
      setSignupEmail('');
      setSignupPassword('');
      setSignupConfirmPassword('');
      setHasAcceptedTerms(false);
      setView('login');
      showAlert(result.message || 'Account created. You can log in now.', 'success');
      loadCaptcha();
      return;
    }

    setPendingVerification({
      email: result.email || signupEmail.trim().toLowerCase(),
      username: result.username || signupUsername.trim().toLowerCase(),
    });
    setResendCooldown(result.resendCooldownSeconds || 35);
    setSignupUsername('');
    setSignupEmail('');
    setSignupPassword('');
    setSignupConfirmPassword('');
    setHasAcceptedTerms(false);
    clearAlert();
    setView('verify');
  };

  const openTermsModal = () => {
    setHasReachedTermsBottom(false);
    setHasCheckedTermsInModal(false);
    setIsTermsModalOpen(true);
  };

  const closeTermsModal = () => {
    setHasReachedTermsBottom(false);
    setHasCheckedTermsInModal(false);
    setIsTermsModalOpen(false);
  };

  const handleTermsScroll = (event) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 2) {
      setHasReachedTermsBottom(true);
    }
  };

  const handleAcceptTerms = () => {
    if (!hasReachedTermsBottom || !hasCheckedTermsInModal) return;
    setHasAcceptedTerms(true);
    closeTermsModal();
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    clearAlert();

    if (!signupUsername.trim() || !signupEmail.trim() || !signupPassword.trim() || !signupConfirmPassword.trim()) {
      showAlert('Fill in all signup fields.');
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      showAlert('Passwords do not match.');
      return;
    }

    if (!signupPasswordValidation.valid) {
      showAlert(signupPasswordValidation.message);
      return;
    }

    if (!captcha.answer.trim()) {
      showAlert('Complete the CAPTCHA before signing up.');
      return;
    }

    if (!hasAcceptedTerms) {
      openTermsModal();
      return;
    }

    await submitSignup();
  };

  const handleResendSignupLink = async () => {
    clearAlert();
    setIsSubmitting(true);
    const result = await resendCustomerSignupLink(pendingVerification.email);
    setIsSubmitting(false);

    if (!result.success) {
      setResendCooldown(result.cooldownSeconds ?? resendCooldown);
      showAlert(result.message || 'Unable to resend the verification link.');
      return;
    }

    setResendCooldown(result.resendCooldownSeconds || 35);
  };

  const handleForgotPassword = async (event) => {
    event.preventDefault();
    clearAlert();

    if (!forgotIdentifier.trim()) {
      showAlert('Enter your email or username first.');
      return;
    }

    setIsSubmitting(true);
    const result = await requestPasswordReset(forgotIdentifier, {
      captchaRequired: false,
    });
    setIsSubmitting(false);

    if (!result.success) {
      showAlert(result.message || 'Unable to send the reset email.');
      return;
    }

    setPendingRecoveryEmail(result.email || forgotIdentifier.trim().toLowerCase());
    if (isRecoveryCodeMode) {
      setForgotStep('verify');
      showAlert(`We sent a 6-digit reset code to ${result.email}.`, 'success');
    } else {
      showAlert(`Password reset instructions were sent to ${result.email}.`, 'success');
    }
  };

  const handleVerifyRecovery = async (event) => {
    event.preventDefault();
    clearAlert();

    if (!/^\d{6}$/.test(recoveryCode.trim())) {
      showAlert('Enter the 6-digit reset code.');
      return;
    }

    setIsSubmitting(true);
    const result = await verifyPasswordRecoveryCode(pendingRecoveryEmail, recoveryCode);
    setIsSubmitting(false);

    if (!result.success) {
      showAlert(result.message || 'Unable to verify the reset code.');
      return;
    }

    setView('reset');
    showAlert('Reset code verified. Create your new password.', 'success');
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    clearAlert();

    if (!resetPasswordValidation.valid) {
      showAlert(resetPasswordValidation.message);
      return;
    }

    if (resetPassword !== resetConfirmPassword) {
      showAlert('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const result = await completePasswordRecovery(resetPassword);
    setIsSubmitting(false);

    if (!result.success) {
      showAlert(result.message || 'Unable to update the password.');
      return;
    }

    setResetPassword('');
    setResetConfirmPassword('');
    setView('login');
    showAlert('Password updated. Please log in with your new password.', 'success');
  };

  const renderCaptcha = () => (
    <>
      <CaptchaField
        captcha={captcha}
        onAnswerChange={(answer) => setCaptcha((current) => ({ ...current, answer }))}
        onRefresh={loadCaptcha}
        disabled={isSubmitting}
      />
      {captcha.error ? <div className="auth-helper auth-helper-error">{captcha.error}</div> : null}
    </>
  );

  const renderLogin = () => (
    <form className="auth-form" onSubmit={handleLogin}>
      <div className="auth-field">
        <label htmlFor="loginIdentifier">Email or Username</label>
        <div className="auth-input-shell">
          <Mail size={18} />
          <input
            id="loginIdentifier"
            type="text"
            value={loginIdentifier}
            onChange={(event) => setLoginIdentifier(event.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
      </div>

      <PasswordField
        id="loginPassword"
        label="Password"
        value={loginPassword}
        onChange={(event) => setLoginPassword(event.target.value)}
        showPassword={showLoginPassword}
        onToggle={() => setShowLoginPassword((current) => !current)}
      />

      <div className="auth-row">
        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
          <span>Remember me</span>
        </label>
        <button type="button" className="auth-link-button" onClick={() => switchView('forgot')}>
          Forgot password?
        </button>
      </div>

      <button type="submit" className="auth-primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );

  const renderSignup = () => (
    <>
      <form className="auth-form" onSubmit={handleSignup} noValidate>
        <div className="auth-field">
          <label htmlFor="signupUsername">Username</label>
          <div className="auth-input-shell">
            <UserPlus size={18} />
            <input
              id="signupUsername"
              type="text"
              value={signupUsername}
              onChange={(event) => setSignupUsername(event.target.value)}
              placeholder="your_username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="signupEmail">Email Address</label>
          <div className="auth-input-shell">
            <Mail size={18} />
            <input
              id="signupEmail"
              type="email"
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </div>
        </div>

        <PasswordField
          id="signupPassword"
          label="Password"
          value={signupPassword}
          onChange={(event) => setSignupPassword(event.target.value)}
          showPassword={showSignupPassword}
          isMatch={signupPasswordsMatch}
          onToggle={() => setShowSignupPassword((current) => !current)}
          autoComplete="new-password"
        />
        <PasswordRequirements password={signupPassword} />

        <PasswordField
          id="signupConfirmPassword"
          label="Confirm Password"
          value={signupConfirmPassword}
          onChange={(event) => setSignupConfirmPassword(event.target.value)}
          showPassword={showSignupConfirmPassword}
          isMatch={signupPasswordsMatch}
          onToggle={() => setShowSignupConfirmPassword((current) => !current)}
          placeholder="Confirm password"
          autoComplete="new-password"
        />

        {renderCaptcha()}

        <div className="auth-terms-row">
          {hasAcceptedTerms && (
            <span className="auth-terms-accepted" role="status">
              ✓ Terms and Conditions Accepted
            </span>
          )}
          <button type="button" className="auth-link-button" onClick={openTermsModal}>
            View Terms
          </button>
        </div>

        <button
          type="submit"
          className="auth-primary-button"
          disabled={
            isSubmitting
            || captcha.isLoading
            || !signupPasswordValidation.valid
            || signupPassword !== signupConfirmPassword
          }
        >
          {isSubmitting ? 'Creating Account...' : 'Signup'}
        </button>
      </form>

      {isTermsModalOpen && (
        <div className="auth-modal-overlay">
          <div ref={termsDialogRef} tabIndex={-1} className="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="terms-title">
            <div>
              <h3 id="terms-title">Terms and Conditions</h3>
              <p>Last updated {TERMS_LAST_UPDATED_LABEL}</p>
            </div>

            <div
              ref={termsContentRef}
              className="auth-terms-scroll"
              tabIndex={0}
              role="region"
              aria-label="Terms and conditions text"
              onScroll={handleTermsScroll}
            >
              {TERMS_SECTIONS.map((section) => (
                <section key={section.title}>
                  <h4>{section.title}</h4>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>

            <p className="auth-terms-scroll-hint" role="status">
              {hasReachedTermsBottom
                ? 'You reached the end of the Terms and Conditions.'
                : 'Scroll to the bottom of the Terms and Conditions to enable agreement.'}
            </p>

            <label className="auth-checkbox auth-modal-checkbox">
              <input
                type="checkbox"
                checked={hasCheckedTermsInModal}
                disabled={!hasReachedTermsBottom || isSubmitting}
                onChange={(event) => setHasCheckedTermsInModal(event.target.checked)}
              />
              <span>{TERMS_ACCEPTANCE_LABEL}</span>
            </label>

            <div className="auth-modal-actions">
              <button
                type="button"
                className="auth-secondary-button"
                onClick={closeTermsModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="auth-primary-button compact"
                onClick={handleAcceptTerms}
                disabled={!hasReachedTermsBottom || !hasCheckedTermsInModal || isSubmitting}
              >
                Agree and Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderVerify = () => (
    <div className="auth-verify-content">
      <div className="auth-verify-illustration" aria-hidden="true">
        <span className="auth-verify-spark auth-verify-spark-left" />
        <span className="auth-verify-spark auth-verify-spark-right" />
        <div className="auth-verify-cloud">
          <div className="auth-verify-envelope">
            <Mail size={66} strokeWidth={1.6} />
            <span><Link2 size={24} strokeWidth={2.5} /></span>
          </div>
        </div>
      </div>

      <div className="auth-verify-intro">
        <h1>{title}</h1>
        <p>We’ve sent you a verification link to</p>
        <strong>{pendingVerification.email || 'your email address'}</strong>
        <p className="auth-verify-support">
          Please check your inbox and click the verification link to confirm your account and continue.
        </p>
      </div>

      <div className="auth-verify-success" role="status">
        <CheckCircle2 size={26} strokeWidth={2.5} />
        <div>
          <strong>Link sent successfully!</strong>
          <p>Please check your inbox (and spam folder) for the verification link. Click the link to confirm your account and continue.</p>
        </div>
      </div>

      <div className="auth-verify-resend-copy">
        <span className="auth-verify-mail-badge" aria-hidden="true"><Mail size={21} /></span>
        <div>
          <h2>Didn’t receive the email?</h2>
          <p>Make sure to check your spam or junk folder. You can also resend the link if needed.</p>
        </div>
      </div>

      <button
        type="button"
        className="auth-primary-button auth-verify-resend-button"
        onClick={handleResendSignupLink}
        disabled={isSubmitting || resendCooldown > 0}
      >
        <RefreshCw size={17} className={isSubmitting ? 'auth-verify-spinning' : ''} />
        {isSubmitting ? 'Sending Link…' : 'Resend Verification Link'}
      </button>
      <p className="auth-verify-countdown" aria-live="polite">
        {resendCooldown > 0
          ? `You can request a new link in ${resendCooldown}s.`
          : 'You can request a new link now.'}
      </p>
      <button type="button" className="auth-verify-back-button" onClick={() => switchView('login')}>
        Back to Sign In
      </button>
    </div>
  );

  const renderForgot = () => (
    <form className="auth-form" onSubmit={forgotStep === 'verify' ? handleVerifyRecovery : handleForgotPassword}>
      <div className="auth-field">
        <label htmlFor="forgotIdentifier">Email or Username</label>
        <div className="auth-input-shell">
          <Mail size={18} />
          <input
            id="forgotIdentifier"
            type="text"
            value={forgotIdentifier}
            onChange={(event) => setForgotIdentifier(event.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
      </div>

      {isRecoveryCodeMode && forgotStep === 'verify' && (
        <div className="auth-field">
          <label htmlFor="recoveryCode">Reset Code</label>
          <input
            id="recoveryCode"
            className="auth-code-input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="123456"
            required
          />
        </div>
      )}

      <button type="submit" className="auth-primary-button" disabled={isSubmitting}>
        {isSubmitting
          ? 'Working...'
          : (forgotStep === 'verify'
            ? 'Verify Reset Code'
            : (isRecoveryCodeMode ? 'Send Reset Code' : 'Send Reset Email'))}
      </button>
      <button type="button" className="auth-link-button centered" onClick={() => switchView('login')}>
        Back to Login
      </button>
    </form>
  );

  const renderReset = () => (
    <form className="auth-form" onSubmit={handleResetPassword}>
      <PasswordField
        id="resetPassword"
        label="New Password"
        value={resetPassword}
        onChange={(event) => setResetPassword(event.target.value)}
        showPassword={showResetPassword}
        onToggle={() => setShowResetPassword((current) => !current)}
        placeholder="Enter new password"
        autoComplete="new-password"
      />
      <PasswordRequirements password={resetPassword} />

      <PasswordField
        id="resetConfirmPassword"
        label="Confirm New Password"
        value={resetConfirmPassword}
        onChange={(event) => setResetConfirmPassword(event.target.value)}
        showPassword={showResetConfirmPassword}
        onToggle={() => setShowResetConfirmPassword((current) => !current)}
        placeholder="Confirm new password"
        autoComplete="new-password"
      />

      <button
        type="submit"
        className="auth-primary-button"
        disabled={isSubmitting || !resetPasswordValidation.valid || resetPassword !== resetConfirmPassword}
      >
        {isSubmitting ? 'Saving...' : 'Save New Password'}
      </button>
    </form>
  );

  const title = {
    login: 'Login',
    signup: 'Signup',
    verify: 'Check Your Email',
    forgot: 'Forgot Password',
    reset: 'Set New Password',
  }[activeView] || 'Login';

  const subtitle = {
    login: 'Welcome back to V&G.',
    signup: 'Create your customer account.',
    verify: 'Check your inbox.',
    forgot: 'Recover account access.',
    reset: 'Choose a new password for your account.',
  }[activeView] || '';

  return (
    <div className={`auth-page${activeView === 'verify' ? ' auth-page-verification' : ''}`}>
      <section className={`auth-panel${activeView === 'verify' ? ' auth-panel-verification' : ''}`}>
        {activeView !== 'verify' && (
          <div className="auth-panel-head">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        )}

        {!['verify', 'forgot', 'reset'].includes(activeView) && (
          <div className="auth-mode-tabs" role="group" aria-label="Authentication mode">
            <button
              type="button"
              className={activeView === 'login' ? 'active' : ''}
              aria-pressed={activeView === 'login'}
              onClick={() => switchView('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={activeView === 'signup' ? 'active' : ''}
              aria-pressed={activeView === 'signup'}
              onClick={() => switchView('signup')}
            >
              Signup
            </button>
          </div>
        )}

        <AuthAlert message={alert.message} type={alert.type} />

        {activeView === 'login' && renderLogin()}
        {activeView === 'signup' && renderSignup()}
        {activeView === 'verify' && renderVerify()}
        {activeView === 'forgot' && renderForgot()}
        {activeView === 'reset' && renderReset()}
      </section>
    </div>
  );
};

export default Login;
