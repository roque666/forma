import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ActionForm, SubmitButton, TextField } from '@/components/ui/form';
import { registerAction } from '@/lib/auth/actions';
import { getSessionUser } from '@/lib/auth/session';

export const metadata = { title: 'Criar conta' };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect('/dashboard');
  return (
    <>
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Regista treinos, refeições e evolução num só lugar.</p>
      <ActionForm action={registerAction}>
        <TextField label="Nome" name="fullName" autoComplete="name" required />
        <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <TextField label="Palavra-passe" name="password" type="password" autoComplete="new-password" hint="Mínimo 10 caracteres, com letras e números." required />
        <details className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-muted">Sou coach / personal trainer</summary>
          <div className="pt-3">
            <TextField label="Código de coach" name="coachCode" autoComplete="off" hint="Fornecido pelo administrador da plataforma." />
          </div>
        </details>
        <details className="rounded-xl border border-line px-3.5 py-2.5 text-sm">
          <summary className="cursor-pointer font-medium text-muted">Sou fisioterapeuta</summary>
          <div className="pt-3">
            <TextField label="Código de fisioterapeuta" name="physioCode" autoComplete="off" hint="Fornecido pelo administrador da plataforma." />
          </div>
        </details>
        <SubmitButton size="lg" className="w-full" pendingLabel="A criar conta…">Criar conta</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Já tens conta? <Link href="/login" className="font-semibold text-accent-text hover:underline">Entrar</Link>
      </p>
    </>
  );
}
