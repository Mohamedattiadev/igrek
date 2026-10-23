/**
 * Private details (T.C. identity number, student number, IBAN, API keys, a company's figures) stay
 * on this computer. What goes to an AI carries a placeholder instead, [[private:name]], and the
 * real value is put back only here: in a step you approve, in text you copy, in a form the browser
 * extension fills.
 */

import { findMoney, type MoneyShape } from "./money";

export type PrivateKind = "identity" | "student" | "finance" | "key" | "contact" | "other";
export const PRIVATE_KINDS: PrivateKind[] = ["identity", "student", "finance", "key", "contact", "other"];

/** What the interface knows of a private value: never the value itself. */
export interface PrivateValueInfo {
  name: string;
  label: string;
  kind: PrivateKind;
  createdAt: number;
}

/** A short name for a placeholder: a-z, 0-9 and "_", like tc_kimlik. */
export const PRIVATE_NAME = /^[a-z0-9_]{2,40}$/;
const PLACEHOLDER = /\[\[private:([a-z0-9_]{2,40})\]\]/g;

export const placeholderOf = (name: string) => `[[private:${name}]]`;

/** Told to every chat, so the AI keeps placeholders as they are and never asks for what is behind them. */
export const PRIVATE_HINT = `Some of the user's details are private and kept by Igrek on their computer. They appear as
placeholders like [[private:tc_kimlik]]. Never ask for the real value and never guess it. Where the value
belongs (a file, a command, a form, a letter) write the placeholder exactly as it is; Igrek puts the real
value in on the user's computer when the step runs or the text is used.`;

/** Digits that may be written with spaces or dashes (a phone, an IBAN, a card): matched in any of those forms. */
function looseRegex(value: string): RegExp {
  const compact = value.replace(/[\s-]/g, "");
  const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A saved figure is not found inside a longer one: 300 is not hidden in 3000 or in 300.50.
  const edges = (source: string) =>
    `${/^\d/.test(value) ? "(?<!\\d)" : ""}${source}${/\d$/.test(value) ? "(?!\\d|[.,]\\d)" : ""}`;
  if (/^[A-Za-z0-9]{6,}$/.test(compact) && /\d{4,}/.test(compact))
    return new RegExp(edges(compact.split("").map(literal).join("[\\s-]?")), "gi");
  return new RegExp(edges(literal(value)), "g");
}

/**
 * Names for details hidden in one chat or question only, not saved ("hide here only"): from what
 * each is (amount_1, iban_1), so the AI still knows what stands there, and clear of names in use.
 * One already hidden, or too short to hide reliably, is left out.
 */
export function namesForOnce(
  found: { kind: string; value: string }[],
  inUse: { name: string; value: string }[],
): { name: string; value: string }[] {
  const taken = new Set(inUse.map((v) => v.name));
  const known = new Set(inUse.map((v) => v.value));
  const out: { name: string; value: string }[] = [];
  for (const { kind, value } of found) {
    const clean = value.trim();
    if (clean.length < 3 || known.has(clean)) continue;
    const base =
      kind
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .slice(0, 20) || "private";
    let n = 1;
    while (taken.has(`${base}_${n}`)) n++;
    taken.add(`${base}_${n}`);
    known.add(clean);
    out.push({ name: `${base}_${n}`, value: clean });
  }
  return out;
}

/** Every saved value in the text becomes its placeholder; says which ones were hidden. */
export function hidePrivate(
  text: string,
  values: { name: string; value: string }[],
): { text: string; hidden: string[] } {
  let out = text;
  const hidden: string[] = [];
  // Longer values first, so one that contains another is hidden whole.
  for (const { name, value } of [...values].sort((a, b) => b.value.length - a.value.length)) {
    if (value.trim().length < 3) continue;
    const re = looseRegex(value.trim());
    if (re.test(out)) {
      out = out.replace(looseRegex(value.trim()), placeholderOf(name));
      hidden.push(name);
    }
  }
  return { text: out, hidden };
}

/** Placeholders back to their values (only on this computer); unknown names stay as they are. */
export function fillPrivate(text: string, values: { name: string; value: string }[]): string {
  const map = new Map(values.map((v) => [v.name, v.value]));
  return text.replace(PLACEHOLDER, (whole, name: string) => map.get(name) ?? whole);
}

/** The placeholder names a text uses. */
export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ""))].filter(Boolean);
}

/** A Turkish identity number: 11 digits, not starting with 0, with its two check digits right. */
export function isTcKimlik(digits: string): boolean {
  if (!/^[1-9]\d{10}$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  const odd = (d[0] ?? 0) + (d[2] ?? 0) + (d[4] ?? 0) + (d[6] ?? 0) + (d[8] ?? 0);
  const even = (d[1] ?? 0) + (d[3] ?? 0) + (d[5] ?? 0) + (d[7] ?? 0);
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  const eleventh = d.slice(0, 10).reduce((n, x) => n + x, 0) % 10;
  return tenth === d[9] && eleventh === d[10];
}

/** An IBAN whose check digits are right (ISO 13616, mod 97). */
export function isIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (const ch of digits) rest = (rest * 10 + Number(ch)) % 97;
  return rest === 1;
}

/** A payment card number (13 to 19 digits) that passes the Luhn check. */
export function isCardNumber(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export type PrivateShape = "tcKimlik" | "iban" | "card" | MoneyShape;
type Found = { start: number; end: number; kind: PrivateShape; value: string };

/** Private details by their shape, even when not saved yet: identity numbers, IBANs, card numbers, money figures. */
export function findPrivateShapes(text: string): Found[] {
  const out: Found[] = [];
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g))
    if (isIban(m[0])) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, kind: "iban", value: m[0] });
  for (const m of text.matchAll(/\b\d(?:[\s-]?\d){10,18}\b/g)) {
    const start = m.index ?? 0;
    if (out.some((o) => start < o.end && start + m[0].length > o.start)) continue;
    const digits = m[0].replace(/[\s-]/g, "");
    const kind = digits.length === 11 && isTcKimlik(digits) ? "tcKimlik" : isCardNumber(digits) ? "card" : undefined;
    if (kind) out.push({ start, end: start + m[0].length, kind, value: m[0] });
  }
  out.push(...findMoney(text, out));
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Said to the AI in a REA chat. The legal line is part of the mode: only what the user owns or may
 * examine, and nothing that defeats protection or copies someone else's code.
 */
export const REVERSE_HINT = `This chat is in reverse-engineering mode, with REA's MCP tools when they are installed.
The user confirmed they own the software they ask about or are authorized to examine it (their own app, an
open-source project, a security engagement or a bug bounty in scope, interoperability allowed by law).
- Explain how a feature works from evidence: name the tool, the file, the function or address, and how sure you are.
- When the goal is the user's own version of a feature, write it fresh from the behaviour you found, never by copying
  the other program's code, assets or text.
- Do not help remove or bypass licence checks, copy protection, DRM or anti-cheat, extract keys or other people's
  data, or build malware. If a request needs that, say so plainly and offer what is allowed.
- If it is unclear whether the user may examine the target, ask before you start.`;

/** Said to the AI in the chief's chat (apps/server/src/chief.ts); its folder's CLAUDE.md has the rest. */
export const CHIEF_HINT = `This is the user's chief chat in Igrek, about all their projects. Follow CLAUDE.md in this
folder: hand work to the projects with igrek_delegate instead of changing their files from here, and keep NOTES.md.`;
