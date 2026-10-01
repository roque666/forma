'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { createStudentAction, inviteStudentAction, saveThresholdsAction } from '@/lib/actions/coach';
import { ActionForm, NumberField, SubmitButton, TextField, restoreForm } from '@/components/ui/form';
import { Alert } from '@/components/ui/feedback';
import { Button } from '@/components/ui/button';
import { inputCls } from '@/components/ui/styles';
import type { FollowUpThresholds } from '@/lib/coach/followup';

export function InviteForm() {
  return (
    <ActionForm action={inviteStudentAction} resetOnSuccess>
      <TextField label="Email do atleta" name="email" type="email" autoComplete="off" required placeholder="atleta@email.com" />
      <SubmitButton size="md" pendingLabel="A enviar…">Enviar convite</SubmitButton>
      <p className="text-xs text-muted">O atleta vê o convite no perfil e só depois de aceitar é que partilhas dados. Se ainda não tiver conta, pode criá-la com este email.</p>
    </ActionForm>
  );
}

export function CreateStudentForm() {
  const lastFd = useRef<FormData | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: Awaited<ReturnType<typeof createStudentAction>> | null, fd: FormData) => { lastFd.current = fd; return createStudentAction(prev, fd); }, null);
  useEffect(() => { if (state && !state.ok) queueMicrotask(() => restoreForm(formRef.current, lastFd.current)); }, [state]);
  const [copied, setCopied] = useState(false);
  const created = state?.ok ? (state.data as { email: string; tempPassword: string }) : null;
  if (created)
    return (
      <div className="space-y-3">
        <Alert tone="success">Conta criada para <strong>{created.email}</strong>. Entrega esta palavra-passe temporária ao atleta — só é mostrada agora.</Alert>
        <div className="flex items-center gap-2"><code className="flex-1 rounded-xl bg-surface2 px-4 py-3 text-lg font-bold tracking-wider" data-testid="temp-password">{created.tempPassword}</code>
          <Button type="button" variant="outline" size="icon" aria-label="Copiar" onClick={() => { navigator.clipboard?.writeText(created.tempPassword); setCopied(true); }}><Copy className="h-4 w-4" /></Button></div>
        {copied && <p className="text-xs text-ok">Copiado.</p>}
        <p className="text-xs text-muted">No primeiro login o atleta tem de escolher uma palavra-passe nova.</p>
        <a href="/students" className="text-sm font-semibold text-accent-text">Criar outra conta</a>
      </div>
    );
  const fe = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <label className="block space-y-1.5"><span className="text-sm font-medium">Nome</span><input name="fullName" required maxLength={100} className={inputCls} />{fe.fullName && <span className="text-xs text-danger">{fe.fullName}</span>}</label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Email</span><input name="email" type="email" required className={inputCls} />{fe.email && <span className="text-xs text-danger">{fe.email}</span>}</label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1 h-4 w-4" /> <span>Confirmo que o atleta autorizou a partilha dos seus dados de treino, nutrição e peso comigo.</span></label>
      {fe.consent && <p className="text-xs text-danger">{fe.consent}</p>}
      <SubmitButton size="md" pendingLabel="A criar…">Criar conta do atleta</SubmitButton>
    </form>
  );
}

export function ThresholdsForm({ t }: { t: FollowUpThresholds }) {
  return (
    <ActionForm action={saveThresholdsAction} className="grid grid-cols-2 gap-3 space-y-0">
      <NumberField label="Alerta de treino (dias)" name="workoutAlertDays" defaultValue={t.workoutAlertDays} />
      <NumberField label="Alerta de refeições (dias)" name="mealAlertDays" defaultValue={t.mealAlertDays} />
      <NumberField label="Alerta de pesagem (dias)" name="weighInAlertDays" defaultValue={t.weighInAlertDays} />
      <NumberField label="Inativo após (dias)" name="inactiveDays" defaultValue={t.inactiveDays} />
      <div className="col-span-2"><SubmitButton size="md" variant="secondary">Guardar limites</SubmitButton></div>
    </ActionForm>
  );
}
