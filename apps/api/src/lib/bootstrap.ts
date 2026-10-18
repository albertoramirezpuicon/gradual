import { db } from "../db/knex.js";
import { DEFAULT_BRANDING } from "@gradual/shared";
import { PRIVACY_POLICY_V1 } from "../db/seeds/privacy-policy-v1.js";
import { newId, now } from "./util.js";
import type { TenantRow } from "../middleware/context.js";

/** Creates the tenant with default branding and privacy policy v1 if missing. Idempotent. */
export async function ensureTenant(slug: string, name: string, domain: string | null = null): Promise<TenantRow> {
  let t: TenantRow | undefined = await db("gradual_tenants").where({ slug }).first();
  if (!t) {
    t = { id: newId(), slug, name, domain };
    await db("gradual_tenants").insert({ ...t, created_at: now() });
  }
  const s = await db("gradual_tenant_settings").where({ tenant_id: t.id }).first();
  if (!s) {
    await db("gradual_tenant_settings").insert({
      tenant_id: t.id,
      brand_name: DEFAULT_BRANDING.brandName,
      primary_color: DEFAULT_BRANDING.primaryColor,
      secondary_color: DEFAULT_BRANDING.secondaryColor,
      font: DEFAULT_BRANDING.font,
      updated_at: now(),
    });
  }
  const p = await db("gradual_privacy_policies").where({ tenant_id: t.id }).first();
  if (!p) {
    await db("gradual_privacy_policies").insert({
      id: newId(),
      tenant_id: t.id,
      version: 1,
      content: PRIVACY_POLICY_V1,
      published_at: now(),
    });
  }
  return t;
}
