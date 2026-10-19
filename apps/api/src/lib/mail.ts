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

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(brand: string, color: string, body: string, button: { label: string; url: string }, footer: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:520px;background:#fff;border-radius:12px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:20px;font-weight:bold;color:${color};padding-bottom:16px">${esc(brand)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="padding:24px 0"><a href="${button.url}" style="background:${color};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:bold">${esc(button.label)}</a></td></tr>
<tr><td style="font-size:12px;color:#78716c;line-height:1.5">${footer}<br><br>Si el botón no funciona, copia este enlace en tu navegador:<br>${esc(button.url)}</td></tr>
</table></td></tr></table></body></html>`;
}

interface MailParams {
  to: string;
  name: string;
  brand: string;
  color: string;
  url: string;
}

export function invitationMail(p: MailParams): Mail {
  const body = `Hola ${esc(p.name)}:<br><br>Te damos la bienvenida a <b>${esc(p.brand)}</b>. Para activar tu cuenta, crea tu contraseña con el siguiente botón.`;
  return {
    to: p.to,
    subject: `Activa tu cuenta en ${p.brand}`,
    text: `Hola ${p.name}:\n\nTe damos la bienvenida a ${p.brand}. Para activar tu cuenta, crea tu contraseña aquí:\n${p.url}\n\nEste enlace vence en 7 días.`,
    html: layout(p.brand, p.color, body, { label: "Activar mi cuenta", url: p.url }, "Este enlace vence en 7 días."),
  };
}

export function resetPasswordMail(p: MailParams): Mail {
  const body = `Hola ${esc(p.name)}:<br><br>Recibimos una solicitud para restablecer tu contraseña en <b>${esc(p.brand)}</b>.`;
  return {
    to: p.to,
    subject: `Restablece tu contraseña de ${p.brand}`,
    text: `Hola ${p.name}:\n\nRecibimos una solicitud para restablecer tu contraseña. Hazlo aquí:\n${p.url}\n\nEste enlace vence en 1 hora. Si no lo solicitaste, ignora este correo.`,
    html: layout(
      p.brand,
      p.color,
      body,
      { label: "Crear nueva contraseña", url: p.url },
      "Este enlace vence en 1 hora. Si no lo solicitaste, ignora este correo.",
    ),
  };
}

/** To the client: confirms their deletion request was received (D52). */
export function deletionRequestedMail(p: MailParams): Mail {
  const body = `Hola ${esc(p.name)}:<br><br>Recibimos tu solicitud para eliminar tu cuenta en <b>${esc(p.brand)}</b> y todos tus datos. Tu consultora la procesará pronto; cuando lo haga, ya no podrás ingresar.<br><br>Si cambiaste de opinión, puedes cancelar la solicitud desde tu perfil.`;
  return {
    to: p.to,
    subject: `Recibimos tu solicitud de eliminación de cuenta`,
    text: `Hola ${p.name}:\n\nRecibimos tu solicitud para eliminar tu cuenta en ${p.brand} y todos tus datos. Tu consultora la procesará pronto.\n\nSi cambiaste de opinión, puedes cancelarla desde tu perfil:\n${p.url}`,
    html: layout(p.brand, p.color, body, { label: "Ir a mi perfil", url: p.url }, "Si no hiciste esta solicitud, ingresa y cancélala desde tu perfil."),
  };
}

/** To the admin(s): a client asked to delete their account (D52). */
export function deletionRequestAdminMail(p: MailParams & { clientName: string; clientEmail: string }): Mail {
  const body = `Hola ${esc(p.name)}:<br><br><b>${esc(p.clientName)}</b> (${esc(p.clientEmail)}) solicitó eliminar su cuenta y todos sus datos. Revisa la solicitud en su ficha.`;
  return {
    to: p.to,
    subject: `Solicitud de eliminación de cuenta: ${p.clientName}`,
    text: `Hola ${p.name}:\n\n${p.clientName} (${p.clientEmail}) solicitó eliminar su cuenta y todos sus datos. Revisa la solicitud aquí:\n${p.url}`,
    html: layout(p.brand, p.color, body, { label: "Ver ficha del cliente", url: p.url }, "Según la política de privacidad, debes atender la solicitud dentro de los plazos legales."),
  };
}
