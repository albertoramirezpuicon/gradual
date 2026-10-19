import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CvRunDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { CvRunView } from "@/components/cv-result";

export const metadata: Metadata = { title: "Mi CV mejorado" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await serverFetch(`/cv/runs/${encodeURIComponent(id)}`);
  if (r.status === 404) notFound();
  const run = (await r.json()) as CvRunDTO;
  return (
    <>
      <Link href="/app/cv" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Mejorar mi CV
      </Link>
      <h1 className="mb-5 mt-2 text-2xl font-bold tracking-tight">Tu CV mejorado</h1>
      <CvRunView initial={run} />
    </>
  );
}
