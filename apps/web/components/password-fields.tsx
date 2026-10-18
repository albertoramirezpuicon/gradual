"use client";

import { useState } from "react";
import { PASSWORD_MIN } from "@gradual/shared";
import { Field, PasswordInput } from "@/components/ui";

/** Password + confirmation fields. `valid` is true only when both match and meet the minimum length. */
export function usePasswordFields() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const error =
    p1.length > 0 && p1.length < PASSWORD_MIN
      ? `Usa al menos ${PASSWORD_MIN} caracteres.`
      : p2.length > 0 && p1 !== p2
        ? "Las contraseñas no coinciden."
        : null;
  const valid = p1.length >= PASSWORD_MIN && p1 === p2;
  const fields = (
    <>
      <Field label="Nueva contraseña" htmlFor="p1" hint={`Mínimo ${PASSWORD_MIN} caracteres. Puede ser una frase.`}>
        <PasswordInput id="p1" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
      </Field>
      <Field label="Repite la contraseña" htmlFor="p2">
        <PasswordInput id="p2" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
      </Field>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </>
  );
  return { fields, valid, value: p1 };
}
