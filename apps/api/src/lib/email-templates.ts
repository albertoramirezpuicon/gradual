import { EMAIL_TEMPLATES, EMAIL_TEMPLATE_KEYS, type EmailTemplateContent, type EmailTemplateKey } from "@gradual/shared";
import { db } from "../db/knex.js";
import { env } from "./env.js";
import { getBranding } from "./branding.js";
import { esc, layout, sendMail, type Mail } from "./mail.js";
import type { TenantRow } from "../middleware/context.js";

type Overrides = Partial<Record<EmailTemplateKey, EmailTemplateContent>>;

/** Tenant overrides are stored as JSON in gradual_tenant_settings.email_templates (D64). */
export async function loadOverrides(tenantId: string): Promise<Overrides> {
  const s = await db("gradual_tenant_settings").where({ tenant_id: tenantId }).first("email_templates");
  if (!s?.email_templates) return {};
  try {
    return JSON.parse(s.email_templates) as Overrides;
  } catch {
    return {};
  }
}

export async function saveOverrides(tenantId: string, overrides: Overrides) {
  const clean = Object.fromEntries(Object.entries(overrides).filter(([k]) => (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(k)));
  await db("gradual_tenant_settings")
    .where({ tenant_id: tenantId })
    .update({ email_templates: Object.keys(clean).length ? JSON.stringify(clean) : null, updated_at: new Date() });
}

export async function templateFor(tenantId: string, key: EmailTemplateKey): Promise<EmailTemplateContent> {
  return (await loadOverrides(tenantId))[key] ?? EMAIL_TEMPLATES[key].defaults;
}

/** Variables used in the content that the template does not offer (shown as a validation error). */
export function unknownVariables(key: EmailTemplateKey, c: EmailTemplateContent): string[] {
  const allowed = new Set(EMAIL_TEMPLATES[key].variables);
  const used = [...`${c.subject}\n${c.body}\n${c.buttonLabel}`.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]!);
  return [...new Set(used.filter((v) => !allowed.has(v)))];
}

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, k: string) => vars[k] ?? m);

/** Plain-text body → safe HTML: escaped, blank lines become paragraph breaks. */
function bodyToHtml(text: string) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => esc(p).replace(/\n/g, "<br>"))
    .join("<br><br>");
}

/** Renders a template with the tenant's branding. `vars` must include `nombre`; `marca` and `enlace` are added. */
export function renderMail(
  content: EmailTemplateContent,
  to: string,
  vars: Record<string, string>,
  brand: { name: string; color: string },
  url: string,
): Mail {
  const all = { ...vars, marca: brand.name, enlace: url };
  const subject = fill(content.subject, all).replace(/\s+/g, " ").trim();
  const body = fill(content.body, all);
  const button = fill(content.buttonLabel, all);
  return {
    to,
    subject,
    text: `${body.trim()}\n\n${button}: ${url}`,
    html: layout(brand.name, brand.color, bodyToHtml(body), { label: button, url }),
  };
}

/**
 * Base URL for links in a tenant's emails (D67): the tenant's own domain in production,
 * APP_BASE_URL in development (so local tests never point at production hosts).
 */
export function appUrl(tenant: Pick<TenantRow, "domain">): string {
  if (env.NODE_ENV === "production" && tenant.domain) return `https://${tenant.domain}`;
  return env.APP_BASE_URL.replace(/\/$/, "");
}

/** Builds and sends one of the tenant's templated emails. */
export async function sendTemplate(
  tenant: Pick<TenantRow, "id" | "domain">,
  key: EmailTemplateKey,
  to: string,
  vars: Record<string, string>,
  path: string,
) {
  const [content, b] = await Promise.all([templateFor(tenant.id, key), getBranding(tenant.id)]);
  await sendMail(renderMail(content, to, vars, { name: b.brandName, color: b.primaryColor }, `${appUrl(tenant)}${path}`));
}
