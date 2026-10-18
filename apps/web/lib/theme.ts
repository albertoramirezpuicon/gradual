import type { Branding } from "@gradual/shared";

/** Picks white or near-black text depending on contrast against the background color (WCAG). */
export function onColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastDark = (L + 0.05) / 0.05;
  return contrastWhite >= contrastDark ? "#ffffff" : "#1c1917";
}

/** CSS custom properties injected into <head> so the whole app follows the tenant's branding. */
export function brandCss(b: Branding): string {
  return `:root{--brand-primary:${b.primaryColor};--brand-on-primary:${onColor(b.primaryColor)};--brand-secondary:${b.secondaryColor};--brand-on-secondary:${onColor(b.secondaryColor)};--brand-font:"${b.font}";}`;
}

export function fontHref(font: string): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font).replace(/%20/g, "+")}:wght@400;500;600;700&display=swap`;
}
