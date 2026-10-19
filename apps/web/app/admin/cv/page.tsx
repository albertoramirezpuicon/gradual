import type { Metadata } from "next";
import Link from "next/link";
import type { ClientDTO, CvRunSummaryDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { PageHeader } from "@/components/shell";
import { CvRunList } from "@/components/cv-run-list";
import { Button } from "@/components/ui";
import { NewRunDialog } from "./new-run";

export const metadata: Metadata = { title: "Mejorador de CV" };

/** Admin: all CV analyses (optionally for one client) and starting one on a client's behalf. */
export default async function Page({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const [r, c] = await Promise.all([
    serverFetch(`/cv/runs${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`),
    serverFetch("/admin/clients"),
  ]);
  const runs = (await r.json()) as CvRunSummaryDTO[];
  const clients = ((await c.json()) as ClientDTO[]).filter((x) => x.status === "active");
  const filtered = clientId ? clients.find((x) => x.id === clientId) : undefined;
  return (
    <>
      <PageHeader
        title="Mejorador de CV"
        description={filtered ? `Análisis de ${filtered.name}` : "Análisis hechos por tus clientes o por ti en su nombre."}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/admin/cv/standards">Estándares</Link>
            </Button>
            <NewRunDialog clients={clients} defaultClientId={clientId} />
          </div>
        }
      />
      {filtered ? (
        <Link href="/admin/cv" className="mb-3 inline-block text-sm font-semibold text-primary hover:underline">
          Ver todos los análisis
        </Link>
      ) : null}
      <CvRunList runs={runs} hrefBase="/admin/cv" showClient />
    </>
  );
}
