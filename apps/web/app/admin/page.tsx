import Link from "next/link";
import type { ClientDTO, PolicyDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { PageHeader } from "@/components/shell";
import { Alert, Card } from "@/components/ui";

/** Matches unfilled placeholders such as [RUC] in the privacy policy draft. */
const PLACEHOLDER = /\[[A-ZÁÉÍÓÚÑ ]{3,}\]/;

export default async function AdminHome() {
  const [cr, pr] = await Promise.all([serverFetch("/admin/clients"), serverFetch("/admin/policies/current")]);
  const clients = (await cr.json()) as ClientDTO[];
  const policy = (await pr.json()) as PolicyDTO | null;
  const active = clients.filter((c) => c.status === "active").length;
  const pending = clients.filter((c) => c.status === "invited").length;
  const policyIncomplete = policy ? PLACEHOLDER.test(policy.content) : true;
  const deletionRequests = clients.filter((c) => c.deletionRequestedAt);

  return (
    <>
      <PageHeader title="Inicio" />
      {policyIncomplete ? (
        <div className="mb-6">
          <Alert tone="warning">
            La política de privacidad aún tiene campos por completar (como <code>[RUC]</code>).{" "}
            <Link href="/admin/privacy" className="font-semibold underline">
              Complétala
            </Link>{" "}
            antes de invitar a clientes reales.
          </Alert>
        </div>
      ) : null}
      {deletionRequests.length ? (
        <div className="mb-6">
          <Alert tone="warning">
            {deletionRequests.length === 1 ? "1 cliente pidió" : `${deletionRequests.length} clientes pidieron`} eliminar su cuenta:{" "}
            {deletionRequests.map((c, i) => (
              <span key={c.id}>
                {i ? ", " : ""}
                <Link href={`/admin/clients/${c.id}`} className="font-semibold underline">
                  {c.name}
                </Link>
              </span>
            ))}
            .
          </Alert>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Clientes activos" value={active} />
        <Stat label="Invitaciones pendientes" value={pending} />
        <Card className="flex flex-col justify-between p-5">
          <p className="text-sm text-stone-600">¿Nuevo cliente?</p>
          <Link href="/admin/clients" className="mt-3 text-sm font-semibold text-primary hover:underline">
            Invitar cliente →
          </Link>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
