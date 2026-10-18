import Link from "next/link";
import type { ClientRouteSummaryDTO } from "@gradual/shared";
import { getMe, serverFetch } from "@/lib/server";
import { PageHeader } from "@/components/shell";
import { ProgressBar } from "@/components/progress";
import { Card } from "@/components/ui";

/** Client home: their published, assigned routes with progress. */
export default async function ClientHome() {
  const [me, r] = await Promise.all([getMe(), serverFetch("/me/routes")]);
  const routes = (await r.json()) as ClientRouteSummaryDTO[];
  return (
    <>
      <PageHeader title={`Hola, ${me!.name.split(" ")[0]}`} description="Aquí encontrarás tu ruta de empleabilidad, etapa por etapa." />
      {routes.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold">Tu consultora aún no te ha asignado una ruta</p>
          <p className="mt-1 text-sm text-stone-600">Cuando lo haga, verás aquí sus etapas y materiales.</p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {routes.map((rt) => (
            <li key={rt.id}>
              <Link href={`/app/routes/${rt.id}`} className="block h-full">
                <Card className="flex h-full flex-col gap-4 p-5 transition hover:border-primary/40 hover:shadow-md">
                  <div className="flex-1">
                    <p className="text-lg font-bold">{rt.title}</p>
                    {rt.description ? <p className="mt-1 line-clamp-3 text-sm text-stone-600">{rt.description}</p> : null}
                  </div>
                  <ProgressBar done={rt.doneCount} total={rt.stageCount} />
                  <span className="text-sm font-semibold text-primary">{rt.doneCount === 0 ? "Empezar →" : rt.doneCount === rt.stageCount ? "Revisar →" : "Continuar →"}</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
