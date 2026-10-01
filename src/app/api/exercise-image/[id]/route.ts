import { getSessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db/pool';
import { uuid } from '@/lib/validation/common';

/** Devolve a imagem de um exercício. A RLS decide quem a pode ver (o mesmo critério do exercício). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response('Não autenticado', { status: 401 });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return new Response('Não encontrado', { status: 404 });
  const row = await withUser(user.id, (db) => db.one<{ mime: string; data: Buffer }>('select mime, data from public.exercise_images where exercise_id = $1', [id]));
  if (!row) return new Response('Não encontrado', { status: 404 });
  return new Response(new Uint8Array(row.data), {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'private, max-age=31536000, immutable', // o URL muda (?v=) quando a imagem muda
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
