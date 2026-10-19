"use client";

import { useState } from "react";
import Link from "next/link";
import type { CvStandardsDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { PolicyText } from "@/components/policy-text";
import { Alert, Button, Card, Field, Input, Textarea, cn } from "@/components/ui";

const fmt = (d: string) => new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" });

/** Admin editor for the CV improvement standards (D20) and the CV footer text (D47). */
export function StandardsEditor({ initial }: { initial: CvStandardsDTO }) {
  const [data, setData] = useState(initial);
  const [text, setText] = useState(initial.current.standards);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [footer, setFooter] = useState(initial.footerText);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = text.trim() !== data.current.standards.trim();

  const reload = async () => {
    const d = await api<CvStandardsDTO>("/cv/standards");
    setData(d);
    setText(d.current.standards);
  };

  async function publish() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<{ version: number }>("/cv/standards", { body: { standards: text.trim() } });
      await reload();
      setMsg({ tone: "success", text: `Versión ${r.version} guardada. Se usará en los próximos análisis.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  async function saveFooter() {
    setMsg(null);
    try {
      await api("/cv/settings", { method: "PUT", body: { footerText: footer } });
      setData((d) => ({ ...d, footerText: footer.trim() }));
      setMsg({ tone: "success", text: footer.trim() ? "Pie de página actualizado." : "Pie de página desactivado." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    }
  }

  return (
    <>
      <Link href="/admin/cv" className="text-sm font-semibold text-stone-500 hover:text-stone-800">
        ← Mejorador de CV
      </Link>
      <div className="mb-5 mt-2">
        <h1 className="text-2xl font-bold tracking-tight">Estándares de CV</h1>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Describe cómo debe ser un buen CV según tu metodología. La plataforma se encarga del formato del resultado; aquí solo defines los criterios.
        </p>
      </div>
      {msg ? (
        <div className="mb-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-6">
            <div className="mb-3 flex w-fit gap-1 rounded-lg bg-stone-100 p-1 text-sm font-semibold">
              {(["edit", "preview"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-3 py-1.5", tab === t ? "bg-white shadow-sm" : "text-stone-600")}>
                  {t === "edit" ? "Editar" : "Vista previa"}
                </button>
              ))}
            </div>
            {tab === "edit" ? (
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={26} className="font-mono text-[13px]" aria-label="Estándares" />
            ) : (
              <div className="rounded-lg border border-stone-200 p-5">
                <PolicyText content={text} />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setConfirmOpen(true)} disabled={!dirty || text.trim().length < 50}>
                Guardar nueva versión
              </Button>
              {dirty ? (
                <Button variant="ghost" onClick={() => setText(data.current.standards)}>
                  Descartar cambios
                </Button>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-3 p-4 sm:p-6">
            <Field
              label="Pie de página del CV"
              htmlFor="cv-footer"
              hint="Aparece en letra pequeña al final del PDF y del Word. Déjalo vacío para no mostrar nada."
            >
              <Input id="cv-footer" value={footer} maxLength={120} onChange={(e) => setFooter(e.target.value)} />
            </Field>
            <Button variant="secondary" size="sm" onClick={saveFooter} disabled={footer.trim() === data.footerText}>
              Guardar pie de página
            </Button>
          </Card>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-600">Versiones</p>
          <Card className="divide-y divide-stone-100">
            {data.versions.map((v, i) => (
              <div key={v.id} className="p-3 text-sm">
                <p className="font-semibold">
                  Versión {v.version} {i === 0 ? <span className="ml-1 text-xs font-semibold text-primary">vigente</span> : null}
                </p>
                <p className="text-xs text-stone-500">{fmt(v.createdAt)}</p>
                <p className="text-xs text-stone-500">{v.runs} análisis</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`¿Guardar la versión ${data.current.version + 1}?`}
        description="Se aplicará a los próximos análisis. Los análisis anteriores conservan la versión con la que se hicieron."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={publish} loading={saving}>
            Guardar
          </Button>
        </div>
      </Modal>
    </>
  );
}
