import 'server-only';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** versão HTML opcional (o texto simples vai sempre junto) */
  html?: string;
}

/** Há SMTP configurado? (SMTP_HOST, SMTP_USER e SMTP_PASS) */
export const mailConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: Transporter | null = null;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port, secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
  }
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Email simples e legível em qualquer cliente: título, parágrafos e um botão opcional. */
export function mailLayout(o: { title: string; paragraphs: string[]; button?: { label: string; url: string }; footer?: string }): { html: string; text: string } {
  const html = `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f6f6f2;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1c1c1a">
<div style="max-width:520px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e6e6df">
<p style="margin:0 0 4px;font-weight:700;letter-spacing:.04em;color:#4d7c0f">FORMA</p>
<h1 style="margin:0 0 16px;font-size:22px">${esc(o.title)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${esc(p)}</p>`).join('')}
${o.button ? `<p style="margin:22px 0"><a href="${esc(o.button.url)}" style="background:#a3e635;color:#1a2e05;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px;display:inline-block">${esc(o.button.label)}</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#6b6b63;word-break:break-all">Se o botão não funcionar, copia este link: ${esc(o.button.url)}</p>` : ''}
${o.footer ? `<p style="margin:18px 0 0;font-size:12px;color:#6b6b63">${esc(o.footer)}</p>` : ''}
</div></div></body></html>`;
  const text = [o.title, '', ...o.paragraphs, ...(o.button ? ['', `${o.button.label}: ${o.button.url}`] : []), ...(o.footer ? ['', o.footer] : [])].join('\n');
  return { html, text };
}

/**
 * Envia um email por SMTP (Gmail, Brevo, etc.; ver README). Nunca lança erro: devolve false se falhar,
 * para que um problema de email não bloqueie o registo ou a recuperação de palavra-passe.
 * Sem SMTP configurado, em desenvolvimento (ou com MAIL_OUTBOX=1, usado nos testes) escreve no log e em `.outbox/mail.jsonl`.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (mailConfigured()) {
    try {
      await getTransport().sendMail({
        from: process.env.MAIL_FROM || `Forma <${process.env.SMTP_USER}>`,
        to: mail.to, subject: mail.subject, text: mail.text, html: mail.html,
      });
      return true;
    } catch (e) {
      console.error('[mailer] falha ao enviar email:', mail.subject, (e as Error).message);
      return false;
    }
  }
  if (process.env.NODE_ENV === 'production' && process.env.MAIL_OUTBOX !== '1') {
    console.warn('[mailer] SMTP não configurado — email NÃO enviado:', mail.subject);
    return false;
  }
  console.log(`[mailer:dev] para ${mail.to} — ${mail.subject}\n${mail.text}`);
  try {
    const dir = join(process.cwd(), '.outbox');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'mail.jsonl'), JSON.stringify({ at: new Date().toISOString(), to: mail.to, subject: mail.subject, text: mail.text }) + '\n');
  } catch { /* melhor esforço */ }
  return true;
}
