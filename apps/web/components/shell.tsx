"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/components/ui";

export interface NavItem {
  href: string;
  label: string;
  soon?: boolean;
}

async function logout() {
  await api("/auth/logout", { body: {} }).catch(() => {});
  window.location.href = "/login";
}

/** Sidebar on desktop, collapsible menu on mobile. */
export function Shell({ brand, nav, userName, children }: { brand: React.ReactNode; nav: NavItem[]; userName: string; children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/admin" || href === "/app" ? path === href : path.startsWith(href));

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map((n) =>
        n.soon ? (
          <span key={n.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-stone-400">
            {n.label}
            <span className="text-[10px] font-semibold uppercase tracking-wide">Pronto</span>
          </span>
        ) : (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              isActive(n.href) ? "bg-primary-soft text-primary font-semibold" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            {n.label}
          </Link>
        ),
      )}
    </nav>
  );

  const footer = (
    <div className="border-t border-stone-200 pt-4 text-sm">
      <p className="truncate font-semibold text-stone-800">{userName}</p>
      <button onClick={logout} className="mt-1 text-stone-500 hover:text-stone-800 hover:underline">
        Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-stone-200 bg-white p-4 lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <div className="space-y-6">
          <div className="px-3 pt-2">{brand}</div>
          {links}
        </div>
        {footer}
      </aside>

      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3 lg:hidden">
        {brand}
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium"
          aria-expanded={open}
        >
          Menú
        </button>
      </header>
      {open ? (
        <div className="space-y-4 border-b border-stone-200 bg-white p-4 lg:hidden">
          {links}
          {footer}
        </div>
      ) : null}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-stone-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
