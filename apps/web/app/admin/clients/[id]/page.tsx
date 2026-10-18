import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ClientDetailDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { ClientDetail } from "./view";

export const metadata: Metadata = { title: "Cliente" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch(`/admin/clients/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  return <ClientDetail initial={(await r.json()) as ClientDetailDTO} />;
}
