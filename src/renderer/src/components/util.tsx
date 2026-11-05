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
 * As a dialog's content starts to fade out, focus goes back to the page: while it fades it's still there, and a key
 * (Space, Enter) would otherwise go to the button just clicked in it, or be kept from the app's shortcuts. Radix moves
 * focus back to what opened it once the dialog is gone. (Without an animation, Reduce motion, it's gone at once.)
 */
export function releaseFocusWhenClosing(event: React.AnimationEvent<HTMLElement>) {
  const content = event.currentTarget;
  if (event.target !== content || content.dataset['state'] !== 'closed') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && content.contains(active)) active.blur();
}
