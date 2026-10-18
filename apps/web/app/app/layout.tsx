import { getBranding, requireUser } from "@/lib/server";
import { BrandMark } from "@/components/brand";
import { Shell, type NavItem } from "@/components/shell";

// Labels are user-facing (Spanish); paths are code (English).
const NAV: NavItem[] = [
  { href: "/app", label: "Mis rutas" },
  { href: "/app/cv", label: "Mejorar mi CV", soon: true },
  { href: "/app/profile", label: "Mi perfil" },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const [me, b] = await Promise.all([requireUser("client"), getBranding()]);
  return (
    <Shell brand={<BrandMark b={b} />} nav={NAV} userName={me.name}>
      {children}
    </Shell>
  );
}
