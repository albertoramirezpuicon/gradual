"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CV_MAX_BYTES, type CvRunDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { formatBytes, putWithProgress } from "@/lib/upload";
import { FileIcon } from "@/components/icons";
import { Alert, Button, cn } from "@/components/ui";

/**
 * PDF picker + upload to S3 + run creation. On success navigates to `${detailBase}/${runId}`.
 * `clientId` is passed when the admin starts a run on behalf of a client.
 */
export function CvUpload({ clientId, detailBase, disabled }: { clientId?: string; detailBase: string; disabled?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (f.type !== "application/pdf") return setError("Sube tu CV en formato PDF.");
    if (f.size > CV_MAX_BYTES) return setError("El PDF no puede superar 5 MB.");
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { key, url } = await api<{ key: string; url: string }>("/cv/upload-url", {
        body: { mime: file.type, size: file.size, fileName: file.name, clientId },
      });
      setProgress(0);
      await putWithProgress(url, file, setProgress).catch(() => {
        throw new Error("No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.");
      });
      const run = await api<CvRunDTO>("/cv/runs", { body: { key, fileName: file.name, clientId } });
      router.push(`${detailBase}/${run.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Alert>{error}</Alert> : null}
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition disabled:opacity-50",
          drag ? "border-primary bg-primary-soft" : "border-stone-300 bg-stone-50 hover:border-primary/60",
        )}
      >
        <span className="text-primary">
          <FileIcon />
        </span>
        {file ? (
          <>
            <span className="font-semibold">{file.name}</span>
            <span className="text-xs text-stone-500">{formatBytes(file.size)} · toca para cambiarlo</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Elige tu CV en PDF</span>
            <span className="text-xs text-stone-500">o arrástralo aquí · máximo 5 MB</span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      {progress !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <Button className="w-full sm:w-auto" onClick={submit} disabled={!file || disabled} loading={busy}>
        {progress !== null && progress < 100 ? `Subiendo ${progress}%` : busy ? "Leyendo tu CV…" : "Mejorar CV"}
      </Button>
    </div>
  );
}
