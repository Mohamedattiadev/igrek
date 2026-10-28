import type { LinkPreview } from "@igrek/core";

export { cleanPreview } from "@igrek/core";

/**
 * Link previews in the team chat (plan.md 19.9), like WhatsApp's: the title, a line about the page
 * and a small picture. Only the writer's Igrek fetches the page, when they paste a link and keep
 * its preview; the preview then travels inside the encrypted message, so a teammate's computer
 * never opens the address and the site cannot tell who read it.
 */

const MAX_PAGE = 512 * 1024;
const MAX_IMAGE = 80 * 1024;
const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif)$/;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, code: string) => {
      if (code[0] === "#")
        return String.fromCodePoint(
          code[1]?.toLowerCase() === "x" ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1)),
        );
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The content of a <meta> with this property or name, whichever order its attributes come in. */
function meta(html: string, names: string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (key && names.includes(key)) {
      const content = tag.match(/\bcontent\s*=\s*"([^"]*)"|\bcontent\s*=\s*'([^']*)'/i);
      const value = content?.[1] ?? content?.[2];
      if (value?.trim()) return decode(value);
    }
  }
  return undefined;
}

/** What a page says about itself (Open Graph first, then the plain title and description). */
export function parsePreview(
  url: string,
  html: string,
): (Omit<LinkPreview, "image"> & { imageUrl?: string }) | undefined {
  const title =
    meta(html, ["og:title", "twitter:title"]) ?? decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  if (!title) return undefined;
  const description = meta(html, ["og:description", "twitter:description", "description"]);
  const site = meta(html, ["og:site_name"]) ?? new URL(url).hostname.replace(/^www\./, "");
  const image = meta(html, ["og:image", "og:image:url", "twitter:image"]);
  let imageUrl: string | undefined;
  try {
    imageUrl = image ? new URL(image, url).href : undefined;
  } catch {
    imageUrl = undefined;
  }
  return {
    url,
    title: title.slice(0, 200),
    ...(description ? { description: description.slice(0, 300) } : {}),
    site: site.slice(0, 80),
    ...(imageUrl?.startsWith("http") ? { imageUrl } : {}),
  };
}

/** At most `limit` bytes of a response; a bigger page is cut, a bigger picture is dropped. */
async function readUpTo(res: Response, limit: number): Promise<Uint8Array | undefined> {
  const reader = res.body?.getReader();
  if (!reader) return undefined;
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    parts.push(value);
    if (size >= limit) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(parts).subarray(0, limit);
}

const get = (url: string) =>
  fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(6000),
    headers: { "user-agent": "Mozilla/5.0 (compatible; Igrek link preview)", accept: "text/html,image/*" },
  });

/** A small picture as a data URL, so readers need not fetch it; anything bigger is left out. */
async function smallImage(url: string): Promise<string | undefined> {
  const res = await get(url).catch(() => undefined);
  const type = res?.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!res?.ok || !IMAGE_TYPES.test(type)) return undefined;
  const bytes = await readUpTo(res, MAX_IMAGE + 1);
  if (!bytes || bytes.length > MAX_IMAGE) return undefined;
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function linkPreview(raw: string): Promise<LinkPreview | undefined> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  const res = await get(url.href).catch(() => undefined);
  if (!res?.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) return undefined;
  const bytes = await readUpTo(res, MAX_PAGE);
  const found = bytes && parsePreview(res.url || url.href, new TextDecoder().decode(bytes));
  if (!found) return undefined;
  const { imageUrl, ...rest } = found;
  const image = imageUrl ? await smallImage(imageUrl) : undefined;
  return { ...rest, url: url.href, ...(image ? { image } : {}) };
}
