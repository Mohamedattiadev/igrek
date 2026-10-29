import type { Seat } from "./index";

/** A report older than this says little about how someone uses their plan now. */
const FRESH_MS = 2 * 86_400_000;

/**
 * Who should have which AI account (plan.md 18.6, "account suggestions"): someone with none,
 * someone always at their weekly limit (a larger plan, or a teammate on the same kind of account
 * with room), someone paying for Max who uses little of it. Advice only; the admin decides.
 */
export type SeatAdvice =
  | { kind: "noAccount"; member: string; name: string }
  | { kind: "larger"; member: string; name: string; account: string; pct: number; to?: string }
  | { kind: "smaller"; member: string; name: string; account: string; plan: string; pct: number };

const weekOf = (s: Seat, provider?: string) =>
  Math.max(0, ...s.accounts.filter((a) => !provider || a.provider === provider).map((a) => a.week ?? 0));

export function seatAdvice(seats: Seat[], now = Date.now()): SeatAdvice[] {
  const fresh = seats.filter((s) => s.at && now - s.at < FRESH_MS);
  const out: SeatAdvice[] = [];
  for (const s of fresh) {
    if (!s.accounts.length) {
      out.push({ kind: "noAccount", member: s.memberId, name: s.name });
      continue;
    }
    for (const a of s.accounts) {
      const week = a.week ?? 0;
      if (a.loggedIn && week >= 0.9) {
        // The teammate with the most room on the same kind of account, if anyone has plenty.
        const room = fresh
          .filter((o) => o !== s && o.accounts.some((x) => x.provider === a.provider && x.loggedIn))
          .map((o) => ({ o, week: weekOf(o, a.provider) }))
          .filter((x) => x.week <= 0.4)
          .sort((x, y) => x.week - y.week)[0];
        out.push({
          kind: "larger",
          member: s.memberId,
          name: s.name,
          account: a.label,
          pct: Math.round(week * 100),
          ...(room ? { to: room.o.name } : {}),
        });
      } else if (a.loggedIn && a.plan?.startsWith("max") && week <= 0.2) {
        out.push({
          kind: "smaller",
          member: s.memberId,
          name: s.name,
          account: a.label,
          plan: a.plan,
          pct: Math.round(week * 100),
        });
      }
    }
  }
  return out;
}
