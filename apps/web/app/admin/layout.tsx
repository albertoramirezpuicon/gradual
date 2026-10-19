import { getBranding, requireUser } from "@/lib/server";
import { BrandMark } from "@/components/brand";
import { Shell, type NavItem } from "@/components/shell";
import { SupportBanner } from "@/components/support-banner";

// Labels are user-facing (Spanish); paths are code (English).
const NAV: NavItem[] = [
  { href: "/admin", label: "Inicio" },
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/routes", label: "Rutas" },
  { href: "/admin/cv", label: "Mejorador de CV" },
  { href: "/admin/branding", label: "Marca" },
  { href: "/admin/emails", label: "Correos" },
  { href: "/admin/privacy", label: "Privacidad" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [me, b] = await Promise.all([requireUser("admin"), getBranding()]);
  const banner = me.impersonation ? <SupportBanner tenantName={me.impersonation.tenantName} adminName={me.name} /> : undefined;
  return (
    <Shell brand={<BrandMark b={b} />} nav={NAV} userName={me.name} banner={banner}>
      {children}
    </Shell>
  );
}
