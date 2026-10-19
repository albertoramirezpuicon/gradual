"use client";

import { useEffect, useState } from "react";
import type { CvRunDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { Alert, Button, Card, Spinner, cn } from "@/components/ui";

/** Highlights "[...]" placeholders the candidate must still complete (D48). */
function WithPlaceholders({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]{2,120}\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[.*\]$/.test(p) ? (
          <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function ScoreRing({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-20">
        <svg viewBox="0 0 72 72" className="size-20 -rotate-90" aria-hidden>
          <circle cx="36" cy="36" r={r} fill="none" stroke="#e7e5e4" strokeWidth="7" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            stroke={accent ? "var(--brand-primary)" : "#a8a29e"}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - value / 100)}
          />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-xl font-bold tabular-nums", accent ? "text-primary" : "text-stone-600")}>
          {value}
        </span>
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</span>
    </div>
  );
}

/**
 * Shows a CV run: waiting state (polls until done), failure, or the full result with downloads.
 * Used by both the client and the admin views.
 */
export function CvRunView({ initial }: { initial: CvRunDTO }) {
  const [run, setRun] = useState(initial);
  const [tab, setTab] = useState<Record<number, "improved" | "original">>({});
  const pending = run.status === "queued" || run.status === "processing";

  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      try {
        setRun(await api<CvRunDTO>(`/cv/runs/${run.id}`));
      } catch {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [pending, run.id]);

  if (pending) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="text-primary">
          <Spinner />
        </span>
        <p className="font-semibold">Analizando el CV…</p>
        <p className="max-w-sm text-sm text-stone-600">Suele tardar entre 30 y 60 segundos. Puedes quedarte en esta página; se actualizará sola.</p>
      </Card>
    );
  }
  if (run.status === "failed" || !run.result) {
    return <Alert>{run.error ?? "No pudimos analizar el CV."}</Alert>;
  }

  const r = run.result;
  const placeholders = JSON.stringify(r.improvedCv).match(/\[[^\]]{2,120}\]/g)?.length ?? 0;

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <ScoreRing value={r.initialScore} label="Antes" />
            <span className="text-2xl text-stone-400" aria-hidden>
              →
            </span>
            <ScoreRing value={r.finalScore} label="Después" accent />
          </div>
          <p className="min-w-0 flex-1 basis-64 text-sm leading-relaxed text-stone-700">{r.summary}</p>
        </div>
        {placeholders ? (
          <div className="mt-4">
            <Alert tone="warning">
              Hay {placeholders} {placeholders === 1 ? "dato marcado" : "datos marcados"} <mark className="rounded bg-amber-100 px-1">[así]</mark> para completar. Descarga la versión Word para
              editarlos antes de enviar tu CV.
            </Alert>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/v1/cv/runs/${run.id}/pdf`}>Descargar PDF</a>
          </Button>
          <Button asChild variant="secondary">
            <a href={`/api/v1/cv/runs/${run.id}/docx`}>Descargar Word (editable)</a>
          </Button>
        </div>
      </Card>

      <h2 className="pt-2 text-lg font-bold">Cambios por sección</h2>
      <ul className="space-y-4">
        {r.sections.map((s, i) => {
          const view = tab[i] ?? "improved";
          return (
            <li key={i}>
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">{s.name}</p>
                  <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-xs font-semibold">
                    {(["improved", "original"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setTab((t) => ({ ...t, [i]: v }))}
                        className={cn("rounded-md px-2.5 py-1", view === v ? "bg-white shadow-sm" : "text-stone-600")}
                      >
                        {v === "improved" ? "Mejorado" : "Original"}
                      </button>
                    ))}
                  </div>
                </div>
                <p className={cn("mt-3 whitespace-pre-line text-sm leading-relaxed", view === "original" ? "text-stone-500" : "text-stone-800")}>
                  {view === "improved" ? <WithPlaceholders text={s.improved || "—"} /> : s.original || "—"}
                </p>
                {s.comments.length ? (
                  <ul className="mt-3 space-y-1.5 border-t border-stone-100 pt-3">
                    {s.comments.map((c, j) => (
                      <li key={j} className="flex gap-2 text-sm text-stone-700">
                        <span className="text-primary" aria-hidden>
                          ✦
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const runStatusLabel = { queued: "En cola", processing: "Analizando", done: "Listo", failed: "Falló" } as const;
