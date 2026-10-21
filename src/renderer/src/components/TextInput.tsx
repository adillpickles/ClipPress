import { forwardRef } from 'react';

import styles from './TextInput.module.css';

// eslint-disable-next-line react/display-name
const TextInput = forwardRef<HTMLInputElement, JSX.IntrinsicElements['input']>(({ className, ...props }, forwardedRef) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <input type="text" ref={forwardedRef} className={[styles['input'], ...(className ? [className] : [])].join(' ')} {...props} />
));

export default TextInput;
