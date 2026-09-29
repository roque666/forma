import 'server-only';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Interface de envio de email. Ainda não há fornecedor configurado: em desenvolvimento escreve no log
 * do servidor e em `.outbox/mail.jsonl`. Para produção, implementar aqui o envio (SMTP/Resend/SES...).
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.MAIL_PROVIDER_CONFIGURED) {
    console.warn('[mailer] Nenhum fornecedor de email configurado — email NÃO enviado:', mail.subject);
    return;
  }
  console.log(`[mailer:dev] para ${mail.to} — ${mail.subject}\n${mail.text}`);
  try {
    const dir = join(process.cwd(), '.outbox');
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, 'mail.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...mail }) + '\n');
  } catch {
    /* melhor esforço */
  }
}
