"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ClientDetailDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { CheckIcon } from "@/components/icons";
import { ProgressBar } from "@/components/progress";
import { Alert, Badge, Button, Card, Field, Input, cn } from "@/components/ui";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Admin view of one client: assigned routes and per-stage progress, which the admin can also mark (D16/D41). */
export function ClientDetail({ initial }: { initial: ClientDetailDTO }) {
  const [c, setC] = useState(initial);
  const [assignOpen, setAssignOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => setC(await api<ClientDetailDTO>(`/admin/clients/${c.id}`));

  async function toggle(stageId: string, done: boolean) {
    setError(null);
    try {
      await api(`/admin/clients/${c.id}/stages/${stageId}/completion`, { method: "PUT", body: { done } });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <Link href="/admin/clients" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Clientes
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
          <p className="mt-1 text-sm text-stone-600">
            {c.email} · {c.status === "active" ? `Último acceso: ${fmt(c.lastLoginAt)}` : "Invitación pendiente"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href={`/admin/cv?clientId=${c.id}`}>Análisis de CV</Link>
          </Button>
          <Button onClick={() => setAssignOpen(true)}>Asignar rutas</Button>
        </div>
      </div>
      {c.deletionRequestedAt ? (
        <div className="mb-4">
          <Alert tone="warning">
            Este cliente pidió eliminar su cuenta el {fmt(c.deletionRequestedAt)}. Puedes hacerlo al final de esta página.
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {c.routes.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-semibold">Sin rutas asignadas</p>
          <p className="mt-1 text-sm text-stone-600">Asígnale una ruta para que vea sus etapas y materiales.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {c.routes.map((r) => {
            const done = r.stages.filter((s) => s.done).length;
            return (
              <Card key={r.id} className="p-5">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Link href={`/admin/routes/${r.id}`} className="font-semibold hover:underline">
                    {r.title}
                  </Link>
                  {r.published ? null : <Badge tone="warning">Borrador: el cliente aún no la ve</Badge>}
                </div>
                <ProgressBar done={done} total={r.stages.length} />
                <ul className="mt-4 divide-y divide-stone-100">
                  {r.stages.map((s, i) => (
                    <li key={s.id} className="flex items-center gap-3 py-2.5">
                      <button
                        onClick={() => toggle(s.id, !s.done)}
                        aria-pressed={!!s.done}
                        aria-label={s.done ? "Desmarcar etapa" : "Marcar etapa como completada"}
                        className={cn(
                          "inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                          s.done ? "border-primary bg-primary text-on-primary" : "border-stone-300 text-transparent hover:border-primary",
                        )}
                      >
                        <CheckIcon />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {i + 1}. {s.title}
                        </p>
                        {s.done ? (
                          <p className="text-xs text-stone-500">
                            Completada {s.done.markedBy === "client" ? "por el cliente" : "por ti"} · {fmt(s.done.markedAt)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <DeleteClient client={c} />

      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} client={c} onSaved={reload} />
    </>
  );
}

/** Danger zone: permanent deletion of the client and all their data, confirmed by typing the name (D53). */
function DeleteClient({ client }: { client: ClientDetailDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === client.name.trim().toLowerCase();

  async function remove() {
    setLoading(true);
    setError(null);
    try {
      await api(`/admin/clients/${client.id}`, { method: "DELETE", body: { confirmName: typed } });
      router.push("/admin/clients");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <Card className="mt-8 border-red-200 p-5">
      <p className="font-semibold text-red-800">Eliminar cliente</p>
      <p className="mt-1 text-sm text-stone-600">
        Elimina definitivamente su cuenta, su avance, sus análisis de CV y sus archivos. No se puede deshacer.
      </p>
      <Button variant="danger" size="sm" className="mt-3" onClick={() => (setOpen(true), setTyped(""), setError(null))}>
        Eliminar cliente
      </Button>
      <Modal open={open} onOpenChange={setOpen} title={`¿Eliminar a ${client.name}?`} description="Se borrarán todos sus datos de forma permanente.">
        <div className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label={`Escribe “${client.name}” para confirmar`} htmlFor="confirm-name">
            <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={remove} disabled={!matches} loading={loading}>
              Eliminar definitivamente
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function AssignDialog({ open, onOpenChange, client, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; client: ClientDetailDTO; onSaved: () => Promise<void> }) {
  const [selected, setSelected] = useState<string[]>(client.routes.map((r) => r.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      await api(`/admin/clients/${client.id}/routes`, { method: "PUT", body: { routeIds: selected } });
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (o) setSelected(client.routes.map((r) => r.id));
        onOpenChange(o);
      }}
      title="Asignar rutas"
      description="El cliente verá las rutas publicadas que marques. Si quitas una ruta y luego la vuelves a asignar, su avance se conserva."
    >
      {error ? (
        <div className="mb-3">
          <Alert>{error}</Alert>
        </div>
      ) : null}
      {client.availableRoutes.length === 0 ? (
        <p className="text-sm text-stone-600">
          Aún no tienes rutas.{" "}
          <Link href="/admin/routes" className="font-semibold text-primary hover:underline">
            Crea una
          </Link>
          .
        </p>
      ) : (
        <ul className="space-y-2">
          {client.availableRoutes.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--brand-primary)]"
                  checked={selected.includes(r.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                />
                <span className="flex-1 text-sm font-semibold">{r.title}</span>
                {r.published ? null : <Badge>Borrador</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button onClick={save} loading={loading}>
          Guardar
        </Button>
      </div>
    </Modal>
  );
}
