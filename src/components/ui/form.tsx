'use client';

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ComponentProps, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Loader2 } from 'lucide-react';
import type { ActionResult } from '@/lib/actions';
import { Alert } from './feedback';
import { Button, type ButtonStyle } from './button';
import { cn } from './cn';
import { useToast } from './toast';
import { inputCls } from './styles';

type State = ActionResult<any> | null;
const ErrorsCtx = createContext<Record<string, string>>({});


/**
 * O React 19 limpa os campos do formulário depois de cada Server Action, mesmo quando há erros de validação
 * (o utilizador perderia tudo o que escreveu). Repomos os valores submetidos, exceto palavras-passe.
 */
export function restoreForm(form: HTMLFormElement | null, fd: FormData | null) {
  if (!form || !fd) return;
  const setNative = (el: HTMLElement, proto: object, value: string, evt: string) => {
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event(evt, { bubbles: true }));
  };
  for (const el of Array.from(form.elements)) {
    const name = (el as HTMLInputElement).name;
    if (!name) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === 'password' || el.type === 'hidden' || el.type === 'submit' || el.type === 'file') continue;
      if (el.type === 'checkbox') { el.checked = fd.getAll(name).includes(el.value === 'on' ? 'on' : el.value); continue; }
      if (el.type === 'radio') { el.checked = fd.get(name) === el.value; continue; }
      const v = fd.get(name);
      if (typeof v === 'string' && el.value !== v) setNative(el, HTMLInputElement.prototype, v, 'input');
    } else if (el instanceof HTMLTextAreaElement) {
      const v = fd.get(name);
      if (typeof v === 'string' && el.value !== v) setNative(el, HTMLTextAreaElement.prototype, v, 'input');
    } else if (el instanceof HTMLSelectElement) {
      const v = fd.get(name);
      if (typeof v === 'string' && el.value !== v) setNative(el, HTMLSelectElement.prototype, v, 'change');
    }
  }
}

/** Formulário ligado a uma Server Action: mostra erro geral, erros por campo e mensagem de sucesso. */
export function ActionForm({
  action, children, className, resetOnSuccess = false, toastOnSuccess = true, onSuccess,
}: {
  action: (prev: State, fd: FormData) => Promise<State>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  toastOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const lastFd = useRef<FormData | null>(null);
  const [state, formAction] = useActionState(async (prev: State, fd: FormData) => { lastFd.current = fd; return action(prev, fd); }, null);
  const ref = useRef<HTMLFormElement>(null);
  const toast = useToast();
  useEffect(() => {
    if (state && !state.ok) queueMicrotask(() => restoreForm(ref.current, lastFd.current));
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      if (toastOnSuccess && state.message) toast.success(state.message);
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const fieldErrors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <ErrorsCtx.Provider value={fieldErrors}>
      <form ref={ref} action={formAction} className={cn('space-y-4', className)} noValidate>
        {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
        {children}
      </form>
    </ErrorsCtx.Provider>
  );
}

export function SubmitButton({ children, pendingLabel, ...style }: { children: ReactNode; pendingLabel?: string } & ButtonStyle & Omit<ComponentProps<'button'>, 'className'>) {
  const { pending } = useFormStatus();
  const { variant, size, className, ...rest } = style;
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || rest.disabled} {...rest}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

export function Field({ label, name, hint, className, children }: { label: string; name: string; hint?: ReactNode; className?: string; children: (p: { id: string; name: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode }) {
  const id = useId();
  const errors = useContext(ErrorsCtx);
  const error = errors[name];
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      {children({ id, name, 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-err` : undefined })}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

type InputProps = Omit<ComponentProps<'input'>, 'name'> & { label: string; name: string; hint?: ReactNode; wrapperClassName?: string };
export function TextField({ label, name, hint, wrapperClassName, className, ...props }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapperClassName}>
      {(a) => <input {...a} {...props} className={cn(inputCls, className)} />}
    </Field>
  );
}

export function NumberField({ label, name, hint, wrapperClassName, className, step = 'any', ...props }: InputProps) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapperClassName}>
      {(a) => <input {...a} {...props} type="text" inputMode="decimal" autoComplete="off" className={cn(inputCls, className)} />}
    </Field>
  );
}

export function SelectField({ label, name, hint, wrapperClassName, className, children, ...props }: Omit<ComponentProps<'select'>, 'name'> & { label: string; name: string; hint?: ReactNode; wrapperClassName?: string }) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapperClassName}>
      {(a) => <select {...a} {...props} className={cn(inputCls, 'appearance-none bg-[length:1rem] pr-9', className)}>{children}</select>}
    </Field>
  );
}

export function TextAreaField({ label, name, hint, wrapperClassName, className, ...props }: Omit<ComponentProps<'textarea'>, 'name'> & { label: string; name: string; hint?: ReactNode; wrapperClassName?: string }) {
  return (
    <Field label={label} name={name} hint={hint} className={wrapperClassName}>
      {(a) => <textarea rows={3} {...a} {...props} className={cn(inputCls, 'resize-y', className)} />}
    </Field>
  );
}
