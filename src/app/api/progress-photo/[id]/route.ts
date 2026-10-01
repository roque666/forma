import { getSessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { uuid } from '@/lib/validation/common';

/** Devolve uma foto de progresso (?size=thumb para a miniatura). A RLS decide quem a pode ver. Nunca em cache partilhado. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return new Response('Não encontrado', { status: 404 });
  const thumb = new URL(req.url).searchParams.get('size') === 'thumb';
  const row = await withUser(user.id, (db) =>
    db.one<{ mime: string; data: Buffer }>(thumb ? `select 'image/jpeg' as mime, thumb as data from public.progress_photos where id = $1` : 'select mime, data from public.progress_photos where id = $1', [id]));
  if (!row) return new Response('Não encontrado', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'private, no-store', // dados sensíveis: nunca ficam em cache
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
