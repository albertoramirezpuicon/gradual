"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  RESOURCE_MAX_BYTES,
  RESOURCE_MIME,
  RESOURCE_TYPES,
  parseYouTubeId,
  type ResourceDTO,
  type ResourceType,
} from "@gradual/shared";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { RESOURCE_LABEL, ResourceIcon } from "@/components/icons";
import { Alert, Button, Field, Input, Textarea, cn } from "@/components/ui";

// The rich text editor is heavy; load it only when a "text" resource is being edited.
const RichTextEditor = dynamic(() => import("@/components/rich-text-editor").then((m) => m.RichTextEditor), {
  ssr: false,
  loading: () => <div className="h-48 animate-pulse rounded-lg bg-stone-100" />,
});

export const formatBytes = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Uploads a file to its signed S3 URL with progress reporting (XHR, since fetch has no upload progress). */
function putWithProgress(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")));
    xhr.onerror = () => reject(new Error("upload"));
    xhr.send(file);
  });
}

/** Create or edit a resource of any of the four types (D15). */
export function ResourceDialog({
  open,
  onOpenChange,
  stageId,
  resource,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stageId: string;
  resource: ResourceDTO | null;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ResourceType>("file");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [html, setHtml] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setType(resource?.type ?? "file");
    setTitle(resource?.title ?? "");
    setDescription(resource?.description ?? "");
    setUrl(resource?.url ?? "");
    setHtml(resource?.html ?? "");
    setFile(null);
    setProgress(null);
    setError(null);
    setSaving(false);
  }, [open, resource]);

  const keepsCurrentFile = resource?.type === "file" && type === "file" && !file;
  const youtubeId = type === "video" ? parseYouTubeId(url) : null;

  function pickFile(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!(f.type in RESOURCE_MIME)) return setError("Formato no permitido. Usa PDF, Word (DOCX) o PowerPoint (PPTX).");
    if (f.size > RESOURCE_MAX_BYTES) return setError("El archivo no puede superar 20 MB.");
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let body: Record<string, unknown> = { type, title, description };
      if (type === "file") {
        if (file) {
          const { key, url: putUrl } = await api<{ key: string; url: string }>("/admin/resources/upload-url", {
            body: { mime: file.type, size: file.size, fileName: file.name },
          });
          setProgress(0);
          await putWithProgress(putUrl, file, setProgress).catch(() => {
            throw new Error("No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.");
          });
          body = { ...body, key, fileName: file.name };
        } else if (!keepsCurrentFile) {
          throw new Error("Selecciona un archivo.");
        }
      } else if (type === "link" || type === "video") body = { ...body, url };
      else body = { ...body, html };

      if (resource) await api(`/admin/resources/${resource.id}`, { method: "PUT", body });
      else await api(`/admin/stages/${stageId}/resources`, { body });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
      setProgress(null);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={resource ? "Editar recurso" : "Agregar recurso"} wide>
      <form onSubmit={save} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}

        <div>
          <p className="mb-1.5 text-sm font-semibold">Tipo</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Tipo de recurso">
            {RESOURCE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold",
                  type === t ? "border-primary bg-primary-soft text-primary" : "border-stone-300 text-stone-700 hover:bg-stone-50",
                )}
              >
                <ResourceIcon type={t} />
                {RESOURCE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {type === "file" ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Archivo</p>
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                {file || keepsCurrentFile ? "Cambiar archivo" : "Elegir archivo"}
              </Button>
              <span className="min-w-0 truncate text-sm text-stone-700">
                {file ? `${file.name} · ${formatBytes(file.size)}` : keepsCurrentFile ? `${resource!.fileName} · ${formatBytes(resource!.sizeBytes ?? 0)}` : "PDF, DOCX o PPTX · máx. 20 MB"}
              </span>
              <input ref={fileRef} type="file" className="hidden" accept={Object.keys(RESOURCE_MIME).join(",")} onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
            {progress !== null ? (
              <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        {type === "link" || type === "video" ? (
          <Field
            label={type === "video" ? "Enlace de YouTube" : "Enlace"}
            htmlFor="res-url"
            hint={type === "video" ? (youtubeId ? "Video reconocido ✓" : "Pega el enlace del video (youtube.com o youtu.be).") : "Se abrirá en una pestaña nueva."}
          >
            <Input id="res-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" required />
          </Field>
        ) : null}

        <Field label="Título" htmlFor="res-title">
          <Input id="res-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={160} />
        </Field>

        {type === "text" ? (
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Contenido</p>
            <RichTextEditor value={html} onChange={setHtml} />
          </div>
        ) : (
          <Field label="Descripción (opcional)" htmlFor="res-desc">
            <Textarea id="res-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            {progress !== null && progress < 100 ? `Subiendo ${progress}%` : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
