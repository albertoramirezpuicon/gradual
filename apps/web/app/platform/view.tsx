"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TenantDetailDTO, TenantSummaryDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell";
import { Modal } from "@/components/modal";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/ui";
import { fmtDate, fmtUsd } from "./format";

/** List of tenants with usage metrics (D60). */
export function TenantsView({ initial }: { initial: TenantSummaryDTO[] }) {
  return (
    <>
      <PageHeader title="Tenants" description="Cada consultora tiene su propio espacio, marca, clientes y administradores." action={<CreateDialog />} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Tenant</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Clientes</th>
                <th className="px-4 py-3 text-right font-semibold">Rutas</th>
                <th className="px-4 py-3 text-right font-semibold">CV (mes)</th>
                <th className="px-4 py-3 text-right font-semibold">Costo IA (mes)</th>
                <th className="px-4 py-3 font-semibold">Última actividad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {initial.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <Link href={`/platform/tenants/${t.id}`} className="font-semibold hover:underline">
                      {t.name}
                    </Link>
                    {t.isMain ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">principal</span> : null}
                    <p className="text-xs text-stone-500">{t.domain ?? t.slug}</p>
                  </td>
                  <td className="px-4 py-3">{t.status === "active" ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Suspendido</Badge>}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {t.metrics.clientsActive}
                    {t.metrics.clientsInvited ? <span className="text-stone-500"> (+{t.metrics.clientsInvited} inv.)</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.metrics.routes}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{t.metrics.cvRunsMonth}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(t.metrics.llmCostMonthUsd)}</td>
                  <td className="px-4 py-3 text-stone-600">{fmtDate(t.metrics.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function CreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", subdomain: "", adminName: "", adminEmail: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api<TenantDetailDTO>("/platform/tenants", { body: form });
      router.push(`/platform/tenants/${t.id}?created=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Nuevo tenant</Button>
      <Modal open={open} onOpenChange={setOpen} title="Nuevo tenant" description="Se crea con la marca y la política de privacidad por defecto, y se invita a su primer administrador.">
        <form onSubmit={submit} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Nombre de la consultora" htmlFor="t-name">
            <Input id="t-name" value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Subdominio" htmlFor="t-sub" hint={`Quedará en ${form.subdomain.trim().toLowerCase() || "subdominio"}.genia.pro`}>
            <Input id="t-sub" value={form.subdomain} onChange={set("subdomain")} required placeholder="acme" autoCapitalize="none" autoCorrect="off" />
          </Field>
          <Field label="Nombre del administrador" htmlFor="t-admin">
            <Input id="t-admin" value={form.adminName} onChange={set("adminName")} required />
          </Field>
          <Field label="Correo del administrador" htmlFor="t-email">
            <Input id="t-email" type="email" value={form.adminEmail} onChange={set("adminEmail")} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Crear tenant
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
