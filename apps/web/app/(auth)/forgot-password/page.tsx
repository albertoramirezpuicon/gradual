"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api("/auth/forgot-password", { body: { email: f.get("email") } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Revisa tu correo</h1>
        <p className="text-sm text-stone-600">
          Si el correo está registrado, te enviamos un enlace para crear una nueva contraseña. El enlace vence en 1 hora.
        </p>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Recuperar contraseña</h1>
        <p className="mt-1 text-sm text-stone-600">Te enviaremos un enlace para crear una nueva.</p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Enviar enlace
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-stone-600 hover:underline">
          Volver
        </Link>
      </p>
    </form>
  );
}
