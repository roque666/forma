import { requireUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { myCoach, myPendingInvites } from '@/lib/services/coach';
import { acceptInviteAction, endLinkAction } from '@/lib/actions/coach';
import { updateProfileAction } from '@/lib/actions/profile';
import { changePasswordAction, deleteAccountAction, logoutAction } from '@/lib/auth/actions';
import { Avatar } from '@/components/ui/avatar';
import { Card, CardTitle, PageHeader } from '@/components/ui/card';
import { ActionForm, SelectField, SubmitButton, TextField } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { Badge } from '@/components/ui/feedback';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { formatDatePt, isoToLocalDate } from '@/lib/dates';

export const metadata = { title: 'Perfil' };

const ZONES = ['Europe/Lisbon', 'Atlantic/Azores', 'Atlantic/Madeira', 'Europe/Madrid', 'Europe/London', 'Europe/Paris', 'America/Sao_Paulo', 'America/New_York', 'Africa/Luanda', 'Africa/Maputo'];

export default async function ProfilePage() {
  const user = await requireUser();
  const d = user.role === 'student'
    ? await withUser(user.id, async (db) => ({ invites: await myPendingInvites(db), coach: await myCoach(db, user.id) }))
    : { invites: [], coach: null };
  const zones = ZONES.includes(user.timezone) ? ZONES : [user.timezone, ...ZONES];
  return (
    <>
      <PageHeader title="Perfil" />
      <div className="grid max-w-4xl gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-4"><Avatar name={user.fullName} src={user.avatarUrl} size={56} />
            <div className="min-w-0 flex-1"><p className="truncate text-lg font-bold">{user.fullName}</p><p className="truncate text-sm text-muted">{user.email}</p><Badge className="mt-1" tone="accent">{user.role === 'coach' ? 'Coach' : 'Atleta'}</Badge></div>
            <ThemeToggle /></div>
        </Card>
        <Card><CardTitle>Dados pessoais</CardTitle>
          <ActionForm action={updateProfileAction}>
            <TextField label="Nome" name="fullName" defaultValue={user.fullName} required maxLength={80} />
            <SelectField label="Fuso horário" name="timezone" defaultValue={user.timezone}>{zones.map((z) => <option key={z} value={z}>{z}</option>)}</SelectField>
            <SubmitButton size="md">Guardar</SubmitButton>
          </ActionForm></Card>
        <Card><CardTitle>Alterar palavra-passe</CardTitle>
          <ActionForm action={changePasswordAction} resetOnSuccess>
            <TextField label="Palavra-passe atual" name="currentPassword" type="password" autoComplete="current-password" required />
            <TextField label="Nova palavra-passe" name="newPassword" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, com letras e números." required />
            <TextField label="Confirmar" name="confirm" type="password" autoComplete="new-password" required />
            <SubmitButton size="md" variant="secondary">Alterar</SubmitButton>
          </ActionForm></Card>
        {user.role === 'student' && (
          <Card className="lg:col-span-2"><CardTitle>O meu coach</CardTitle>
            {d.invites.length > 0 && (
              <ul className="mb-4 space-y-2">{d.invites.map((i) => (
                <li key={i.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-accent/10 p-3 text-sm"><span><strong>{i.coachName}</strong> convidou-te para seres acompanhado. Ao aceitar, partilhas treinos, nutrição e peso com este coach.</span>
                  <span className="flex gap-2"><form action={acceptInviteAction}><input type="hidden" name="id" value={i.linkId} /><Button type="submit" size="sm">Aceitar</Button></form>
                    <form action={endLinkAction}><input type="hidden" name="id" value={i.linkId} /><Button type="submit" size="sm" variant="outline">Recusar</Button></form></span></li>))}</ul>)}
            {d.coach ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>Acompanhado por <strong>{d.coach.coachName}</strong> desde {formatDatePt(isoToLocalDate(d.coach.since, user.timezone), { day: 'numeric', month: 'long', year: 'numeric' })}. Ele vê os teus treinos, refeições e peso, mas não pode apagar o teu histórico.</span>
                <form action={endLinkAction}><input type="hidden" name="id" value={d.coach.linkId} /><ConfirmSubmit confirmLabel="Terminar acompanhamento?">Terminar acompanhamento</ConfirmSubmit></form></div>
            ) : d.invites.length === 0 && <p className="text-sm text-muted">Não tens coach associado. Se um coach te convidar (com o email desta conta), o convite aparece aqui.</p>}
          </Card>)}
        <Card className="lg:col-span-2"><form action={logoutAction}><Button type="submit" variant="outline">Terminar sessão</Button></form></Card>
        <Card className="border-danger/30 lg:col-span-2"><CardTitle>Eliminar conta</CardTitle>
          <p className="mb-3 text-sm text-muted">Apaga a tua conta e todos os teus dados de forma permanente. Não pode ser desfeito.</p>
          <ActionForm action={deleteAccountAction}>
            <div className="grid gap-3 sm:grid-cols-2"><TextField label="Palavra-passe" name="password" type="password" autoComplete="current-password" required /><TextField label="Escreve ELIMINAR" name="confirm" autoComplete="off" required /></div>
            <SubmitButton variant="danger" size="md">Eliminar a minha conta</SubmitButton>
          </ActionForm></Card>
      </div>
    </>
  );
}
