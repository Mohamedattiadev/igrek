import type { LinkPreview } from "@igrek/core";

/** A link's card: picture, site, title and a line about it; opens the page in the browser. */
export function LinkCard({ preview }: { preview: LinkPreview }) {
  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex max-w-md overflow-hidden rounded-ui border border-border bg-bg-subtle hover:border-accent"
    >
      {preview.image && <img src={preview.image} alt="" className="h-16 w-16 shrink-0 object-cover" />}
      <span className="min-w-0 px-3 py-2">
        {preview.site && <span className="block truncate text-[11px] text-fg-subtle">{preview.site}</span>}
        <span className="block truncate text-[13px] font-semibold">{preview.title}</span>
        {preview.description && <span className="line-clamp-2 text-[12px] text-fg-muted">{preview.description}</span>}
      </span>
    </a>
  );
}
