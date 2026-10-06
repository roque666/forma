import Link from 'next/link';
import { withAdmin } from '@/lib/db/pool';
import { hashToken } from '@/lib/auth/session';
import { Alert } from '@/components/ui/feedback';

export const metadata = { title: 'Confirmar email' };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const ok = token && token.length <= 200
    ? await withAdmin(async (db) => {
        const row = await db.one<{ user_id: string }>(
          `update private.email_verifications set used_at = coalesce(used_at, now())
            where token_hash = $1 and expires_at > now() returning user_id`, [hashToken(token)]);
        if (!row) return false;
        await db.exec('update public.profiles set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [row.user_id]);
        return true;
      })
    : false;
  return (
    <>
      <h1 className="text-2xl font-bold">Confirmar email</h1>
      <div className="mt-4">{ok ? <Alert tone="success">Email confirmado. Obrigado!</Alert> : <Alert tone="error">Este link é inválido ou já expirou. Entra na app e pede um novo no teu perfil.</Alert>}</div>
      <p className="mt-6 text-center text-sm"><Link href="/dashboard" className="font-semibold text-accent-text hover:underline">Ir para a app</Link></p>
    </>
  );
}
