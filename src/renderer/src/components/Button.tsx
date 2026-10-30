import type { ButtonHTMLAttributes, DetailedHTMLProps } from 'react';
import { forwardRef } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
  variant?: ButtonVariant | undefined,
  size?: ButtonSize | undefined,
};

// eslint-disable-next-line react/display-name
const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ type = 'button', className, variant = 'default', size = 'md', ...props }, ref) => (
  <button
    ref={ref}
    className={[
      ...(className ? [className] : []),
      styles['button'],
      ...(variant !== 'default' ? [styles[variant]] : []),
      ...(size !== 'md' ? [styles[size]] : []),
    ].join(' ')}
    // eslint-disable-next-line react/button-has-type
    type={type}
    // eslint-disable-next-line react/jsx-props-no-spreading
    {...props}
  />
));

export default Button;

// eslint-disable-next-line react/display-name
export const DialogButton = forwardRef<HTMLButtonElement, { primary?: boolean } & ButtonProps>(({ primary, style, ...props }, ref) => (
  // eslint-disable-next-line react/jsx-props-no-spreading
  <Button ref={ref} variant={primary ? 'primary' : undefined} style={{ padding: '0 1.4em', minWidth: '6em', ...style }} {...props} />
));
