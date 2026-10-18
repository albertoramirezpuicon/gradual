/** Renders sanitized rich text (sanitized server-side on save, D37). */
export function RichText({ html }: { html: string }) {
  return <div className="rich-text text-sm text-stone-800" dangerouslySetInnerHTML={{ __html: html }} />;
}
