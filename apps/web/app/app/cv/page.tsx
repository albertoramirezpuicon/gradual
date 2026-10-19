import type { Metadata } from "next";
import type { CvQuotaDTO, CvRunSummaryDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { PageHeader } from "@/components/shell";
import { CvUpload } from "@/components/cv-upload";
import { CvRunList } from "@/components/cv-run-list";
import { Alert, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Mejorar mi CV" };

/** Client: upload a CV (within the monthly quota) and see previous analyses. */
export default async function Page() {
  const [q, r] = await Promise.all([serverFetch("/cv/quota"), serverFetch("/cv/runs")]);
  const quota = (await q.json()) as CvQuotaDTO;
  const runs = (await r.json()) as CvRunSummaryDTO[];
  return (
    <>
      <PageHeader title="Mejorar mi CV" description="Sube tu CV en PDF y recibe una versión mejorada con comentarios por sección." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="space-y-4 p-5 sm:p-6">
          <p className="text-sm text-stone-600">
            Te quedan <b className="text-stone-900">{quota.remaining}</b> de {quota.limit} análisis este mes.
          </p>
          {quota.remaining === 0 ? (
            <Alert tone="info">Ya usaste tus análisis de este mes. Podrás volver a intentarlo el próximo mes.</Alert>
          ) : (
            <CvUpload detailBase="/app/cv" />
          )}
          <p className="text-xs text-stone-500">
            Solo leemos el texto de tu CV para mejorarlo; no inventamos experiencia ni datos. Si falta una cifra, te dejaremos un espacio marcado para que la completes.
          </p>
        </Card>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-stone-600">Mis análisis</h2>
          <CvRunList runs={runs} hrefBase="/app/cv" />
        </div>
      </div>
    </>
  );
}
