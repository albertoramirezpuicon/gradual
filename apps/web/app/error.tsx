"use client";

/** Spanish fallback for unexpected rendering errors (customer-facing). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-bold">Algo salió mal</h1>
      <p className="max-w-sm text-sm text-stone-600">Ocurrió un error inesperado. Inténtalo de nuevo; si continúa, avísale a tu consultora.</p>
      <div className="mt-2 flex gap-2">
        <button onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">
          Reintentar
        </button>
        <a href="/" className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold">
          Ir al inicio
        </a>
      </div>
    </main>
  );
}
