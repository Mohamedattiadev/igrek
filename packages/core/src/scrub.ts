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

/**
 * A value that only stands in for a secret: "paste-the-token-here", "your-key", "PASSWORD",
 * "xxxxxxxx", "<token>". Used for warnings only; masking stays strict.
 */
const PLACEHOLDER =
  /(paste|replace|change[-_ ]?me|your|xxx|example|placeholder|dummy|fake|sample|redacted|todo|insert|here\b|<|\.\.\.|\*\*\*|\$\{|process\.env|import\.meta|os\.environ)/i;

export function isPlaceholder(value: string): boolean {
  const v = value.replace(/^['"]|['"]$/g, "");
  return (
    PLACEHOLDER.test(v) ||
    /^[A-Z][A-Z_-]*$/.test(v) || // PASSWORD, MY_TOKEN
    /^(.)\1+$/.test(v) || // xxxxxxxx
    /^\$(\(|[A-Za-z_])/.test(v) || // $(openssl rand -hex 16), $DB_PASSWORD
    /^[A-Z][A-Za-z]*(\[\]|<)/.test(v) // a type in code: "SECRET_PATTERNS: RegExp[]"
  );
}

/** The password part of "scheme://user:password@host". */
function urlPassword(url: string): string {
  return url.match(/:\/\/[^\s:/@]+:([^\s@/]+)@/)?.[1] ?? "";
}

/** Where secrets are in a text (for the prompt firewall's warning), without returning them. */
/**
 * `vendorOnly`: only keys with a provider's own format (sk-ant-, ghp_, AKIA…, private keys). Used
 * for documentation, where "KEY=value" lines and URLs with a password are examples to copy.
 */
export function findSecrets(
  text: string,
  vendorOnly = false,
  /** Source code: an unquoted value there is a variable or an expression, not a literal. */
  code = false,
): { start: number; end: number; hint: string }[] {
  const out: { start: number; end: number; hint: string }[] = [];
  const add = (start: number, value: string) => {
    if (!out.some((o) => start < o.end && start + value.length > o.start))
      out.push({ start, end: start + value.length, hint: mask(value) });
  };
  for (const pattern of SECRET_PATTERNS)
    for (const m of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      // "postgres://app:PASSWORD@db" in a guide is an instruction, not a leak.
      if (m[0].includes("://") && (vendorOnly || isPlaceholder(urlPassword(m[0])))) continue;
      // A real private key has hundreds of characters between the lines; "MIIabc" is an example.
      if (m[0].startsWith("-----BEGIN") && m[0].replace(/-----[^-]+-----|\s|\\n/g, "").length < 64) continue;
      add(m.index ?? 0, m[0]);
    }
  if (!vendorOnly)
    for (const m of text.matchAll(new RegExp(ASSIGNMENT.source, ASSIGNMENT.flags))) {
      const raw = m[3] ?? "";
      // In code, PGPASSWORD: password or token: cfg.token names a variable.
      if (code && !/^['"]/.test(raw) && /^[A-Za-z_$][\w$.]*(\(\))?[,;)}\]]*$/.test(raw)) continue;
      const value = raw.replace(/^['"]|['"]$/g, "");
      // "API_KEY=process.env.API_KEY" or a placeholder like "paste-the-key-here" is not a secret.
      if (value.length >= 8 && !isPlaceholder(value)) add((m.index ?? 0) + m[0].indexOf(value), value);
    }
  return out.sort((a, b) => a.start - b.start);
}
