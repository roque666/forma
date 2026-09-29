'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonStyle } from './button';

/** Botão de submit com confirmação em dois toques (sem diálogos nativos do browser). */
export function ConfirmSubmit({ children, confirmLabel = 'Confirmar?', variant = 'danger', size = 'sm', className, ...rest }: { children: React.ReactNode; confirmLabel?: string } & ButtonStyle & Omit<ComponentProps<'button'>, 'className' | 'type'>) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Button
      {...rest}
      type={armed ? 'submit' : 'button'}
      variant={armed ? 'danger' : variant}
      size={size}
      className={className}
      disabled={pending || rest.disabled}
      onClick={(e) => { if (!armed) { e.preventDefault(); setArmed(true); } }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
