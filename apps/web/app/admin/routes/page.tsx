import type { Metadata } from "next";
import type { RouteSummaryDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { RoutesView } from "./view";

export const metadata: Metadata = { title: "Rutas" };

export default async function Page() {
  const r = await serverFetch("/admin/routes");
  return <RoutesView initial={(await r.json()) as RouteSummaryDTO[]} />;
}
