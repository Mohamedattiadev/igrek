import { marked } from "marked";

/**
 * Top-level Markdown blocks (paragraphs, lists, code fences…) as their source text. While an
 * answer streams in, only the last block changes, so only that one has to be drawn again.
 */
export function splitBlocks(text: string): string[] {
  const blocks: string[] = [];
  let pending = "";
  for (const token of marked.lexer(text)) {
    // Blank lines belong to the block before them; they do not need a block of their own.
    if (token.type === "space") {
      if (blocks.length) blocks[blocks.length - 1] += token.raw;
      else pending += token.raw;
      continue;
    }
    blocks.push(pending + token.raw);
    pending = "";
  }
  return blocks;
}

/**
 * Closes what a half-written block left open, so it does not flash as raw symbols:
 * `**bold` gets its `**`, `` `code `` its backtick. A code fence needs nothing: an open fence
 * already runs to the end.
 */
export function healBlock(raw: string): string {
  if (/^\s*(```|~~~)/.test(raw)) return raw;
  const inline = raw.replace(/`[^`\n]*`/g, "");
  let out = raw;
  if ((inline.match(/`/g)?.length ?? 0) % 2 === 1) out += "`";
  const outside = out.replace(/`[^`\n]*`/g, "");
  if ((outside.match(/\*\*/g)?.length ?? 0) % 2 === 1) out += "**";
  return out;
}
