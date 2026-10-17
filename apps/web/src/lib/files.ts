export type PreviewKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "csv"
  | "json"
  | "tree"
  | "sheet"
  | "doc"
  | "slides"
  | "log"
  | "text"
  | "binary";

const BY_EXT: Record<string, PreviewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  svg: "image",
  ico: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  pdf: "pdf",
  md: "markdown",
  mdx: "markdown",
  csv: "csv",
  tsv: "csv",
  json: "tree",
  yaml: "tree",
  yml: "tree",
  toml: "tree",
  xlsx: "sheet",
  docx: "doc",
  pptx: "slides",
  log: "log",
};

export function previewKind(path: string): PreviewKind | undefined {
  return BY_EXT[path.split(".").pop()?.toLowerCase() ?? ""];
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function parentOf(path: string): string {
  const parent = path.replace(/\/[^/]+\/?$/, "");
  return parent || "/";
}

export function nameOf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
