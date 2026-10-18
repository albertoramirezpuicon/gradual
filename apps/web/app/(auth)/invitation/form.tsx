"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";
import { usePasswordFields } from "@/components/password-fields";

export function InvitationForm(p: { token: string; email: string; name: string; policy: React.ReactNode }) {
  const pw = usePasswordFields();
  const [name, setName] = useState(p.name);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const valid = pw.valid && accepted && name.trim().length >= 2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await api("/auth/invitation/accept", {
        body: { token: p.token, name, password: pw.value, acceptPolicy: true },
      });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Activa tu cuenta</h1>
        <p className="mt-1 text-sm text-stone-600">
          Crearás tu acceso para <b>{p.email}</b>.
        </p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Tu nombre" htmlFor="name">
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </Field>
      {pw.fields}

      {p.policy ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Política de privacidad</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4">{p.policy}</div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--brand-primary)]"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>He leído la política de privacidad y doy mi consentimiento para el tratamiento de mis datos personales.</span>
          </label>
        </div>
      ) : null}

      <Button type="submit" className="w-full" loading={loading} disabled={!valid}>
        Activar mi cuenta
      </Button>
    </form>
  );
}
