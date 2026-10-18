import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { PolicyDTO } from "@gradual/shared";
import { getBranding, getMe, serverFetch } from "@/lib/server";
import { BrandMark } from "@/components/brand";
import { PolicyText } from "@/components/policy-text";
import { ConsentForm } from "./form";

export const metadata: Metadata = { title: "Política de privacidad actualizada" };

/** Shown to clients when a new policy version has been published and not yet accepted (D24). */
export default async function Page() {
  const me = await getMe();
  if (!me) redirect("/login");
  if (!me.requiresConsent) redirect("/");
  const [b, r] = await Promise.all([getBranding(), serverFetch("/auth/policy")]);
  const p = (await r.json()) as PolicyDTO;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <BrandMark b={b} />
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-bold">Actualizamos nuestra política de privacidad</h1>
        <p className="mt-1 text-sm text-stone-600">Para seguir usando la plataforma, revisa y acepta la versión {p.version}.</p>
        <div className="my-5 max-h-[50vh] overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-4">
          <PolicyText content={p.content} />
        </div>
        <ConsentForm policyId={p.id} />
      </div>
    </main>
  );
}
