import React from 'react';
import ButtonLoadingDots from './ButtonLoadingDots';
import './LoadingButton.css';

const LoadingButton = ({
  isLoading = false,
  className = '',
  contentClassName = 'inline-flex items-center justify-center gap-2',
  children,
  disabled,
  type = 'button',
  ...props
}) => (
  <button
    {...props}
    type={type}
    disabled={disabled || isLoading}
    aria-busy={isLoading}
    className={`loading-button ${className}`.trim()}
  >
    <span className={`loading-button-content ${contentClassName}`.trim()}>{children}</span>
    {isLoading && <span className="loading-button-indicator" aria-hidden="true"><ButtonLoadingDots /></span>}
  </button>
);

export default LoadingButton;
