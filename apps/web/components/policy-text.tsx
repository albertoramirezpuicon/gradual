import Markdown from "react-markdown";

/** Renders the privacy policy (Markdown) with the shared typography styles. */
export function PolicyText({ content }: { content: string }) {
  return (
    <div className="prose-policy text-sm text-stone-800">
      <Markdown>{content}</Markdown>
    </div>
  );
}
