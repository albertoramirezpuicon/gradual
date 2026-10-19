import type { Metadata } from "next";
import { requireUser } from "@/lib/server";
import { Shell, type NavItem } from "@/components/shell";

export const metadata: Metadata = { title: "Plataforma" };

const NAV: NavItem[] = [{ href: "/platform", label: "Tenants" }];

/** Platform owner area (D60–D61): only the superadmin. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser("superadmin");
  const brand = (
    <span className="text-lg font-bold tracking-tight text-stone-900">
      Gradual <span className="ml-1 rounded bg-stone-900 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-white">Plataforma</span>
    </span>
  );
  return (
    <Shell brand={brand} nav={NAV} userName={me.name}>
      {children}
    </Shell>
  );
}
