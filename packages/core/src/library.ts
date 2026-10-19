/** Library (plan.md 7.1): what personas read, searched by meaning and by words, always cited. */

export type LibraryKind = "book" | "doc" | "article" | "web" | "repo" | "note" | "example" | "news" | "lesson";
export type LibraryStatus = "queued" | "reading" | "embedding" | "ready" | "failed";

/** A source the library could add: docs of what a project uses, or an expert's reference. */
export interface LibrarySuggestion {
  url: string;
  title: string;
  personaIds: string[];
  kind: "doc" | "web";
  /** The projects that use the tool these docs are for. */
  projects?: string[];
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  author?: string;
  /** File name or address it came from. */
  source: string;
  /** Personas that read it; empty means everyone. */
  personaIds: string[];
  status: LibraryStatus;
  /** 0–1 while reading or embedding. */
  progress: number;
  chunks: number;
  /** Every part has a meaning vector (search by meaning works, not only by words). */
  embedded: boolean;
  error?: string;
  size?: number;
  /** How many times a persona used a passage from it. */
  uses: number;
  addedAt: number;
  /** For news and articles: when it was published. */
  publishedAt?: number;
  /** Where to read the original. */
  url?: string;
}

export interface LibraryHit {
  itemId: string;
  title: string;
  author?: string;
  kind: LibraryKind;
  /** "p. 112", "Chapter 4: Architecture", "src/app.ts". */
  location?: string;
  text: string;
  score: number;
  url?: string;
  publishedAt?: number;
}

export interface EmbedderStatus {
  state: "missing" | "downloading" | "ready" | "failed";
  /** 0–1 while downloading. */
  progress?: number;
  error?: string;
  model: string;
  sizeMb: number;
}

/** "Accelerate (Forsgren, Humble, Kim), Chapter 4" */
export function citation(hit: Pick<LibraryHit, "title" | "author" | "location">): string {
  return `${hit.title}${hit.author ? ` (${hit.author})` : ""}${hit.location ? `, ${hit.location}` : ""}`;
}
