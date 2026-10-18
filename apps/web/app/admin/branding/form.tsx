"use client";

import { useEffect, useRef, useState } from "react";
import { FONTS, LOGO_MAX_BYTES, LOGO_MIME, type Branding, type FontName } from "@gradual/shared";
import { api } from "@/lib/api";
import { fontHref, onColor } from "@/lib/theme";
import { PageHeader } from "@/components/shell";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";

const HEX = /^#[0-9a-fA-F]{6}$/;

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label} htmlFor={id}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} (selector)`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded-lg border border-stone-300 bg-white p-1"
        />
        <Input
          id={id}
          value={text}
          maxLength={7}
          className="w-32 font-mono uppercase"
          onChange={(e) => {
            setText(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toUpperCase());
          }}
        />
      </div>
    </Field>
  );
}

export function BrandingForm({ initial }: { initial: Branding }) {
  const [b, setB] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = b.brandName !== saved.brandName || b.primaryColor !== saved.primaryColor || b.secondaryColor !== saved.secondaryColor || b.font !== saved.font;

  // Load the selected font for the live preview
  useEffect(() => {
    const id = "preview-font";
    let link = document.getElementById(id) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = fontHref(b.font);
  }, [b.font]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await api<Branding>("/admin/branding", {
        method: "PUT",
        body: { brandName: b.brandName, primaryColor: b.primaryColor, secondaryColor: b.secondaryColor, font: b.font },
      });
      setSaved(r);
      setB(r);
      // Reload so the new branding applies across the whole app
      window.location.reload();
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    setMsg(null);
    if (!(LOGO_MIME as readonly string[]).includes(file.type)) {
      setMsg({ tone: "error", text: "Formato no permitido. Usa PNG, JPG, SVG o WebP." });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setMsg({ tone: "error", text: "El logo no puede superar 2 MB." });
      return;
    }
    setUploading(true);
    try {
      const { key, url } = await api<{ key: string; url: string }>("/admin/branding/logo/upload-url", {
        body: { mime: file.type, size: file.size },
      });
      const put = await fetch(url, { method: "PUT", body: file, headers: { "content-type": file.type } });
      if (!put.ok) throw new Error("No se pudo subir el archivo. Inténtalo de nuevo.");
      const r = await api<Branding>("/admin/branding/logo/confirm", { body: { key } });
      setB((x) => ({ ...x, logoUrl: r.logoUrl }));
      setSaved((x) => ({ ...x, logoUrl: r.logoUrl }));
      setMsg({ tone: "success", text: "Logo actualizado." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeLogo() {
    const r = await api<Branding>("/admin/branding/logo", { method: "DELETE" });
    setB((x) => ({ ...x, logoUrl: r.logoUrl }));
    setSaved((x) => ({ ...x, logoUrl: r.logoUrl }));
  }

  const previewVars = {
    "--brand-primary": b.primaryColor,
    "--brand-on-primary": onColor(b.primaryColor),
    "--brand-secondary": b.secondaryColor,
    "--brand-on-secondary": onColor(b.secondaryColor),
    fontFamily: `"${b.font}", system-ui, sans-serif`,
  } as React.CSSProperties;

  return (
    <>
      <PageHeader title="Marca" description="Logo, colores y tipografía que verán tus clientes en la plataforma y en los correos." />
      {msg ? (
        <div className="mb-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="space-y-6 p-6">
          <div className="space-y-2">
            <p className="text-sm font-semibold">Logo</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 p-2">
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="Logo actual" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-stone-500">Sin logo</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                  {b.logoUrl ? "Cambiar" : "Subir logo"}
                </Button>
                {b.logoUrl ? (
                  <Button variant="ghost" size="sm" onClick={removeLogo}>
                    Quitar
                  </Button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={LOGO_MIME.join(",")}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
              />
            </div>
            <p className="text-xs text-stone-500">PNG, JPG, SVG o WebP. Máximo 2 MB. Se recomienda fondo transparente.</p>
          </div>

          <Field label="Nombre de la marca" htmlFor="brandName" hint="Se muestra si no hay logo, en el título de la pestaña y en los correos.">
            <Input id="brandName" value={b.brandName} maxLength={80} onChange={(e) => setB({ ...b, brandName: e.target.value })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField id="primaryColor" label="Color principal" value={b.primaryColor} onChange={(v) => setB({ ...b, primaryColor: v })} />
            <ColorField id="secondaryColor" label="Color secundario" value={b.secondaryColor} onChange={(v) => setB({ ...b, secondaryColor: v })} />
          </div>

          <Field label="Tipografía" htmlFor="font">
            <Select id="font" value={b.font} onChange={(e) => setB({ ...b, font: e.target.value as FontName })}>
              {FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-2">
            <Button onClick={save} loading={saving} disabled={!dirty || b.brandName.trim().length === 0}>
              Guardar cambios
            </Button>
            {dirty ? (
              <Button variant="ghost" onClick={() => setB({ ...saved })}>
                Descartar
              </Button>
            ) : null}
          </div>
        </Card>

        <div>
          <p className="mb-2 text-sm font-semibold text-stone-600">Vista previa</p>
          <div style={previewVars} className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="px-5 py-4" style={{ background: "var(--brand-primary)", color: "var(--brand-on-primary)" }}>
              <p className="text-lg font-bold">{b.brandName || "Tu marca"}</p>
              <p className="text-sm opacity-90">Tu ruta de empleabilidad</p>
            </div>
            <div className="space-y-3 p-5">
              <p className="font-semibold">Etapa 1 · Mis fortalezas</p>
              <p className="text-sm text-stone-600">Identifica tus logros y habilidades antes de escribir tu CV.</p>
              <div className="flex gap-2">
                <span className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--brand-primary)", color: "var(--brand-on-primary)" }}>
                  Ver recursos
                </span>
                <span className="rounded-lg px-3 py-1.5 text-sm font-semibold" style={{ background: "var(--brand-secondary)", color: "var(--brand-on-secondary)" }}>
                  Completada
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
