/** Shared formatting for the platform pages (user-facing, Spanish/Peru). */
export const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("es-PE", { timeZone: "America/Lima", day: "2-digit", month: "short", year: "numeric" }) : "—";

export const fmtUsd = (n: number | null) => (n == null ? "—" : `US$ ${n.toFixed(2)}`);
