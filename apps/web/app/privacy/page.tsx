import type { Metadata } from "next";
import Link from "next/link";
import type { PolicyDTO } from "@gradual/shared";
import { getBranding, serverFetch } from "@/lib/server";
import { BrandMark } from "@/components/brand";
import { PolicyText } from "@/components/policy-text";

export const metadata: Metadata = { title: "Política de privacidad" };

/** Public page with the current privacy policy version. */
export default async function Page() {
  const [b, r] = await Promise.all([getBranding(), serverFetch("/auth/policy")]);
  const p = r.ok ? ((await r.json()) as PolicyDTO) : null;
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/">
        <BrandMark b={b} />
      </Link>
      <article className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
        {p ? (
          <>
            <PolicyText content={p.content} />
            <p className="mt-6 text-xs text-stone-500">
              Versión {p.version} · publicada el{" "}
              {new Date(p.publishedAt).toLocaleDateString("es-PE", { timeZone: "America/Lima", dateStyle: "long" })}
            </p>
          </>
        ) : (
          <p>No hay una política publicada.</p>
        )}
      </article>
    </main>
  );
}
