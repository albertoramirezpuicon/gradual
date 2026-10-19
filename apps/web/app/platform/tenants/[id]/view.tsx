"use client";

import { useState } from "react";
import Link from "next/link";
import type { Me, TenantAdminDTO, TenantDetailDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { ConfirmDialog, Modal } from "@/components/modal";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import { fmtDate, fmtUsd } from "../../format";
import { SetupInstructions } from "./setup";

type Msg = { tone: "success" | "error"; text: string } | null;

/** Tenant detail: metrics, name/status, admins, support mode and domain setup (D60–D68). */
export function TenantView({ initial, justCreated }: { initial: TenantDetailDTO; justCreated: boolean }) {
  const [t, setT] = useState(initial);
  const [msg, setMsg] = useState<Msg>(justCreated ? { tone: "success", text: `Tenant creado. Invitamos a ${initial.admins[0]?.email ?? "su administrador"}. Ahora prepara el dominio con los pasos de abajo.` } : null);
  const [name, setName] = useState(t.name);
  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(justCreated);
  const m = t.metrics;
  const sub = t.domain?.endsWith(`.${t.domainSuffix}`) ? t.domain.slice(0, -(t.domainSuffix.length + 1)) : t.slug;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const update = (status: TenantDetailDTO["status"], okText: string) =>
    run("update", async () => {
      setT(await api<TenantDetailDTO>(`/platform/tenants/${t.id}`, { method: "PUT", body: { name: name.trim(), status } }));
      setMsg({ tone: "success", text: okText });
      setStatusOpen(false);
    });

  const resend = (a: TenantAdminDTO) =>
    run(`resend-${a.id}`, async () => {
      setT(await api<TenantDetailDTO>(`/platform/tenants/${t.id}/admins`, { body: { name: a.name, email: a.email } }));
      setMsg({ tone: "success", text: `Invitación reenviada a ${a.email}.` });
    });

  const impersonate = (a: TenantAdminDTO) =>
    run(`imp-${a.id}`, async () => {
      await api<Me>(`/platform/tenants/${t.id}/impersonate`, { body: { adminId: a.id } });
      window.location.href = "/admin";
    });

  const stats: [string, string][] = [
    ["Clientes activos", String(m.clientsActive)],
    ["Invitados pendientes", String(m.clientsInvited)],
    ["Rutas", String(m.routes)],
    ["Análisis de CV (mes)", String(m.cvRunsMonth)],
    ["Análisis de CV (total)", String(m.cvRunsTotal)],
    ["Costo IA (mes)", fmtUsd(m.llmCostMonthUsd)],
  ];

  return (
    <>
      <Link href="/platform" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Tenants
      </Link>
      <div className="mb-5 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t.name}</h1>
        {t.status === "active" ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Suspendido</Badge>}
        {t.isMain ? <Badge>Principal</Badge> : null}
      </div>
      <p className="-mt-3 mb-5 text-sm text-stone-600">
        {t.domain ? (
          <a href={`https://${t.domain}`} target="_blank" rel="noreferrer" className="hover:underline">
            {t.domain}
          </a>
        ) : (
          "Sin dominio"
        )}{" "}
        · creado el {fmtDate(t.createdAt)} · última actividad {fmtDate(m.lastActivityAt)}
      </p>

      {msg ? (
        <div className="mb-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-semibold text-stone-500">{label}</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-4 sm:p-6">
          <h2 className="font-bold">Datos</h2>
          <Field label="Nombre" htmlFor="tenant-name">
            <Input id="tenant-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => update(t.status, "Nombre actualizado.")} disabled={name.trim() === t.name || name.trim().length < 2} loading={busy === "update" && !statusOpen}>
              Guardar nombre
            </Button>
            {t.isMain ? null : t.status === "active" ? (
              <Button variant="ghost" className="text-red-700" onClick={() => setStatusOpen(true)}>
                Suspender
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => update("active", "Tenant reactivado.")} loading={busy === "update"}>
                Reactivar
              </Button>
            )}
          </div>
          {t.isMain ? <p className="text-xs text-stone-500">El tenant principal no se puede suspender.</p> : null}
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-bold">Administradores</h2>
            <InviteAdmin tenantId={t.id} onDone={(d, email) => (setT(d), setMsg({ tone: "success", text: `Invitación enviada a ${email}.` }))} />
          </div>
          {t.admins.length === 0 ? <p className="text-sm text-stone-600">Sin administradores.</p> : null}
          <ul className="divide-y divide-stone-100">
            {t.admins.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">{a.name}</p>
                  <p className="truncate text-stone-600">{a.email}</p>
                  <p className="text-xs text-stone-500">{a.status === "invited" ? "Invitación pendiente" : `Último acceso: ${fmtDate(a.lastLoginAt)}`}</p>
                </div>
                {a.status === "invited" ? (
                  <Button size="sm" variant="secondary" onClick={() => resend(a)} loading={busy === `resend-${a.id}`}>
                    Reenviar invitación
                  </Button>
                ) : a.status === "active" ? (
                  <Button size="sm" variant="secondary" onClick={() => impersonate(a)} loading={busy === `imp-${a.id}`} title="Modo soporte: ver el panel como este administrador">
                    Entrar como {a.name.split(" ")[0]}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {t.isMain ? null : (
        <Card className="mt-6 p-4 sm:p-6">
          <button onClick={() => setShowSetup((v) => !v)} className="flex w-full items-center justify-between text-left">
            <h2 className="font-bold">Preparar el dominio {t.domain}</h2>
            <span className="text-sm font-semibold text-stone-500">{showSetup ? "Ocultar" : "Ver pasos"}</span>
          </button>
          {showSetup && t.domain ? (
            <div className="mt-4">
              <SetupInstructions fqdn={t.domain} sub={sub} />
            </div>
          ) : null}
        </Card>
      )}

      <ConfirmDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        title={`¿Suspender ${t.name}?`}
        description="Nadie de este tenant podrá entrar (verán «Este espacio está suspendido temporalmente»). No se borra nada y puedes reactivarlo cuando quieras."
        confirmLabel="Suspender"
        onConfirm={() => update("suspended", "Tenant suspendido.")}
        loading={busy === "update"}
      />
    </>
  );
}

function InviteAdmin({ tenantId, onDone }: { tenantId: string; onDone: (d: TenantDetailDTO, email: string) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await api<TenantDetailDTO>(`/platform/tenants/${tenantId}/admins`, { body: form }), form.email);
      setOpen(false);
      setForm({ name: "", email: "" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Invitar
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Invitar administrador">
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Nombre" htmlFor="a-name">
            <Input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Correo" htmlFor="a-email">
            <Input id="a-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Enviar invitación
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
