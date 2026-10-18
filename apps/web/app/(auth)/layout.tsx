import { getBranding } from "@/lib/server";
import { BrandMark } from "@/components/brand";

/** Centered card layout shared by login, password recovery and invitation pages. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-primary-soft px-4 py-10">
      <div className="mb-8">
        <BrandMark b={b} size="lg" />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      <a href="/privacy" className="mt-6 text-xs text-stone-500 underline-offset-2 hover:underline">
        Política de privacidad
      </a>
    </main>
  );
}
