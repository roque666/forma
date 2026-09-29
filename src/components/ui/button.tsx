import Link from 'next/link';
import { cn } from './cn';
import type { ComponentProps } from 'react';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none';
const variants = {
  primary: 'bg-accent text-accent-fg hover:brightness-95 shadow-sm',
  secondary: 'bg-surface2 text-fg hover:bg-line',
  outline: 'border border-line bg-surface text-fg hover:bg-surface2',
  ghost: 'text-muted hover:bg-surface2 hover:text-fg',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20',
} as const;
const sizes = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
  icon: 'h-11 w-11',
} as const;

export type ButtonStyle = { variant?: keyof typeof variants; size?: keyof typeof sizes; className?: string };
export const buttonClass = ({ variant = 'primary', size = 'md', className }: ButtonStyle = {}) => cn(base, variants[variant], sizes[size], className);

export function Button({ variant, size, className, ...props }: ComponentProps<'button'> & ButtonStyle) {
  return <button {...props} className={buttonClass({ variant, size, className })} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & ButtonStyle) {
  return <Link {...props} className={buttonClass({ variant, size, className })} />;
}
