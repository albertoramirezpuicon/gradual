import Link from "next/link";
import type { CvRunSummaryDTO } from "@gradual/shared";
import { runStatusLabel } from "@/components/cv-result";
import { Badge, Card } from "@/components/ui";

const fmt = (d: string) => new Date(d).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" });

/** History of CV runs (client: own; admin: all, with the client's name). */
export function CvRunList({ runs, hrefBase, showClient }: { runs: CvRunSummaryDTO[]; hrefBase: string; showClient?: boolean }) {
  if (!runs.length) {
    return (
      <Card className="p-8 text-center text-sm text-stone-600">
        Aún no hay análisis.
      </Card>
    );
  }
  return (
    <Card className="divide-y divide-stone-100">
      {runs.map((r) => (
        <Link key={r.id} href={`${hrefBase}/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-stone-50">
          <div className="min-w-0 flex-1 basis-48">
            <p className="truncate text-sm font-semibold">{showClient ? r.clientName : r.sourceFileName}</p>
            <p className="text-xs text-stone-500">
              {fmt(r.createdAt)}
              {showClient ? ` · ${r.sourceFileName}` : ""}
              {r.startedBy === "admin" ? " · iniciado por la consultora" : ""}
            </p>
          </div>
          {r.status === "done" ? (
            <span className="text-sm font-semibold tabular-nums">
              <span className="text-stone-500">{r.initialScore}</span> → <span className="text-primary">{r.finalScore}</span>
            </span>
          ) : (
            <Badge tone={r.status === "failed" ? "warning" : "neutral"}>{runStatusLabel[r.status]}</Badge>
          )}
        </Link>
      ))}
    </Card>
  );
}
