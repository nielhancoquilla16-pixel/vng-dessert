import { useEffect, useRef } from 'react';

// Keep keyboard navigation within an open dialog and return focus to its trigger.
// The dialog element should have tabIndex={-1}, role="dialog", and aria-modal="true".
export default function useDialogFocus({ isOpen, onClose, closeDisabled = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef({ onClose, closeDisabled });

  useEffect(() => {
    closeRef.current = { onClose, closeDisabled };
  }, [onClose, closeDisabled]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return undefined;

    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the container so opening a form does not immediately open a phone keyboard.
    dialog.focus({ preventScroll: true });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !closeRef.current.closeDisabled) {
        event.preventDefault();
        closeRef.current.onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const controls = Array.from(dialog.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]',
      )).filter((element) => (
        element.tabIndex >= 0
        && !element.disabled
        && element.getAttribute('aria-hidden') !== 'true'
        && element.getClientRects().length > 0
      ));
      const first = controls[0];
      const last = controls[controls.length - 1];
      const focused = document.activeElement;

      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (focused === first || focused === dialog || !dialog.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !dialog.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected && typeof trigger.focus === 'function') {
        trigger.focus({ preventScroll: true });
      }
    };
  }, [isOpen]);

  return dialogRef;
}
