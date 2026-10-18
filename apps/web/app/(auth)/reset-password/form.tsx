"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Alert, Button } from "@/components/ui";
import { usePasswordFields } from "@/components/password-fields";

export function ResetForm({ token }: { token: string }) {
  const pw = usePasswordFields();
  const [error, setError] = useState<string | null>(token ? null : "El enlace está incompleto. Solicita uno nuevo.");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.valid) return;
    setLoading(true);
    setError(null);
    try {
      await api("/auth/reset-password", { body: { token, password: pw.value } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <h1 className="text-xl font-bold">Crea una nueva contraseña</h1>
      {error ? (
        <Alert>
          {error}{" "}
          <Link href="/forgot-password" className="font-semibold underline">
            Solicitar otro enlace
          </Link>
        </Alert>
      ) : null}
      {pw.fields}
      <Button type="submit" className="w-full" loading={loading} disabled={!pw.valid || !token}>
        Guardar contraseña
      </Button>
    </form>
  );
}
