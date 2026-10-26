import * as AlertDialog from '@radix-ui/react-alert-dialog';

import styles from './AlertDialog.module.css';
import { withClass } from './util';

export * from '@radix-ui/react-alert-dialog';

export const Overlay = withClass(AlertDialog.Overlay, styles['AlertDialogOverlay']!);

export const Content = withClass(AlertDialog.Content, styles['AlertDialogContent']!);

export const Title = withClass(AlertDialog.Title, styles['AlertDialogTitle']!);

export const Description = withClass(AlertDialog.Description, styles['AlertDialogDescription']!);

/** For Content: a short message's text is centred. */
export const messageClassName = styles['message']!;

// eslint-disable-next-line react/jsx-props-no-spreading
export const Portal = (props: AlertDialog.AlertDialogPortalProps) => <AlertDialog.Portal container={document.getElementById('app-root')!} {...props} />;
