import { Alert } from '@/components/ui/feedback';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { changePasswordAction } from '@/lib/auth/actions';
import { requireUser } from '@/lib/auth/session';

export const metadata = { title: 'Alterar palavra-passe' };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowMustChange: true });
  return (
    <>
      <h1 className="text-2xl font-bold">Define a tua palavra-passe</h1>
      {user.mustChangePassword && (
        <Alert tone="info" className="mt-3">O teu coach criou esta conta com uma palavra-passe temporária. Escolhe uma nova para continuar.</Alert>
      )}
      <ActionForm action={changePasswordAction} className="mt-6">
        <TextField label="Palavra-passe atual (temporária)" name="currentPassword" type="password" autoComplete="current-password" required />
        <TextField label="Nova palavra-passe" name="newPassword" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, com letras e números." required />
        <TextField label="Confirmar nova palavra-passe" name="confirm" type="password" autoComplete="new-password" required />
        <SubmitButton size="lg" className="w-full" pendingLabel="A guardar…">Guardar e continuar</SubmitButton>
      </ActionForm>
    </>
  );
}
