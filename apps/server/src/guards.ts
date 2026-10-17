/**
 * Agent safety rules (plan.md 0 and 1.2):
 * - AI agents never push, merge, publish or deploy on their own: those always wait for a person,
 *   even in auto mode and even after "always allow".
 * - Prompt injection: once a chat has read content from outside (web pages, fetched URLs), what it
 *   read is data, not instructions. The chat drops back to asking, and risky tools are never
 *   allowed without a person looking at them.
 */

/** Commands that ship work somewhere others see it. */
const SHIP: RegExp[] = [
  /\bgit\s+(push|merge)\b/,
  /\bgh\s+(pr\s+merge|release\s+create|workflow\s+run|repo\s+delete)\b/,
  /\b(npm|bun|pnpm|yarn)\s+publish\b/,
  /\bdocker\s+push\b/,
  /\b(vercel|netlify)\b[^\n|;&]*\b(deploy|--prod)\b/,
  /\b(fly|flyctl)\s+deploy\b/,
  /\bkubectl\s+(apply|rollout|set\s+image|delete)\b/,
  /\bterraform\s+(apply|destroy)\b/,
  /\bhelm\s+(install|upgrade|uninstall)\b/,
  /\bwrangler\s+(deploy|publish)\b/,
  /\bfirebase\s+deploy\b/,
  /\bansible-playbook\b/,
  /\b(scp|rsync)\b[^\n|;&]*\s[\w.-]+@?[\w.-]+:\S/,
];

/** Claude Code "ask" rules: a prompt even in auto mode. Prefix rules cover the common forms. */
export const SHIP_ASK_RULES = [
  "Bash(git push:*)",
  "Bash(git merge:*)",
  "Bash(gh pr merge:*)",
  "Bash(gh release create:*)",
  "Bash(npm publish:*)",
  "Bash(bun publish:*)",
  "Bash(pnpm publish:*)",
  "Bash(yarn publish:*)",
  "Bash(docker push:*)",
  "Bash(vercel:*)",
  "Bash(netlify deploy:*)",
  "Bash(fly deploy:*)",
  "Bash(flyctl deploy:*)",
  "Bash(kubectl apply:*)",
  "Bash(terraform apply:*)",
  "Bash(helm upgrade:*)",
  "Bash(wrangler deploy:*)",
  "Bash(firebase deploy:*)",
];

/** Tools that read the outside world; after one of these the chat is treated as "tainted". */
const EXTERNAL_TOOLS = /^(WebFetch|WebSearch)$|^mcp__.*(fetch|browser|web|http|url|scrape|search)/i;

/** Tools that can change things. */
const RISKY_TOOLS = /^(Bash|Write|Edit|MultiEdit|NotebookEdit)$|^mcp__/;

export function readsOutside(toolName: string): boolean {
  return EXTERNAL_TOOLS.test(toolName);
}

/** Why this request must be looked at by a person, if it must. */
export function guardFor(toolName: string, input: unknown, tainted: boolean): "ship" | "external" | undefined {
  const command =
    toolName === "Bash" && input && typeof input === "object"
      ? String((input as { command?: unknown }).command ?? "")
      : "";
  if (command && SHIP.some((re) => re.test(command))) return "ship";
  if (tainted && RISKY_TOOLS.test(toolName)) return "external";
  return undefined;
}
