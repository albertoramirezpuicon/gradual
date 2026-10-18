import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { RouteDetailDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { RouteEditor } from "./editor";

export const metadata: Metadata = { title: "Editar ruta" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch(`/admin/routes/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  return <RouteEditor initial={(await r.json()) as RouteDetailDTO} />;
}
