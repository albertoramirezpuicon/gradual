"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailTemplateContent, EmailTemplateDTO, EmailTemplateKey } from "@gradual/shared";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell";
import { ConfirmDialog } from "@/components/modal";
import { Alert, Badge, Button, Card, Field, Input, Textarea, cn } from "@/components/ui";

type Msg = { tone: "success" | "error"; text: string } | null;
type FieldName = keyof EmailTemplateContent;

const same = (a: EmailTemplateContent, b: EmailTemplateContent) => a.subject === b.subject && a.body === b.body && a.buttonLabel === b.buttonLabel;

/** Tenant admins edit the text of their emails; the layout stays fixed (D57–D59). */
export function EmailsEditor({ initial }: { initial: EmailTemplateDTO[] }) {
  const [templates, setTemplates] = useState(initial);
  const [key, setKey] = useState<EmailTemplateKey>(initial[0]!.key);
  const t = templates.find((x) => x.key === key)!;
  const [draft, setDraft] = useState<EmailTemplateContent>({ subject: t.subject, body: t.body, buttonLabel: t.buttonLabel });
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<"save" | "test" | "restore" | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [focus, setFocus] = useState<FieldName>("body");
  const refs = { subject: useRef<HTMLInputElement>(null), body: useRef<HTMLTextAreaElement>(null), buttonLabel: useRef<HTMLInputElement>(null) };
  const saved: EmailTemplateContent = { subject: t.subject, body: t.body, buttonLabel: t.buttonLabel };
  const dirty = !same(draft, saved);

  function select(k: EmailTemplateKey) {
    if (dirty && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos?")) return;
    const n = templates.find((x) => x.key === k)!;
    setKey(k);
    setDraft({ subject: n.subject, body: n.body, buttonLabel: n.buttonLabel });
    setMsg(null);
  }

  // Live preview, debounced
  useEffect(() => {
    const id = setTimeout(() => {
      api<{ subject: string; html: string }>(`/admin/email-templates/${key}/preview`, { body: draft })
        .then(setPreview)
        .catch(() => {});
    }, 400);
    return () => clearTimeout(id);
  }, [key, draft]);

  /** Inserts {{variable}} at the cursor of the last focused field. */
  function insertVar(v: string) {
    const el = refs[focus].current;
    const token = `{{${v}}}`;
    const value = draft[focus];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setDraft((d) => ({ ...d, [focus]: value.slice(0, start) + token + value.slice(end) }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const r = await api<{ isCustom: boolean }>(`/admin/email-templates/${key}`, { method: "PUT", body: draft });
      setTemplates((ts) => ts.map((x) => (x.key === key ? { ...x, ...draft, isCustom: r.isCustom } : x)));
      setMsg({ tone: "success", text: "Correo guardado. Se usará en los próximos envíos." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    setMsg(null);
    try {
      const r = await api<{ to: string }>(`/admin/email-templates/${key}/test`, { body: draft });
      setMsg({ tone: "success", text: `Te enviamos una prueba a ${r.to}.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      const d = await api<EmailTemplateContent>(`/admin/email-templates/${key}`, { method: "DELETE" });
      setTemplates((ts) => ts.map((x) => (x.key === key ? { ...x, ...d, isCustom: false } : x)));
      setDraft({ subject: d.subject, body: d.body, buttonLabel: d.buttonLabel });
      setMsg({ tone: "success", text: "Se restauró el texto original." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
      setRestoreOpen(false);
    }
  }

  return (
    <>
      <PageHeader title="Correos" description="Personaliza el texto de los correos que envía la plataforma. El diseño, tu logo y tus colores se aplican automáticamente." />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {templates.map((x) => (
          <button
            key={x.key}
            onClick={() => select(x.key)}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition",
              x.key === key ? "border-primary bg-primary-soft text-primary" : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
            )}
          >
            {x.label}
            {x.isCustom ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-stone-500">editado</span> : null}
          </button>
        ))}
      </div>

      {msg ? (
        <div className="mb-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4 p-4 sm:p-6">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold">{t.label}</h2>
              {t.isCustom ? <Badge>Personalizado</Badge> : <Badge tone="success">Texto original</Badge>}
            </div>
            <p className="mt-1 text-sm text-stone-600">{t.description}</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-stone-600">Variables (toca para insertar donde está el cursor):</p>
            <div className="flex flex-wrap gap-1.5">
              {t.variables.map((v) => (
                <button
                  key={v}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVar(v)}
                  className="rounded-md bg-stone-100 px-2 py-1 font-mono text-xs text-stone-700 hover:bg-stone-200"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          <Field label="Asunto" htmlFor="tpl-subject">
            <Input id="tpl-subject" ref={refs.subject} value={draft.subject} maxLength={200} onFocus={() => setFocus("subject")} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </Field>
          <Field label="Mensaje" htmlFor="tpl-body" hint="Deja una línea en blanco para separar párrafos.">
            <Textarea id="tpl-body" ref={refs.body} rows={9} value={draft.body} maxLength={5000} onFocus={() => setFocus("body")} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
          <Field label="Texto del botón" htmlFor="tpl-button">
            <Input id="tpl-button" ref={refs.buttonLabel} value={draft.buttonLabel} maxLength={60} onFocus={() => setFocus("buttonLabel")} onChange={(e) => setDraft({ ...draft, buttonLabel: e.target.value })} />
          </Field>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={save} loading={busy === "save"} disabled={!dirty || !draft.subject.trim() || !draft.body.trim() || !draft.buttonLabel.trim()}>
              Guardar
            </Button>
            <Button variant="secondary" onClick={sendTest} loading={busy === "test"}>
              Enviarme una prueba
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={() => setDraft(saved)}>
                Descartar cambios
              </Button>
            ) : null}
            {t.isCustom || !same(draft, t.defaults) ? (
              <Button variant="ghost" onClick={() => setRestoreOpen(true)}>
                Restaurar texto original
              </Button>
            ) : null}
          </div>
        </Card>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-600">Vista previa (con datos de ejemplo)</p>
          <Card className="overflow-hidden">
            <div className="border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm">
              <span className="text-stone-500">Asunto: </span>
              <span className="font-semibold">{preview?.subject ?? "…"}</span>
            </div>
            <iframe title="Vista previa del correo" sandbox="" srcDoc={preview?.html ?? ""} className="h-[560px] w-full bg-white" />
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title="¿Restaurar el texto original?"
        description="Se perderá tu versión personalizada de este correo."
        confirmLabel="Restaurar"
        onConfirm={restore}
        loading={busy === "restore"}
      />
    </>
  );
}
