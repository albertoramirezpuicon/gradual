import type { Branding } from "@gradual/shared";

/** Shows the logo when available; otherwise the brand name. */
export function BrandMark({ b, size = "md" }: { b: Branding; size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-12" : "h-8";
  if (b.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={b.logoUrl} alt={b.brandName} className={`${h} w-auto max-w-[200px] object-contain`} />;
  }
  return (
    <span className={`font-bold tracking-tight text-primary ${size === "lg" ? "text-2xl" : "text-lg"}`}>{b.brandName}</span>
  );
}
