import Link from 'next/link';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { requestPasswordResetAction } from '@/lib/auth/actions';

export const metadata = { title: 'Recuperar palavra-passe' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">Recuperar palavra-passe</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Indica o teu email e enviamos um link para definires uma nova.</p>
      <ActionForm action={requestPasswordResetAction}>
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <SubmitButton size="lg" className="w-full" pendingLabel="A enviar…">Enviar link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/login" className="text-muted hover:text-fg hover:underline">← Voltar a entrar</Link></p>
    </>
  );
}
