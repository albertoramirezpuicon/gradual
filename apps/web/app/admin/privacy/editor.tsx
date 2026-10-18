"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { PolicyDTO, PolicyVersionDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell";
import { PolicyText } from "@/components/policy-text";
import { Alert, Button, Card, Textarea, cn } from "@/components/ui";

/** Matches unfilled placeholders such as [RUC] in the draft. */
const PLACEHOLDER = /\[[A-ZÁÉÍÓÚÑ ]{3,}\]/g;

/** Markdown editor for the privacy policy. Each publish creates a new version (D24 / D32). */
export function PolicyEditor({ current, versions: initialVersions }: { current: PolicyDTO | null; versions: PolicyVersionDTO[] }) {
  const [text, setText] = useState(current?.content ?? "");
  const [base, setBase] = useState(current?.content ?? "");
  const [versions, setVersions] = useState(initialVersions);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const placeholders = [...new Set(text.match(PLACEHOLDER) ?? [])];
  const dirty = text.trim() !== base.trim();

  async function publish() {
    setLoading(true);
    setMsg(null);
    try {
      const p = await api<PolicyDTO>("/admin/policies", { body: { content: text.trim() } });
      setBase(text.trim());
      setVersions((v) => [{ id: p.id, version: p.version, publishedAt: p.publishedAt, acceptances: 0 }, ...v]);
      setMsg({ tone: "success", text: `Versión ${p.version} publicada. Tus clientes la aceptarán en su próximo ingreso.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader
        title="Política de privacidad"
        description="Tus clientes la aceptan al activar su cuenta. Cada vez que publiques cambios, se les pedirá aceptarla de nuevo."
      />
      {msg ? (
        <div className="mb-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}
      {placeholders.length ? (
        <div className="mb-4">
          <Alert tone="warning">
            Campos por completar:{" "}
            {placeholders.map((p) => (
              <code key={p} className="mr-1 rounded bg-amber-100 px-1">
                {p}
              </code>
            ))}
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <Card className="p-4 sm:p-6">
          <div className="mb-3 flex w-fit gap-1 rounded-lg bg-stone-100 p-1 text-sm font-semibold">
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5", tab === t ? "bg-white shadow-sm" : "text-stone-600")}>
                {t === "edit" ? "Editar" : "Vista previa"}
              </button>
            ))}
          </div>
          {tab === "edit" ? (
            <>
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={28} className="font-mono text-[13px]" aria-label="Texto de la política" />
              <p className="mt-2 text-xs text-stone-500">
                Formato: <code># Título</code>, <code>## Sección</code>, <code>**negrita**</code>, <code>- lista</code>.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-stone-200 p-5">
              <PolicyText content={text} />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || text.trim().length < 50}>
              Publicar nueva versión
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={() => setText(base)}>
                Descartar cambios
              </Button>
            ) : null}
          </div>
        </Card>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-600">Versiones publicadas</p>
          <Card className="divide-y divide-stone-100">
            {versions.map((v, i) => (
              <div key={v.id} className="p-3 text-sm">
                <p className="font-semibold">
                  Versión {v.version} {i === 0 ? <span className="ml-1 text-xs font-semibold text-primary">vigente</span> : null}
                </p>
                <p className="text-xs text-stone-500">{fmt(v.publishedAt)}</p>
                <p className="text-xs text-stone-500">{v.acceptances} aceptación(es)</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-stone-900/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
            <Dialog.Title className="text-lg font-bold">¿Publicar la versión {(versions[0]?.version ?? 0) + 1}?</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-stone-600">
              Todos tus clientes deberán aceptarla la próxima vez que ingresen. Las versiones anteriores quedan guardadas.
            </Dialog.Description>
            {placeholders.length ? (
              <div className="mt-3">
                <Alert tone="warning">Aún hay campos por completar.</Alert>
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="ghost">Cancelar</Button>
              </Dialog.Close>
              <Button onClick={publish} loading={loading}>
                Publicar
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
