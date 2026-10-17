/**
 * The search model in its own process (plan.md 13.6 "Hafiflik"): God Eye starts it when the
 * library is searched and stops it after a few idle minutes, so its memory is given back.
 * One JSON line in ({id, texts, kind}), one out ({id, vectors} as base64 Float32 arrays).
 */
import { Embedder } from "./embedder";

const embedder = new Embedder(process.argv[2] ?? "");
const decoder = new TextDecoder();
let buffer = "";
for await (const chunk of Bun.stdin.stream()) {
  buffer += decoder.decode(chunk, { stream: true });
  for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
    const line = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    let id = 0;
    try {
      const req = JSON.parse(line) as { id: number; texts: string[]; kind: "query" | "passage" };
      id = req.id;
      const vectors = await embedder.embedHere(req.texts, req.kind);
      process.stdout.write(
        `${JSON.stringify({ id, vectors: vectors.map((v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64")) })}\n`,
      );
    } catch (err) {
      process.stdout.write(`${JSON.stringify({ id, error: (err as Error).message })}\n`);
    }
  }
}
