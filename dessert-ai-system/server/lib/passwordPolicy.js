export const PASSWORD_POLICY_MESSAGE = 'Password must be 8-20 characters long and include at least one uppercase letter, one lowercase letter, one number, and one special character.';

export const validatePasswordPolicy = (password = '') => {
  const value = String(password ?? '');

  if (
    value.length < 8
    || value.length > 20
    || !/[A-Z]/.test(value)
    || !/[a-z]/.test(value)
    || !/[0-9]/.test(value)
    || !/[!@#$%^&*]/.test(value)
  ) {
    return {
      valid: false,
      message: PASSWORD_POLICY_MESSAGE,
    };
  }

  return {
    valid: true,
    message: '',
  };
};
