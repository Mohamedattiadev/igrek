/** Loose title match: "Accelerate" matches "Accelerate: The Science of Lean Software". */
export function sameBook(have: string, want: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const a = norm(have);
  const b = norm(want);
  return !!a && !!b && (a.includes(b) || b.includes(a));
}
