"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import type { ClientDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" }) : "—";

export function ClientsView({ initial }: { initial: ClientDTO[] }) {
  const [clients, setClients] = useState(initial);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [q, setQ] = useState("");

  const shown = clients.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()));

  async function resend(c: ClientDTO) {
    try {
      await api(`/admin/clients/${c.id}/resend-invitation`, { body: {} });
      setNotice({ tone: "success", text: `Invitación reenviada a ${c.email}.` });
    } catch (e) {
      setNotice({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Solo las personas que invites pueden acceder a la plataforma."
        action={
          <InviteDialog
            onInvited={(c) => {
              setClients((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
              setNotice({ tone: "success", text: `Invitación enviada a ${c.email}.` });
            }}
          />
        }
      />
      {notice ? (
        <div className="mb-4">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      ) : null}

      <Card>
        {clients.length === 0 ? (
          <div className="p-10 text-center">
            <p className="font-semibold">Aún no tienes clientes</p>
            <p className="mt-1 text-sm text-stone-600">Invita al primero; recibirá un correo para activar su cuenta.</p>
          </div>
        ) : (
          <>
            <div className="border-b border-stone-200 p-3">
              <Input placeholder="Buscar por nombre o correo" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Nombre</th>
                    <th className="px-4 py-3 font-semibold">Correo</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Último acceso</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {shown.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-3 font-semibold">
                        <Link href={`/admin/clients/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{c.email}</td>
                      <td className="px-4 py-3">
                        {c.status === "active" ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Invitación pendiente</Badge>}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-stone-600">{fmt(c.lastLoginAt)}</td>
                      <td className="px-4 py-3 text-right">
                        {c.status === "invited" ? (
                          <Button size="sm" variant="secondary" onClick={() => resend(c)}>
                            Reenviar invitación
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

function InviteDialog({ onInvited }: { onInvited: (c: ClientDTO) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const c = await api<ClientDTO>("/admin/clients", { body: { name: f.get("name"), email: f.get("email") } });
      onInvited(c);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      <Dialog.Trigger asChild>
        <Button>Invitar cliente</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-stone-900/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
          <Dialog.Title className="text-lg font-bold">Invitar cliente</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-stone-600">
            Le enviaremos un correo para que cree su contraseña. El enlace vence en 7 días.
          </Dialog.Description>
          <form onSubmit={onSubmit} className="mt-5 space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Nombre" htmlFor="inv-name">
              <Input id="inv-name" name="name" required minLength={2} autoFocus />
            </Field>
            <Field label="Correo electrónico" htmlFor="inv-email">
              <Input id="inv-email" name="email" type="email" required />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button type="submit" loading={loading}>
                Enviar invitación
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
