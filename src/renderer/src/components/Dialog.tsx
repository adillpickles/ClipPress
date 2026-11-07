import * as Dialog from '@radix-ui/react-dialog';
import { forwardRef, useRef } from 'react';
import type { ReactNode } from 'react';

import styles from './Dialog.module.css';
import { moveFocusWithDialogAnimation, withClass } from './util';
import CloseButtonRaw from './CloseButton';

export * from '@radix-ui/react-dialog';

export const Overlay = withClass(Dialog.Overlay, styles['DialogOverlay']!);

// The app's menus (Menu.tsx) open outside a dialog's own elements: using one, e.g. a text field's Cut / Copy / Paste,
// isn't a click outside that closes the dialog.
const isInAppMenu = (target: EventTarget | null) => target instanceof Element && target.closest('[data-app-menu]') != null;

export const Content = forwardRef<HTMLDivElement, Dialog.DialogContentProps>(({ className, onPointerDownOutside, onFocusOutside, onAnimationStart, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  // Radix gives focus back to a Dialog.Trigger on close, and most of the app's dialogs open from state, with none:
  // focus fell to the page. A control the keyboard was on (Tab, then Enter) gets it back, as with the export options;
  // after a click focus stays with the page, where Space plays.
  const returnFocusRef = useRef<HTMLElement>();
  return (
    <Dialog.Content
      ref={ref}
      onAnimationStart={(e) => {
        moveFocusWithDialogAnimation(e);
        onAnimationStart?.(e);
      }}
      className={[styles['DialogContent'], className].filter(Boolean).join(' ')}
      onPointerDownOutside={(e) => {
        if (isInAppMenu(e.target)) e.preventDefault();
        onPointerDownOutside?.(e);
      }}
      onFocusOutside={(e) => {
        if (isInAppMenu(e.target)) e.preventDefault();
        onFocusOutside?.(e);
      }}
      onOpenAutoFocus={(e) => {
        // Before the dialog takes focus: what had it.
        const { activeElement } = document;
        returnFocusRef.current = activeElement instanceof HTMLElement && activeElement !== document.body && activeElement.matches(':focus-visible') ? activeElement : undefined;
        onOpenAutoFocus?.(e);
      }}
      onCloseAutoFocus={(e) => {
        onCloseAutoFocus?.(e);
        const returnTo = returnFocusRef.current;
        returnFocusRef.current = undefined;
        if (e.defaultPrevented || returnTo == null || !returnTo.isConnected) return;
        e.preventDefault();
        returnTo.focus({ preventScroll: true });
      }}
      // eslint-disable-next-line react/jsx-props-no-spreading
      {...props}
    />
  );
});
Content.displayName = 'DialogContent';

export const Description = withClass(Dialog.Description, styles['DialogDescription']!);

export const Title = withClass(Dialog.Title, styles['DialogTitle']!);

// eslint-disable-next-line react/jsx-props-no-spreading
export const Portal = (props: Dialog.DialogPortalProps) => <Dialog.Portal container={document.getElementById('app-root')!} {...props} />;

export const CloseButton = () => (
  <Dialog.Close asChild>
    <CloseButtonRaw style={{ top: 0, right: 0 }} />
  </Dialog.Close>
);

/**
 * A dialog's buttons in their written order, the main (blue) one last: bottom right in a dialog of settings, centred
 * under a short message's centred text (`center`).
 */
export function ButtonRow({ children, center = false }: { children: ReactNode, center?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.5em', justifyContent: center ? 'center' : 'flex-end', marginTop: '1em' }}>
      {children}
    </div>
  );
}
