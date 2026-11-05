import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { forwardRef } from 'react';

import styles from './AlertDialog.module.css';
import { moveFocusWithDialogAnimation, withClass } from './util';

export * from '@radix-ui/react-alert-dialog';

export const Overlay = withClass(AlertDialog.Overlay, styles['AlertDialogOverlay']!);

export const Content = forwardRef<HTMLDivElement, AlertDialog.AlertDialogContentProps>(({ className, onAnimationStart, ...props }, ref) => (
  <AlertDialog.Content
    ref={ref}
    className={[styles['AlertDialogContent'], className].filter(Boolean).join(' ')}
    onAnimationStart={(e) => {
      moveFocusWithDialogAnimation(e);
      onAnimationStart?.(e);
    }}
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  />
));
Content.displayName = 'AlertDialogContent';

export const Title = withClass(AlertDialog.Title, styles['AlertDialogTitle']!);

export const Description = withClass(AlertDialog.Description, styles['AlertDialogDescription']!);

/** For Content: a short message's text is centred. */
export const messageClassName = styles['message']!;

// eslint-disable-next-line react/jsx-props-no-spreading
export const Portal = (props: AlertDialog.AlertDialogPortalProps) => <AlertDialog.Portal container={document.getElementById('app-root')!} {...props} />;
