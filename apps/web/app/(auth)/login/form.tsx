"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Alert, Button, Field, Input, PasswordInput } from "@/components/ui";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await api("/auth/login", { body: { email: f.get("email"), password: f.get("password") } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Ingresar</h1>
        <p className="mt-1 text-sm text-stone-600">Accede con el correo al que te llegó la invitación.</p>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>
        Ingresar
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-primary underline-offset-2 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
      </p>
    </form>
  );
}
