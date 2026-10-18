import { db } from "../db/knex.js";
import type { Branding, FontName } from "@gradual/shared";

export async function getBranding(tenantId: string): Promise<Branding> {
  const s = await db("gradual_tenant_settings").where({ tenant_id: tenantId }).first();
  return {
    brandName: s.brand_name,
    primaryColor: s.primary_color,
    secondaryColor: s.secondary_color,
    font: s.font as FontName,
    // The logo is served through the API (redirect to a signed URL); the `v` param busts caches when it changes.
    logoUrl: s.logo_s3_key ? `/api/v1/public/logo?v=${encodeURIComponent(s.logo_s3_key.split("/").pop()!)}` : null,
  };
}
