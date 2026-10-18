import type { Metadata } from "next";
import "./globals.css";
import { getBranding } from "@/lib/server";
import { brandCss, fontHref } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  return { title: { default: b.brandName, template: `%s · ${b.brandName}` } };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const b = await getBranding();
  return (
    <html lang="es-PE">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fontHref(b.font)} />
        <style dangerouslySetInnerHTML={{ __html: brandCss(b) }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
