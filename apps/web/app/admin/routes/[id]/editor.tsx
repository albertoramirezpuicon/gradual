"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ResourceDTO, RouteDetailDTO, StageDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { ConfirmDialog, Modal } from "@/components/modal";
import { DownIcon, ResourceIcon, UpIcon } from "@/components/icons";
import { Alert, Badge, Button, Card, Field, Input, Textarea, cn } from "@/components/ui";
import { ResourceDialog, formatBytes } from "./resource-dialog";
import { ProgressTab } from "./progress-tab";

type Confirm = { title: string; description: string; run: () => Promise<void> } | null;

/** Admin editor for one route: details, publish state, stages and resources, and progress. */
export function RouteEditor({ initial }: { initial: RouteDetailDTO }) {
  const router = useRouter();
  const [route, setRoute] = useState(initial);
  const [tab, setTab] = useState<"content" | "progress">("content");
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [stageDialog, setStageDialog] = useState<{ stage: StageDTO | null } | null>(null);
  const [resourceDialog, setResourceDialog] = useState<{ stageId: string; resource: ResourceDTO | null } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  /** Runs an API call; on success replaces local state with the fresh route (or reloads it). */
  async function run(fn: () => Promise<RouteDetailDTO | unknown>) {
    setError(null);
    try {
      const r = await fn();
      if (r && typeof r === "object" && "stages" in r) setRoute(r as RouteDetailDTO);
      else setRoute(await api<RouteDetailDTO>(`/admin/routes/${route.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const togglePublished = () =>
    run(() => api(`/admin/routes/${route.id}`, { method: "PUT", body: { title: route.title, description: route.description, published: !route.published } }));

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    await confirm.run();
    setBusy(false);
    setConfirm(null);
  }

  return (
    <>
      <Link href="/admin/routes" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Rutas
      </Link>

      <div className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{route.title}</h1>
            {route.published ? <Badge tone="success">Publicada</Badge> : <Badge>Borrador</Badge>}
          </div>
          {route.description ? <p className="mt-1 max-w-2xl text-sm text-stone-600">{route.description}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDetailsOpen(true)}>
            Editar datos
          </Button>
          <Button variant={route.published ? "secondary" : "primary"} size="sm" onClick={togglePublished}>
            {route.published ? "Volver a borrador" : "Publicar"}
          </Button>
        </div>
      </div>

      {!route.published ? (
        <div className="mb-4">
          <Alert tone="info">Esta ruta es un borrador: tus clientes no la verán hasta que la publiques.</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="mb-4 flex w-fit gap-1 rounded-lg bg-stone-100 p-1 text-sm font-semibold">
        {(["content", "progress"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5", tab === t ? "bg-white shadow-sm" : "text-stone-600")}>
            {t === "content" ? "Contenido" : "Progreso"}
          </button>
        ))}
      </div>

      {tab === "progress" ? (
        <ProgressTab routeId={route.id} />
      ) : (
        <div className="space-y-4">
          {route.stages.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="font-semibold">Esta ruta aún no tiene etapas</p>
              <p className="mt-1 text-sm text-stone-600">Por ejemplo: “Mis fortalezas”, “Mi CV”, “Preparar la entrevista”.</p>
            </Card>
          ) : null}

          {route.stages.map((s, i) => (
            <Card key={s.id} className="overflow-hidden">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-stone-100 bg-stone-50/60 p-4">
                <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{i + 1}</span>
                <div className="min-w-0 flex-1 basis-[calc(100%-2.5rem)] sm:basis-0">
                  <p className="font-semibold">{s.title}</p>
                  {s.description ? <p className="mt-0.5 text-sm text-stone-600">{s.description}</p> : null}
                </div>
                <ItemActions
                  first={i === 0}
                  last={i === route.stages.length - 1}
                  onMove={(d) => run(() => api(`/admin/stages/${s.id}/move`, { body: { direction: d } }))}
                  onEdit={() => setStageDialog({ stage: s })}
                  onDelete={() =>
                    setConfirm({
                      title: `¿Eliminar la etapa “${s.title}”?`,
                      description: "Se eliminarán sus recursos (incluidos los archivos) y el avance de los clientes en esta etapa. No se puede deshacer.",
                      run: () => run(() => api(`/admin/stages/${s.id}`, { method: "DELETE" })),
                    })
                  }
                />
              </div>

              <ul className="divide-y divide-stone-100">
                {s.resources.map((r, j) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <span className="text-primary">
                      <ResourceIcon type={r.type} />
                    </span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-2rem)] sm:basis-0">
                      <p className="text-sm font-semibold sm:truncate">{r.title}</p>
                      <p className="truncate text-xs text-stone-500">{resourceMeta(r)}</p>
                    </div>
                    <ItemActions
                      first={j === 0}
                      last={j === s.resources.length - 1}
                      onMove={(d) => run(() => api(`/admin/resources/${r.id}/move`, { body: { direction: d } }))}
                      onEdit={() => setResourceDialog({ stageId: s.id, resource: r })}
                      onDelete={() =>
                        setConfirm({
                          title: `¿Eliminar “${r.title}”?`,
                          description: r.type === "file" ? "También se eliminará el archivo. No se puede deshacer." : "No se puede deshacer.",
                          run: () => run(() => api(`/admin/resources/${r.id}`, { method: "DELETE" })),
                        })
                      }
                    />
                  </li>
                ))}
              </ul>
              <div className="p-3">
                <Button variant="ghost" size="sm" onClick={() => setResourceDialog({ stageId: s.id, resource: null })}>
                  + Agregar recurso
                </Button>
              </div>
            </Card>
          ))}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStageDialog({ stage: null })}>
              + Agregar etapa
            </Button>
            <Button
              variant="ghost"
              className="text-red-700 hover:bg-red-50"
              onClick={() =>
                setConfirm({
                  title: `¿Eliminar la ruta “${route.title}”?`,
                  description: "Se eliminarán todas sus etapas, recursos y archivos, y dejará de estar asignada a tus clientes. No se puede deshacer.",
                  run: async () => {
                    await api(`/admin/routes/${route.id}`, { method: "DELETE" });
                    router.push("/admin/routes");
                  },
                })
              }
            >
              Eliminar ruta
            </Button>
          </div>
        </div>
      )}

      <DetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} route={route} onSaved={setRoute} />
      <StageDialog
        state={stageDialog}
        onClose={() => setStageDialog(null)}
        onSubmit={(body) =>
          run(() =>
            stageDialog?.stage
              ? api(`/admin/stages/${stageDialog.stage.id}`, { method: "PUT", body })
              : api(`/admin/routes/${route.id}/stages`, { body }),
          )
        }
      />
      <ResourceDialog
        open={!!resourceDialog}
        onOpenChange={(o) => !o && setResourceDialog(null)}
        stageId={resourceDialog?.stageId ?? ""}
        resource={resourceDialog?.resource ?? null}
        onSaved={() => run(() => api(`/admin/routes/${route.id}`))}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        onConfirm={doConfirm}
        loading={busy}
      />
    </>
  );
}

function resourceMeta(r: ResourceDTO): string {
  switch (r.type) {
    case "file":
      return `${r.fileName ?? "Archivo"} · ${formatBytes(r.sizeBytes ?? 0)}`;
    case "link":
      try {
        return new URL(r.url!).hostname.replace(/^www\./, "");
      } catch {
        return r.url ?? "";
      }
    case "video":
      return "Video de YouTube";
    case "text":
      return "Texto";
  }
}

/** Move up/down, edit and delete controls (D36). */
function ItemActions(p: { first: boolean; last: boolean; onMove: (d: "up" | "down") => void; onEdit: () => void; onDelete: () => void }) {
  const icon = "rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30";
  return (
    // On phones the actions wrap onto their own row, right-aligned, so titles keep the full width.
    <div className="ml-auto flex shrink-0 items-center">
      <button className={icon} disabled={p.first} onClick={() => p.onMove("up")} aria-label="Subir">
        <UpIcon />
      </button>
      <button className={icon} disabled={p.last} onClick={() => p.onMove("down")} aria-label="Bajar">
        <DownIcon />
      </button>
      <button className="rounded-md px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100" onClick={p.onEdit}>
        Editar
      </button>
      <button className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" onClick={p.onDelete}>
        Eliminar
      </button>
    </div>
  );
}

function DetailsDialog({ open, onOpenChange, route, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; route: RouteDetailDTO; onSaved: (r: RouteDetailDTO) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      onSaved(
        await api<RouteDetailDTO>(`/admin/routes/${route.id}`, {
          method: "PUT",
          body: { title: f.get("title"), description: f.get("description"), published: route.published },
        }),
      );
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Datos de la ruta">
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label="Título" htmlFor="rt-title">
          <Input id="rt-title" name="title" defaultValue={route.title} required maxLength={160} />
        </Field>
        <Field label="Descripción (opcional)" htmlFor="rt-desc">
          <Textarea id="rt-desc" name="description" defaultValue={route.description} rows={3} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StageDialog({ state, onClose, onSubmit }: { state: { stage: StageDTO | null } | null; onClose: () => void; onSubmit: (b: { title: string; description: string }) => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    await onSubmit({ title: String(f.get("title")), description: String(f.get("description")) });
    setLoading(false);
    onClose();
  }
  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.stage ? "Editar etapa" : "Nueva etapa"}>
      <form key={state?.stage?.id ?? "new"} onSubmit={submit} className="space-y-4">
        <Field label="Título" htmlFor="st-title">
          <Input id="st-title" name="title" defaultValue={state?.stage?.title} required maxLength={160} autoFocus />
        </Field>
        <Field label="Descripción (opcional)" htmlFor="st-desc" hint="Explica brevemente el objetivo de esta etapa.">
          <Textarea id="st-desc" name="description" defaultValue={state?.stage?.description} rows={3} maxLength={2000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
