import type { Metadata } from "next";
import type { ClientDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { ClientsView } from "./view";

export const metadata: Metadata = { title: "Clientes" };

export default async function Page() {
  const r = await serverFetch("/admin/clients");
  return <ClientsView initial={(await r.json()) as ClientDTO[]} />;
}
