"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Button, Card, Field, PasswordInput } from "@/components/ui";
import { usePasswordFields } from "@/components/password-fields";

type Msg = { tone: "success" | "error"; text: string } | null;

/** The form remounts after saving to clear its fields; the status message lives outside it. */
export function ChangePassword() {
  const [key, setKey] = useState(0);
  const [msg, setMsg] = useState<Msg>(null);
  return <PasswordForm key={key} msg={msg} setMsg={setMsg} onDone={() => setKey((k) => k + 1)} />;
}

function PasswordForm({ msg, setMsg, onDone }: { msg: Msg; setMsg: (m: Msg) => void; onDone: () => void }) {
  const pw = usePasswordFields();
  const [currentPassword, setCurrentPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await api("/auth/change-password", { body: { currentPassword, newPassword: pw.value } });
      setMsg({ tone: "success", text: "Contraseña actualizada. Cerramos tus otras sesiones abiertas." });
      onDone();
    } catch (err) {
      setMsg({ tone: "error", text: (err as Error).message });
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <h2 className="font-bold">Cambiar contraseña</h2>
        {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
        <Field label="Contraseña actual" htmlFor="currentPassword">
          <PasswordInput id="currentPassword" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        {pw.fields}
        <Button type="submit" loading={loading} disabled={!pw.valid || !currentPassword}>
          Guardar
        </Button>
      </form>
    </Card>
  );
}
