import type { TenantSummaryDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { TenantsView } from "./view";

export default async function Page() {
  const r = await serverFetch("/platform/tenants");
  return <TenantsView initial={(await r.json()) as TenantSummaryDTO[]} />;
}
