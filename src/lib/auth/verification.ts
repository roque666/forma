import 'server-only';
import { randomBytes } from 'node:crypto';
import { withAdmin } from '../db/pool';
import { mailLayout, sendMail } from '../mailer';
import { hashToken } from './session';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

/** Cria um link de confirmação (48 h) e envia o email. Devolve false se o email não seguiu. */
export async function sendVerificationEmail(user: { id: string; email: string; fullName: string }, opts: { welcome?: boolean } = {}): Promise<boolean> {
  const token = randomBytes(32).toString('base64url');
  await withAdmin((db) => db.exec(`insert into private.email_verifications (token_hash, user_id, expires_at) values ($1, $2, now() + interval '48 hours')`, [hashToken(token), user.id]));
  const first = user.fullName.split(' ')[0] || 'olá';
  const m = mailLayout({
    title: opts.welcome ? `Bem-vindo à Forma, ${first}!` : 'Confirma o teu email',
    paragraphs: opts.welcome
      ? ['A tua conta está pronta: já podes registar treinos, refeições e peso.', 'Confirma o teu email para recebermos a certeza de que és tu (podes continuar a usar a app entretanto).']
      : ['Clica no botão para confirmar o teu email.'],
    button: { label: 'Confirmar email', url: `${appUrl()}/verify-email?token=${token}` },
    footer: 'O link expira em 48 horas. Se não criaste esta conta, ignora este email.',
  });
  return sendMail({ to: user.email, subject: opts.welcome ? 'Bem-vindo à Forma — confirma o teu email' : 'Confirma o teu email na Forma', text: m.text, html: m.html });
}
