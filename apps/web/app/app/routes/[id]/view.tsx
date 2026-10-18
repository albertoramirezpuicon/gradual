"use client";

import { useState } from "react";
import Link from "next/link";
import type { ClientRouteDTO, ResourceDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { CheckIcon, ExternalIcon, ResourceIcon } from "@/components/icons";
import { ProgressBar } from "@/components/progress";
import { RichText } from "@/components/rich-text";
import { Alert, Button, Card, cn } from "@/components/ui";

const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const FILE_KIND: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};

/** Client view of a route: stages in order (all visible, D14), resources and "mark as done" (D16). */
export function ClientRouteView({ initial }: { initial: ClientRouteDTO }) {
  const [route, setRoute] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = new Set(route.completions.map((c) => c.stageId));

  async function toggle(stageId: string) {
    setPending(stageId);
    setError(null);
    try {
      await api(`/me/stages/${stageId}/completion`, { method: "PUT", body: { done: !done.has(stageId) } });
      setRoute(await api<ClientRouteDTO>(`/me/routes/${route.id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Link href="/app" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Mis rutas
      </Link>
      <div className="mb-6 mt-2">
        <h1 className="text-2xl font-bold tracking-tight">{route.title}</h1>
        {route.description ? <p className="mt-1 text-sm text-stone-600">{route.description}</p> : null}
        <div className="mt-4 max-w-md">
          <ProgressBar done={done.size} total={route.stages.length} />
        </div>
      </div>
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <ol className="space-y-4">
        {route.stages.map((s, i) => {
          const isDone = done.has(s.id);
          return (
            <li key={s.id}>
              <Card className={cn("overflow-hidden", isDone && "border-primary/30")}>
                <div className="flex items-start gap-3 p-4 sm:p-5">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                      isDone ? "bg-primary text-on-primary" : "bg-primary-soft text-primary",
                    )}
                  >
                    {isDone ? <CheckIcon /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Etapa {i + 1}</p>
                    <h2 className="text-lg font-bold leading-snug">{s.title}</h2>
                    {s.description ? <p className="mt-1 text-sm text-stone-600">{s.description}</p> : null}
                  </div>
                </div>

                {s.resources.length ? (
                  <ul className="space-y-3 px-4 pb-4 sm:px-5">
                    {s.resources.map((r) => (
                      <li key={r.id}>
                        <ResourceItem r={r} />
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 bg-stone-50/60 px-4 py-3 sm:px-5">
                  <p className="text-sm text-stone-600">{isDone ? "¡Etapa completada!" : "¿Terminaste esta etapa?"}</p>
                  <Button size="sm" variant={isDone ? "secondary" : "primary"} loading={pending === s.id} onClick={() => toggle(s.id)}>
                    {isDone ? "Desmarcar" : "Marcar como completada"}
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function ResourceItem({ r }: { r: ResourceDTO }) {
  const shell = "rounded-xl border border-stone-200 bg-white";
  const header = (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-primary">
        <ResourceIcon type={r.type} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{r.title}</p>
        {r.description ? <p className="mt-0.5 text-sm text-stone-600">{r.description}</p> : null}
      </div>
    </div>
  );

  switch (r.type) {
    case "file": {
      const isPdf = r.mime === "application/pdf";
      return (
        <div className={cn(shell, "p-4")}>
          {header}
          <div className="mt-3 flex flex-wrap items-center gap-3 pl-8">
            <Button asChild size="sm">
              <a href={`/api/v1/resources/${r.id}/download`} target="_blank" rel="noopener">
                {isPdf ? "Abrir PDF" : "Descargar"}
              </a>
            </Button>
            <span className="text-xs text-stone-500">
              {FILE_KIND[r.mime ?? ""] ?? "Archivo"} · {formatBytes(r.sizeBytes ?? 0)}
            </span>
          </div>
        </div>
      );
    }
    case "link":
      return (
        <a href={r.url!} target="_blank" rel="noopener noreferrer" className={cn(shell, "block p-4 transition hover:border-primary/40")}>
          {header}
          <p className="mt-2 flex items-center gap-1 pl-8 text-sm font-semibold text-primary">
            Abrir enlace <ExternalIcon />
          </p>
        </a>
      );
    case "video":
      return (
        <div className={cn(shell, "p-4")}>
          {header}
          <div className="mt-3">
            <YouTube id={r.youtubeId!} title={r.title} />
          </div>
        </div>
      );
    case "text":
      return (
        <div className={cn(shell, "p-4")}>
          {header}
          {r.html ? (
            <div className="mt-3 pl-8">
              <RichText html={r.html} />
            </div>
          ) : null}
        </div>
      );
  }
}

/** Privacy-friendly embed: loads YouTube only when tapped, via youtube-nocookie.com (D42). */
function YouTube({ id, title }: { id: string; title: string }) {
  const [play, setPlay] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-stone-900">
      {play ? (
        <iframe
          className="absolute inset-0 size-full"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button onClick={() => setPlay(true)} className="group absolute inset-0 size-full" aria-label={`Reproducir video: ${title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" className="size-full object-cover opacity-90 transition group-hover:opacity-100" loading="lazy" />
          <span className="absolute left-1/2 top-1/2 inline-flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white transition group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="ml-1 size-7" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
