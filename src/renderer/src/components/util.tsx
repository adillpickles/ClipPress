import React from 'react';


export function withClass<P extends { className?: string | undefined }>(Component: React.ForwardRefExoticComponent<P>, cls: string) {
  // eslint-disable-next-line react/display-name,@typescript-eslint/no-explicit-any
  return React.forwardRef<React.ForwardRefExoticComponent<P>, P>((props, ref) => {
    const { className, ...rest } = props ?? {};
    // @ts-expect-error dunno how to type this
    // eslint-disable-next-line react/jsx-props-no-spreading
    return <Component ref={ref} className={[cls, className].filter(Boolean).join(' ')} {...rest} />;
  });
}

/**
 * A dialog's content as its open or close animation starts. Closing, focus goes back to the page: while it fades it's
 * still there, and a key (Space, Enter) would otherwise go to the button just clicked in it, or be kept from the app's
 * shortcuts (Radix then focuses the dialog's trigger, when it has one). Opened again before it had gone, it takes focus
 * back, as Radix doesn't focus a dialog it never removed. (Without an animation, Reduce motion, neither happens.)
 */
export function moveFocusWithDialogAnimation(event: React.AnimationEvent<HTMLElement>) {
  const content = event.currentTarget;
  if (event.target !== content) return;
  const active = document.activeElement;
  if (content.dataset['state'] === 'closed') {
    if (active instanceof HTMLElement && content.contains(active)) active.blur();
  } else if (content.dataset['state'] === 'open' && (active == null || active === document.body)) {
    content.focus({ preventScroll: true });
  }
}
