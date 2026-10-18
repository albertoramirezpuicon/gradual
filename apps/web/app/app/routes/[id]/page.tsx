import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ClientRouteDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { ClientRouteView } from "./view";

export const metadata: Metadata = { title: "Mi ruta" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch(`/me/routes/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  return <ClientRouteView initial={(await r.json()) as ClientRouteDTO} />;
}
