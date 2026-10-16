/**
 * Masks secrets before anything leaves this computer (plan.md 4.2). Better to
 * hide a harmless string than to leak a key; the end of each secret is kept so
 * people can still tell which one it was.
 */
export const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic
  /\bsk-(proj-)?[A-Za-z0-9_-]{20,}/g, // OpenAI
  /\bgh[pousr]_[A-Za-z0-9]{30,}/g, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{40,}/g,
  /\bxox[abpors]-[A-Za-z0-9-]{10,}/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z_-]{35}\b/g, // Google API key
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{20,}/g, // Stripe
  /\bglpat-[A-Za-z0-9_-]{20,}/g, // GitLab
  /\bnpm_[A-Za-z0-9]{36}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{3,}@/gi, // credentials in URLs
];

/** KEY=value lines where the name says it's secret (.env style). */
const ASSIGNMENT =
  /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|APIKEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET|DATABASE_URL|DSN)[A-Z0-9_]*)\s*[=:]\s*("[^"\n]*"|'[^'\n]*'|[^\s"'\n]+)/g;

function mask(secret: string): string {
  return `${secret.slice(0, 4)}••••${secret.length > 12 ? secret.slice(-4) : ""}`;
}

export function scrub(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS)
    out = out.replace(pattern, (m) => (m.startsWith("-----BEGIN") ? "[private key removed]" : mask(m)));
  out = out.replace(
    ASSIGNMENT,
    (_m, name: string, _kind: string, value: string) => `${name}=${mask(value.replace(/^['"]|['"]$/g, ""))}`,
  );
  return out;
}

/** Scrubs every string inside a JSON-able value. */
export function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return scrub(value) as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrubDeep(v)])) as T;
  }
  return value;
}

/** Where secrets are in a text (for the prompt firewall's warning), without returning them. */
export function findSecrets(text: string): { start: number; end: number; hint: string }[] {
  const out: { start: number; end: number; hint: string }[] = [];
  const add = (start: number, value: string) => {
    if (!out.some((o) => start < o.end && start + value.length > o.start))
      out.push({ start, end: start + value.length, hint: mask(value) });
  };
  for (const pattern of SECRET_PATTERNS)
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) add(m.index ?? 0, m[0]);
  for (const m of text.matchAll(new RegExp(ASSIGNMENT.source, ASSIGNMENT.flags))) {
    const value = (m[3] ?? "").replace(/^['"]|['"]$/g, "");
    // "API_KEY=process.env.API_KEY" or an empty placeholder is not a secret.
    if (value.length >= 8 && !/^(process\.env|import\.meta|os\.environ|\$\{|<|your|xxx|changeme|example)/i.test(value))
      add((m.index ?? 0) + m[0].indexOf(value), value);
  }
  return out.sort((a, b) => a.start - b.start);
}
