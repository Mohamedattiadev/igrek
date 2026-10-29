import { createHash } from "node:crypto";
import { search, type TimelineItem } from "@igrek/core";
import type { Embed } from "./embedder";

/** New items embedded per question at most; the rest wait for the next one (the first ask stays quick). */
const NEW_PER_ASK = 300;

const cosine = (a: Float32Array, b: Float32Array) => {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += (a[i] ?? 0) * (b[i] ?? 0);
  return dot;
};

/**
 * Questions to the history by meaning as well as by words (plan.md 20.9): the timeline's texts are
 * embedded on this computer with the library's small model (multilingual-e5, nothing leaves it),
 * kept in memory, and the two rankings are merged (reciprocal rank fusion). Without the model it is
 * the word search alone.
 */
export class HistorySearch {
  private vectors = new Map<string, Float32Array>();

  constructor(private readonly embedder: Embed) {}

  private key(item: TimelineItem): string {
    return createHash("sha1").update(`${item.id}\n${item.text}`).digest("hex");
  }

  async find(items: TimelineItem[], question: string, now = Date.now(), limit = 8): Promise<TimelineItem[]> {
    const words = search(items, question, now, 20).map((f) => f.item);
    if (!this.embedder.ready()) return words.slice(0, limit);
    const fresh = items
      .filter((i) => i.text.trim() && !this.vectors.has(this.key(i)))
      .sort((a, b) => b.at - a.at)
      .slice(0, NEW_PER_ASK);
    for (let at = 0; at < fresh.length; at += 32) {
      const batch = fresh.slice(at, at + 32);
      const vectors = await this.embedder.embed(
        batch.map((i) => i.text.slice(0, 500)),
        "passage",
      );
      batch.forEach((item, n) => {
        const v = vectors[n];
        if (v) this.vectors.set(this.key(item), v);
      });
    }
    const [q] = await this.embedder.embed([question], "query");
    if (!q) return words.slice(0, limit);
    const meaning = items
      .map((item) => ({
        item,
        score: this.vectors.has(this.key(item)) ? cosine(q, this.vectors.get(this.key(item)) as Float32Array) : -1,
      }))
      .filter((x) => x.score > 0.8)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((x) => x.item);
    return fuse([words, meaning]).slice(0, limit);
  }
}

/** Reciprocal rank fusion: what both lists rank high comes first. */
export function fuse(lists: TimelineItem[][]): TimelineItem[] {
  const score = new Map<string, { item: TimelineItem; s: number }>();
  for (const list of lists)
    list.forEach((item, rank) => {
      const known = score.get(item.id) ?? { item, s: 0 };
      known.s += 1 / (60 + rank);
      score.set(item.id, known);
    });
  return [...score.values()].sort((a, b) => b.s - a.s).map((x) => x.item);
}
