import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { env } from "./env.js";

// Email bodies are customer-facing, so their text is in Spanish.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** In-memory outbox used by tests (MAIL_TRANSPORT=memory). */
export const outbox: Mail[] = [];

let ses: SESv2Client | null = null;

export async function sendMail(mail: Mail): Promise<void> {
  if (env.MAIL_TRANSPORT === "memory") {
    outbox.push(mail);
    return;
  }
  if (env.MAIL_TRANSPORT === "console") {
    console.log(`\n✉️  To: ${mail.to}\n   Subject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  ses ??= new SESv2Client({ region: env.AWS_REGION });
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: env.MAIL_FROM,
      Destination: { ToAddresses: [mail.to] },
      Content: {
        Simple: {
          Subject: { Data: mail.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: mail.text, Charset: "UTF-8" },
            Html: { Data: mail.html, Charset: "UTF-8" },
          },
        },
      },
    }),
  );
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Fixed email layout (D58): brand header, body, button and the fallback link.
 * Only the subject, body text and button label are editable by tenants.
 */
export function layout(brand: string, color: string, bodyHtml: string, button: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:bold;color:${color};padding-bottom:16px">${esc(brand)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:24px 0"><a href="${esc(button.url)}" style="background:${color};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#78716c;line-height:1.5">Si el botón no funciona, copia este enlace en tu navegador:<br>${esc(button.url)}</td></tr>
</table></td></tr></table></body></html>`;
}
