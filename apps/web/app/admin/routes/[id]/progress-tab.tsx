"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RouteProgressDTO } from "@gradual/shared";
import { api } from "@/lib/api";
import { CheckIcon } from "@/components/icons";
import { Card, Spinner } from "@/components/ui";

/** Client × stage progress matrix for one route (D41). Scrolls horizontally inside its card on phones. */
export function ProgressTab({ routeId }: { routeId: string }) {
  const [data, setData] = useState<RouteProgressDTO | null>(null);

  useEffect(() => {
    api<RouteProgressDTO>(`/admin/routes/${routeId}/progress`).then(setData);
  }, [routeId]);

  if (!data) {
    return (
      <div className="flex justify-center p-10 text-stone-500">
        <Spinner />
      </div>
    );
  }
  if (!data.clients.length) {
    return (
      <Card className="p-10 text-center">
        <p className="font-semibold">Ningún cliente tiene esta ruta</p>
        <p className="mt-1 text-sm text-stone-600">
          Asígnala desde la ficha de cada cliente, en{" "}
          <Link href="/admin/clients" className="font-semibold text-primary hover:underline">
            Clientes
          </Link>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-stone-500">
            <th className="sticky left-0 bg-white px-4 py-3 font-semibold uppercase tracking-wide">Cliente</th>
            {data.stages.map((s, i) => (
              <th key={s.id} className="min-w-24 px-3 py-3 text-center font-semibold" title={s.title}>
                <span className="block text-[10px] uppercase tracking-wide">Etapa {i + 1}</span>
                <span className="line-clamp-2 font-medium normal-case text-stone-700">{s.title}</span>
              </th>
            ))}
            <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Avance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {data.clients.map((c) => (
            <tr key={c.id}>
              <td className="sticky left-0 bg-white px-4 py-3">
                <Link href={`/admin/clients/${c.id}`} className="font-semibold hover:underline">
                  {c.name}
                </Link>
              </td>
              {data.stages.map((s) => (
                <td key={s.id} className="px-3 py-3 text-center">
                  {c.doneStageIds.includes(s.id) ? (
                    <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-on-primary" aria-label="Completada">
                      <CheckIcon />
                    </span>
                  ) : (
                    <span className="inline-block size-6 rounded-full border-2 border-stone-200" aria-label="Pendiente" />
                  )}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums text-stone-700">
                {c.doneStageIds.length}/{data.stages.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
