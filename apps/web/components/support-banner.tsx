"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/** Shown while the superadmin is acting as a tenant admin (support mode, D66). */
export function SupportBanner({ tenantName, adminName }: { tenantName: string; adminName: string }) {
  const [busy, setBusy] = useState(false);
  async function stop() {
    setBusy(true);
    await api("/auth/stop-impersonation", { body: {} }).catch(() => {});
    window.location.href = "/platform";
  }
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      <span>
        Modo soporte: estás viendo {tenantName} como {adminName}
      </span>
      <button onClick={stop} disabled={busy} className="rounded-md bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900 disabled:opacity-60">
        Volver a Plataforma
      </button>
    </div>
  );
}
