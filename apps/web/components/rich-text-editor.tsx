"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/components/ui";

/** Limited-toolbar rich text editor for `text` resources (D37). Output is sanitized again by the API. */
export function RichTextEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
    ],
    content: value,
    editorProps: {
      attributes: { class: "rich-text min-h-40 px-3 py-2 text-sm focus:outline-none", "aria-label": "Contenido" },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  return (
    <div className="rounded-lg border border-stone-300 bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25">
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const btn = (label: string, active: boolean, run: () => void, title: string) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn("h-8 min-w-8 rounded-md px-2 text-sm font-semibold", active ? "bg-primary-soft text-primary" : "text-stone-700 hover:bg-stone-100")}
    >
      {label}
    </button>
  );
  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enlace (https://…)", prev ?? "https://");
    if (url === null) return;
    if (url === "" || url === "https://") editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  return (
    <div className="flex flex-wrap gap-1 border-b border-stone-200 p-1">
      {btn("B", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), "Negrita")}
      {btn("I", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), "Cursiva")}
      {btn("T1", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "Título")}
      {btn("T2", editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), "Subtítulo")}
      {btn("•", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), "Lista")}
      {btn("1.", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), "Lista numerada")}
      {btn("❝", editor.isActive("blockquote"), () => editor.chain().focus().toggleBlockquote().run(), "Cita")}
      {btn("🔗", editor.isActive("link"), setLink, "Enlace")}
    </div>
  );
}
