import type { Metadata } from "next";
import Link from "next/link";
import type { InvitationDTO } from "@gradual/shared";
import { serverFetch } from "@/lib/server";
import { PolicyText } from "@/components/policy-text";
import { InvitationForm } from "./form";

export const metadata: Metadata = { title: "Activa tu cuenta" };

/** Validates the invitation token server-side before showing the activation form. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const r = token ? await serverFetch(`/auth/invitation/${encodeURIComponent(token)}`) : null;

  if (!r || !r.ok) {
    const msg = r ? ((await r.json().catch(() => ({}))) as { error?: string }).error : null;
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Invitación no válida</h1>
        <p className="text-sm text-stone-600">
          {msg ?? "El enlace está incompleto."} Si ya activaste tu cuenta, puedes ingresar directamente.
        </p>
        <Link href="/login" className="text-sm font-semibold text-primary hover:underline">
          Ir a ingresar
        </Link>
      </div>
    );
  }

  const inv = (await r.json()) as InvitationDTO;
  return (
    <InvitationForm
      token={token!}
      email={inv.email}
      name={inv.name}
      policy={inv.policy ? <PolicyText content={inv.policy.content} /> : null}
    />
  );
}
