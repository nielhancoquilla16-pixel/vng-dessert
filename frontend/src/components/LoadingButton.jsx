import React from 'react';
import ButtonLoadingDots from './ButtonLoadingDots';

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
    className={className}
  >
    {isLoading ? (
      <span className="relative inline-flex items-center justify-center">
        <span className={`${contentClassName} opacity-0`} aria-hidden="true">
          {children}
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <ButtonLoadingDots />
        </span>
      </span>
    ) : (
      <span className={contentClassName}>{children}</span>
    )}
  </button>
);

export default LoadingButton;
