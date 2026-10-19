import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CvRunDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { CvRunView } from "@/components/cv-result";

export const metadata: Metadata = { title: "Análisis de CV" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch(`/cv/runs/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  const run = (await r.json()) as CvRunDTO;
  return (
    <>
      <Link href="/admin/cv" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Mejorador de CV
      </Link>
      <div className="mb-5 mt-2">
        <h1 className="text-2xl font-bold tracking-tight">{run.clientName}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {run.sourceFileName} · estándares v{run.promptVersion} · {run.startedBy === "admin" ? "iniciado por ti" : "iniciado por el cliente"} ·{" "}
          <Link href={`/admin/clients/${run.clientId}`} className="font-semibold text-primary hover:underline">
            ver ficha
          </Link>
        </p>
      </div>
      <CvRunView initial={run} />
    </>
  );
}
