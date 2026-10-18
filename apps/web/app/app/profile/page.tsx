import type { Metadata } from "next";
import { getMe } from "@/lib/server";
import { PageHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { ChangePassword } from "./change-password";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function Page() {
  const me = (await getMe())!;
  return (
    <>
      <PageHeader title="Mi perfil" />
      <div className="grid max-w-xl gap-6">
        <Card className="p-6 text-sm">
          <p className="text-stone-500">Nombre</p>
          <p className="font-semibold">{me.name}</p>
          <p className="mt-3 text-stone-500">Correo</p>
          <p className="font-semibold">{me.email}</p>
          <a href="/privacy" className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">
            Ver política de privacidad
          </a>
        </Card>
        <ChangePassword />
      </div>
    </>
  );
}
