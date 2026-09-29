import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Alert } from '@/components/ui/feedback';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { loginAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/auth/session';

export const metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string; deleted?: string }> }) {
  if (await getSessionUser()) redirect('/dashboard');
  const sp = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold">Entrar</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Bem-vindo de volta. Vamos treinar?</p>
      {sp.reset && <Alert tone="success" className="mb-4">Palavra-passe redefinida. Já podes entrar.</Alert>}
      {sp.deleted && <Alert tone="success" className="mb-4">A tua conta e os teus dados foram eliminados.</Alert>}
      <ActionForm action={loginAction}>
        <input type="hidden" name="next" value={sp.next ?? ''} />
        <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <TextField label="Palavra-passe" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton size="lg" className="w-full" pendingLabel="A entrar…">Entrar</SubmitButton>
      </ActionForm>
      <div className="mt-6 flex flex-col items-center gap-2 text-sm text-muted">
        <Link href="/forgot-password" className="hover:text-fg hover:underline">Esqueci-me da palavra-passe</Link>
        <span>Ainda não tens conta? <Link href="/register" className="font-semibold text-accent-text hover:underline">Criar conta</Link></span>
      </div>
    </>
  );
}
