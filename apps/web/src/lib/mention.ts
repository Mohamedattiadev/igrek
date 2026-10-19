/** One expert the "@" list can offer: the id goes into the text, name and role are only shown. */
export interface MentionItem {
  id: string;
  name: string;
  role: string;
}

/** The "@word" being typed right before the caret, or nothing when the caret is not in one. */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | undefined {
  // An "@" only starts a mention at the beginning or after a space, so "me@mail.com" stays an address.
  const m = text.slice(0, caret).match(/(^|\s)@([\w.-]*)$/);
  if (!m) return undefined;
  const query = m[2] ?? "";
  return { start: caret - query.length - 1, query };
}

/** Lowercase without accents, so "guvenlik" finds "Güvenlik" and "I" finds "ı". */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i").toLowerCase();
}

/** Experts whose id, name or role holds the query; those whose id or name starts with it come first. */
export function filterMentions(items: MentionItem[], query: string, limit = 8): MentionItem[] {
  const q = fold(query);
  const starts = (item: MentionItem) => fold(item.id).startsWith(q) || fold(item.name).startsWith(q);
  const hits = items.filter((item) => [item.id, item.name, item.role].some((field) => fold(field).includes(q)));
  return [...hits.filter(starts), ...hits.filter((item) => !starts(item))].slice(0, limit);
}

/** The text with the typed "@word" replaced by "@<id> ", and where the caret goes after it. */
export function insertMention(
  text: string,
  at: { start: number; caret: number },
  id: string,
): { text: string; caret: number } {
  const mention = `@${id} `;
  const rest = text.slice(at.caret).replace(/^\S*\s?/, "");
  return { text: text.slice(0, at.start) + mention + rest, caret: at.start + mention.length };
}
