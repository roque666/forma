import Link from 'next/link';
import { Alert } from '@/components/ui/feedback';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { resetPasswordAction } from '@/lib/auth/actions';

export const metadata = { title: 'Nova palavra-passe' };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <>
        <Alert tone="error">Link inválido. Pede um novo link de recuperação.</Alert>
        <p className="mt-6 text-center text-sm"><Link href="/forgot-password" className="font-semibold text-accent-text hover:underline">Recuperar palavra-passe</Link></p>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold">Nova palavra-passe</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Escolhe uma palavra-passe nova. Vais precisar de entrar novamente em todos os dispositivos.</p>
      <ActionForm action={resetPasswordAction}>
        <input type="hidden" name="token" value={token} />
        <TextField label="Nova palavra-passe" name="newPassword" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, com letras e números." required />
        <TextField label="Confirmar palavra-passe" name="confirm" type="password" autoComplete="new-password" required />
        <SubmitButton size="lg" className="w-full" pendingLabel="A guardar…">Guardar palavra-passe</SubmitButton>
      </ActionForm>
    </>
  );
}
