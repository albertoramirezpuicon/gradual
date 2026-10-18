"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RouteDetailDTO, RouteSummaryDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell";
import { Modal } from "@/components/modal";
import { DownIcon, UpIcon } from "@/components/icons";
import { Alert, Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";

/** Admin list of routes: create, reorder, open the editor. */
export function RoutesView({ initial }: { initial: RouteSummaryDTO[] }) {
  const router = useRouter();
  const [routes, setRoutes] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setRoutes(await api<RouteSummaryDTO[]>("/admin/routes"));
  }

  async function move(id: string, direction: "up" | "down") {
    await api(`/admin/routes/${id}/move`, { body: { direction } });
    await reload();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const r = await api<RouteDetailDTO>("/admin/routes", { body: { title: f.get("title"), description: f.get("description") } });
      router.push(`/admin/routes/${r.id}`);
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Rutas"
        description="Cada ruta agrupa etapas con sus materiales. Tus clientes solo ven las rutas publicadas que les asignes."
        action={<Button onClick={() => setOpen(true)}>Nueva ruta</Button>}
      />

      {routes.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold">Aún no tienes rutas</p>
          <p className="mt-1 text-sm text-stone-600">Crea la primera, por ejemplo “Ruta de empleabilidad”.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {routes.map((r, i) => (
            <li key={r.id}>
              <Card className="flex items-center gap-3 p-4">
                <div className="flex flex-col">
                  <button className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(r.id, "up")} aria-label="Subir">
                    <UpIcon />
                  </button>
                  <button className="rounded p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-30" disabled={i === routes.length - 1} onClick={() => move(r.id, "down")} aria-label="Bajar">
                    <DownIcon />
                  </button>
                </div>
                <Link href={`/admin/routes/${r.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.title}</p>
                    {r.published ? <Badge tone="success">Publicada</Badge> : <Badge>Borrador</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-stone-600">
                    {r.stageCount} {r.stageCount === 1 ? "etapa" : "etapas"} · {r.assignedCount} {r.assignedCount === 1 ? "cliente" : "clientes"}
                  </p>
                </Link>
                <Link href={`/admin/routes/${r.id}`} className="text-sm font-semibold text-primary hover:underline">
                  Editar
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onOpenChange={(o) => (setOpen(o), setError(null))} title="Nueva ruta" description="Se crea como borrador; podrás publicarla cuando esté lista.">
        <form onSubmit={create} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Título" htmlFor="route-title">
            <Input id="route-title" name="title" required maxLength={160} autoFocus />
          </Field>
          <Field label="Descripción (opcional)" htmlFor="route-desc">
            <Textarea id="route-desc" name="description" rows={3} maxLength={2000} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Crear ruta
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
