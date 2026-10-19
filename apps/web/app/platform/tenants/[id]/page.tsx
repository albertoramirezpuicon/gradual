import type { TenantDetailDTO } from "@gradual/shared";
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/server";
import { TenantView } from "./view";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const r = await serverFetch(`/platform/tenants/${id}`);
  if (r.status === 404) notFound();
  return <TenantView initial={(await r.json()) as TenantDetailDTO} justCreated={sp.created === "1"} />;
}
