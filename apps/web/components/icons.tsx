import type { ResourceType } from "@gradual/shared";

const base = "size-5 shrink-0";
const svg = (d: React.ReactNode, cls = base) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const FileIcon = () => svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>);
export const LinkIcon = () => svg(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>);
export const VideoIcon = () => svg(<><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3z" /></>);
export const TextIcon = () => svg(<><path d="M4 6h16M4 12h16M4 18h10" /></>);
export const UpIcon = () => svg(<path d="m6 15 6-6 6 6" />, "size-4");
export const DownIcon = () => svg(<path d="m6 9 6 6 6-6" />, "size-4");
export const CheckIcon = ({ className = "size-4" }: { className?: string }) => svg(<path d="m5 12 5 5 9-10" />, className);
export const ExternalIcon = () => svg(<><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>, "size-4");

export function ResourceIcon({ type }: { type: ResourceType }) {
  return { file: <FileIcon />, link: <LinkIcon />, video: <VideoIcon />, text: <TextIcon /> }[type];
}

/** User-facing (Spanish) labels for resource types. */
export const RESOURCE_LABEL: Record<ResourceType, string> = {
  file: "Archivo",
  link: "Enlace",
  video: "Video",
  text: "Texto",
};
