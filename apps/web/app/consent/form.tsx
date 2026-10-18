"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button } from "@/components/ui";

export function ConsentForm({ policyId }: { policyId: string }) {
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/consent", { body: { policyId } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { body: {} }).catch(() => {});
    window.location.href = "/login";
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand-primary)]" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>He leído la política de privacidad y doy mi consentimiento para el tratamiento de mis datos personales.</span>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button onClick={accept} disabled={!accepted} loading={loading}>
          Aceptar y continuar
        </Button>
        <Button variant="ghost" onClick={logout}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
