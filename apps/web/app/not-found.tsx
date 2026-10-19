import Link from "next/link";

/** Spanish 404 page (Next's default is in English, and this text is customer-facing). */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-xl font-bold">No encontramos esta página</h1>
      <p className="max-w-sm text-sm text-stone-600">Puede que el enlace esté incompleto o que el contenido ya no exista.</p>
      <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
        Ir al inicio
      </Link>
    </main>
  );
}
