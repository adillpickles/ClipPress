import * as Dialog from '@radix-ui/react-dialog';
import { forwardRef } from 'react';
import type { ReactNode } from 'react';

import styles from './Dialog.module.css';
import { withClass } from './util';
import CloseButtonRaw from './CloseButton';
import { dialogButtonOrder } from '../util';

export * from '@radix-ui/react-dialog';

export const Overlay = withClass(Dialog.Overlay, styles['DialogOverlay']!);

// The app's menus (Menu.tsx) open outside a dialog's own elements: using one, e.g. a text field's Cut / Copy / Paste,
// isn't a click outside that closes the dialog.
const isInAppMenu = (target: EventTarget | null) => target instanceof Element && target.closest('[data-app-menu]') != null;

export const Content = forwardRef<HTMLDivElement, Dialog.DialogContentProps>(({ className, onPointerDownOutside, onFocusOutside, ...props }, ref) => (
  <Dialog.Content
    ref={ref}
    className={[styles['DialogContent'], className].filter(Boolean).join(' ')}
    onPointerDownOutside={(e) => {
      if (isInAppMenu(e.target)) e.preventDefault();
      onPointerDownOutside?.(e);
    }}
    onFocusOutside={(e) => {
      if (isInAppMenu(e.target)) e.preventDefault();
      onFocusOutside?.(e);
    }}
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  />
));
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

export function ButtonRow({ children }: { children: ReactNode }) {
  return (
    // Reversed on Windows (the main button first) by the row, not by text direction, which would turn a label such as
    // "Find it…" into "…Find it".
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '.5em', justifyContent: dialogButtonOrder === 'rtl' ? 'flex-start' : 'flex-end', marginTop: '1em', flexDirection: dialogButtonOrder === 'rtl' ? 'row-reverse' : 'row' }}>
      {children}
    </div>
  );
}
