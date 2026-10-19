import { Router } from "express";
import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_KEYS, emailTemplateSchema, type EmailTemplateDTO, type EmailTemplateKey } from "@gradual/shared";
import { HttpError, parse } from "../lib/util.js";
import { requireRole } from "../middleware/context.js";
import { getBranding } from "../lib/branding.js";
import { sendMail } from "../lib/mail.js";
import { appUrl, loadOverrides, renderMail, saveOverrides, unknownVariables } from "../lib/email-templates.js";

/** Tenant admins edit their own email templates (D57–D59). */
export const adminEmailsRouter = Router();
adminEmailsRouter.use(requireRole("admin"));

function keyOf(raw: string): EmailTemplateKey {
  if (!(EMAIL_TEMPLATE_KEYS as readonly string[]).includes(raw)) throw new HttpError(404, "Plantilla no encontrada.");
  return raw as EmailTemplateKey;
}

/** Sample values used in previews and test sends. Customer-facing, so in Spanish. */
const SAMPLE: Record<string, string> = { nombre: "María López", cliente: "Juan Pérez", correo_cliente: "juan@ejemplo.pe" };

adminEmailsRouter.get("/email-templates", async (req, res) => {
  const overrides = await loadOverrides(req.tenant.id);
  const body: EmailTemplateDTO[] = EMAIL_TEMPLATE_KEYS.map((key) => {
    const def = EMAIL_TEMPLATES[key];
    const current = overrides[key] ?? def.defaults;
    return { key, label: def.label, description: def.description, variables: def.variables, ...current, isCustom: !!overrides[key], defaults: def.defaults };
  });
  res.json(body);
});

function validated(key: EmailTemplateKey, body: unknown) {
  const content = parse(emailTemplateSchema, body);
  const unknown = unknownVariables(key, content);
  if (unknown.length) {
    throw new HttpError(400, `Estas variables no existen en esta plantilla: ${unknown.map((v) => `{{${v}}}`).join(", ")}`);
  }
  return content;
}

adminEmailsRouter.put("/email-templates/:key", async (req, res) => {
  const key = keyOf(req.params.key);
  const content = validated(key, req.body);
  const overrides = await loadOverrides(req.tenant.id);
  const isDefault = JSON.stringify(content) === JSON.stringify(EMAIL_TEMPLATES[key].defaults);
  if (isDefault) delete overrides[key];
  else overrides[key] = content;
  await saveOverrides(req.tenant.id, overrides);
  res.json({ ok: true, isCustom: !isDefault });
});

/** "Restaurar texto original" (D59). */
adminEmailsRouter.delete("/email-templates/:key", async (req, res) => {
  const key = keyOf(req.params.key);
  const overrides = await loadOverrides(req.tenant.id);
  delete overrides[key];
  await saveOverrides(req.tenant.id, overrides);
  res.json({ ok: true, ...EMAIL_TEMPLATES[key].defaults });
});

/** Renders unsaved content with sample data for the live preview. */
adminEmailsRouter.post("/email-templates/:key/preview", async (req, res) => {
  const key = keyOf(req.params.key);
  const content = validated(key, req.body);
  const b = await getBranding(req.tenant.id);
  const mail = renderMail(content, req.user!.email, SAMPLE, { name: b.brandName, color: b.primaryColor }, `${appUrl(req.tenant)}/`);
  res.json({ subject: mail.subject, html: mail.html });
});

/** "Enviarme una prueba" (D59): sends the (unsaved) content to the admin's own email. */
adminEmailsRouter.post("/email-templates/:key/test", async (req, res) => {
  const key = keyOf(req.params.key);
  const content = validated(key, req.body);
  const b = await getBranding(req.tenant.id);
  const mail = renderMail(content, req.user!.email, { ...SAMPLE, nombre: req.user!.name }, { name: b.brandName, color: b.primaryColor }, `${appUrl(req.tenant)}/`);
  await sendMail({ ...mail, subject: `[Prueba] ${mail.subject}` });
  res.json({ ok: true, to: req.user!.email });
});
