import { createElement as h, type ReactElement } from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Footer,
  Packer,
  Paragraph,
  TextRun,
  TabStopType,
} from "docx";
import type { ImprovedCv } from "@gradual/shared";

/**
 * Single neutral, ATS-friendly CV template (D47): no consultant branding, one column,
 * standard fonts, real text (no images or tables). Section titles are customer-facing (Spanish).
 */

const T = {
  profile: "Perfil profesional",
  experience: "Experiencia laboral",
  education: "Educación",
  skills: "Habilidades",
  languages: "Idiomas",
  certifications: "Certificaciones",
};

const dates = (start?: string, end?: string) => [start, end].filter(Boolean).join(" – ");
const contactLine = (cv: ImprovedCv) =>
  [cv.contact.location, cv.contact.phone, cv.contact.email, cv.contact.linkedin, cv.contact.website].filter(Boolean).join("  ·  ");

/** Safe file name for downloads, e.g. "CV - Maria Lopez.pdf". */
export function cvFileName(cv: ImprovedCv, ext: "pdf" | "docx") {
  const base = (cv.name || "CV mejorado")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 60);
  return `CV - ${base || "mejorado"}.${ext}`;
}

// =====================================================================
// PDF (@react-pdf/renderer, built-in Helvetica covers Spanish accents)
// =====================================================================

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 48, fontFamily: "Helvetica", fontSize: 10, color: "#1f2937", lineHeight: 1.4 },
  // Explicit line heights: react-pdf inherits the page lineHeight as an absolute value, which clips larger text.
  name: { fontSize: 20, lineHeight: 1.2, fontFamily: "Helvetica-Bold", color: "#111827" },
  headline: { fontSize: 11.5, lineHeight: 1.3, marginTop: 4, color: "#374151" },
  contact: { fontSize: 9, marginTop: 6, color: "#4b5563" },
  section: { marginTop: 14 },
  sectionTitle: {
    fontSize: 10.5,
    lineHeight: 1.3,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#111827",
    borderBottomWidth: 0.75,
    borderBottomColor: "#9ca3af",
    paddingBottom: 2,
    marginBottom: 6,
  },
  itemHead: { flexDirection: "row", justifyContent: "space-between" },
  itemTitle: { fontFamily: "Helvetica-Bold", fontSize: 10.5, lineHeight: 1.3, flexShrink: 1 },
  itemDates: { fontSize: 9, color: "#4b5563", marginLeft: 8 },
  itemSub: { fontSize: 9.5, color: "#374151" },
  bullet: { flexDirection: "row", marginTop: 2, paddingLeft: 4 },
  bulletDot: { width: 10 },
  bulletText: { flex: 1 },
  item: { marginBottom: 8 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 7.5, color: "#9ca3af", textAlign: "center" },
});

function section(title: string, ...children: (ReactElement | null)[]) {
  return h(View, { style: s.section, wrap: true }, h(Text, { style: s.sectionTitle }, title), ...children);
}
const bullets = (items: string[]) =>
  items.map((b, i) => h(View, { key: i, style: s.bullet }, h(Text, { style: s.bulletDot }, "•"), h(Text, { style: s.bulletText }, b)));

export async function renderCvPdf(cv: ImprovedCv, footerText: string): Promise<Buffer> {
  const contact = contactLine(cv);
  const doc = h(
    Document,
    { title: cv.name ? `CV - ${cv.name}` : "CV", author: cv.name || undefined, language: "es" },
    h(
      Page,
      { size: "A4", style: s.page },
      h(Text, { style: s.name }, cv.name || "Nombre Apellido"),
      cv.headline ? h(Text, { style: s.headline }, cv.headline) : null,
      contact ? h(Text, { style: s.contact }, contact) : null,
      cv.profile ? section(T.profile, h(Text, null, cv.profile)) : null,
      cv.experience.length
        ? section(
            T.experience,
            ...cv.experience.map((e, i) =>
              h(
                View,
                { key: i, style: s.item, wrap: false },
                h(View, { style: s.itemHead }, h(Text, { style: s.itemTitle }, e.role), h(Text, { style: s.itemDates }, dates(e.start, e.end))),
                e.company || e.location ? h(Text, { style: s.itemSub }, [e.company, e.location].filter(Boolean).join(", ")) : null,
                ...bullets(e.bullets),
              ),
            ),
          )
        : null,
      cv.education.length
        ? section(
            T.education,
            ...cv.education.map((e, i) =>
              h(
                View,
                { key: i, style: s.item, wrap: false },
                h(View, { style: s.itemHead }, h(Text, { style: s.itemTitle }, e.degree), h(Text, { style: s.itemDates }, dates(e.start, e.end))),
                e.institution || e.location ? h(Text, { style: s.itemSub }, [e.institution, e.location].filter(Boolean).join(", ")) : null,
                e.details ? h(Text, { style: { marginTop: 2 } }, e.details) : null,
              ),
            ),
          )
        : null,
      cv.skills.length ? section(T.skills, h(Text, null, cv.skills.join("  ·  "))) : null,
      cv.languages.length ? section(T.languages, h(Text, null, cv.languages.map((l) => (l.level ? `${l.language} (${l.level})` : l.language)).join("  ·  "))) : null,
      cv.certifications.length ? section(T.certifications, ...bullets(cv.certifications)) : null,
      ...cv.other.map((o, i) => (o.items.length ? h(View, { key: `o${i}` }, section(o.title, ...bullets(o.items))) : null)),
      footerText ? h(Text, { style: s.footer, fixed: true }, footerText) : null,
    ),
  );
  return renderToBuffer(doc as Parameters<typeof renderToBuffer>[0]);
}

// =====================================================================
// DOCX (editable version, D22/D29)
// =====================================================================

const FONT = "Calibri";
const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, bold: opts.bold, size: opts.size ?? 21, color: opts.color });

const heading = (title: string) =>
  new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "9CA3AF", space: 2 } },
    children: [run(title.toUpperCase(), { bold: true, size: 21, color: "111827" })],
  });

const bulletPara = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [run(text)] });

/** Title on the left, dates right-aligned via a tab stop at the right margin (A4, 2 cm margins). */
const titleWithDates = (title: string, d: string) =>
  new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9638 }],
    spacing: { before: 80 },
    children: [run(title, { bold: true }), ...(d ? [run(`\t${d}`, { size: 19, color: "4B5563" })] : [])],
  });

export async function renderCvDocx(cv: ImprovedCv, footerText: string): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ children: [run(cv.name || "Nombre Apellido", { bold: true, size: 40, color: "111827" })] }),
  ];
  if (cv.headline) children.push(new Paragraph({ children: [run(cv.headline, { size: 23, color: "374151" })] }));
  const contact = contactLine(cv);
  if (contact) children.push(new Paragraph({ spacing: { before: 80 }, children: [run(contact, { size: 18, color: "4B5563" })] }));

  if (cv.profile) children.push(heading(T.profile), new Paragraph({ children: [run(cv.profile)] }));
  if (cv.experience.length) {
    children.push(heading(T.experience));
    for (const e of cv.experience) {
      children.push(titleWithDates(e.role, dates(e.start, e.end)));
      const sub = [e.company, e.location].filter(Boolean).join(", ");
      if (sub) children.push(new Paragraph({ children: [run(sub, { size: 20, color: "374151" })] }));
      e.bullets.forEach((b) => children.push(bulletPara(b)));
    }
  }
  if (cv.education.length) {
    children.push(heading(T.education));
    for (const e of cv.education) {
      children.push(titleWithDates(e.degree, dates(e.start, e.end)));
      const sub = [e.institution, e.location].filter(Boolean).join(", ");
      if (sub) children.push(new Paragraph({ children: [run(sub, { size: 20, color: "374151" })] }));
      if (e.details) children.push(new Paragraph({ children: [run(e.details)] }));
    }
  }
  if (cv.skills.length) children.push(heading(T.skills), new Paragraph({ children: [run(cv.skills.join("  ·  "))] }));
  if (cv.languages.length)
    children.push(heading(T.languages), new Paragraph({ children: [run(cv.languages.map((l) => (l.level ? `${l.language} (${l.level})` : l.language)).join("  ·  "))] }));
  if (cv.certifications.length) {
    children.push(heading(T.certifications));
    cv.certifications.forEach((c) => children.push(bulletPara(c)));
  }
  for (const o of cv.other) {
    if (!o.items.length) continue;
    children.push(heading(o.title));
    o.items.forEach((i) => children.push(bulletPara(i)));
  }

  const doc = new DocxDocument({
    creator: footerText || "Gradual",
    title: cv.name ? `CV - ${cv.name}` : "CV",
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, bottom: 1000, left: 1134, right: 1134 } } },
        footers: footerText
          ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(footerText, { size: 15, color: "9CA3AF" })] })] }) }
          : undefined,
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
