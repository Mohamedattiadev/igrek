import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Technical words with a one-sentence explanation behind a "?" (plan.md 7.0). Specific words first. */
const GLOSSARY = [
  "recoveryKey",
  "twoFactor",
  "e2e",
  "compaction",
  "worktree",
  "mcp",
  "blame",
  "hook",
  "endpoint",
  "staging",
  "deploy",
  "ssh",
  "env",
  "hub",
  "persona",
  "commit",
  "branch",
  "push",
  "diff",
  "ci",
  "context",
  "rateLimit",
  "token",
  "api",
  "session",
] as const;
export type GlossaryKey = (typeof GLOSSARY)[number];

export function Term({ k }: { k: GlossaryKey }) {
  const { t } = useTranslation();
  const text = `${t(`glossary.${k}.word`)}: ${t(`glossary.${k}.text`)}`;
  return (
    <button
      type="button"
      data-tip={text}
      aria-label={text}
      className="ms-1 inline-flex align-middle text-fg-subtle hover:text-accent"
    >
      <CircleHelp size={12} aria-hidden="true" />
    </button>
  );
}

/** The first glossary word found in these texts, if any. */
export function useTermIn(...texts: (string | undefined)[]): GlossaryKey | undefined {
  const { t } = useTranslation();
  const haystack = texts.filter(Boolean).join(" ").toLocaleLowerCase();
  if (!haystack) return undefined;
  return GLOSSARY.find((k) =>
    t(`glossary.${k}.match`)
      .split("|")
      .some((w) => w && new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()[\]\\]/g, "\\$&")}`, "u").test(haystack)),
  );
}
