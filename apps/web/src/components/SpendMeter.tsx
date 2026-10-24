import type { ChatSpend, TurnEstimate, TurnSpend } from "@igrek/core";
import { Gauge, Hourglass } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { compactNumber } from "../lib/format";

/** "3% of the limit" when the plan reported it, otherwise the tokens; never a made-up number. */
function headline(spend: TurnSpend, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (spend.limitPct !== undefined) return t("spend.limit", { pct: percent(spend.limitPct) });
  return t("spend.tokens", { tokens: compactNumber(spend.tokens) });
}

/** Below one percent still shows as "<1" rather than a misleading zero. */
function percent(share: number): string {
  const pct = share * 100;
  return pct > 0 && pct < 1 ? "<1" : String(Math.round(pct));
}

const dollars = (usd?: number) => (usd === undefined ? undefined : `$${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}`);

/** What the last turn used, in the chat's header; the hint adds the whole chat and the API-price estimate. */
export function SpendMeter({ spend }: { spend: ChatSpend }) {
  const { t } = useTranslation();
  const tip = [
    t("spend.turnTip", {
      tokens: compactNumber(spend.turn.tokens),
      output: compactNumber(spend.turn.outputTokens),
    }),
    spend.turn.limitPct !== undefined ? t("spend.turnLimit", { pct: percent(spend.turn.limitPct) }) : "",
    t("spend.chatTip", { count: spend.total.turns, tokens: compactNumber(spend.total.tokens) }),
    spend.total.limitPct !== undefined ? t("spend.turnLimit", { pct: percent(spend.total.limitPct) }) : "",
    spend.turn.costUsd !== undefined
      ? t("spend.cost", { turn: dollars(spend.turn.costUsd), total: dollars(spend.total.costUsd) })
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className="hidden items-center gap-1 text-[11px] text-fg-subtle sm:flex" data-tip={tip}>
      <Gauge size={12} aria-hidden="true" />
      {t("spend.label", { what: headline(spend.turn, t) })}
    </span>
  );
}

/**
 * Before the next message: what a turn in this project usually takes of the 5-hour limit and what is
 * left. When a big turn would not fit, it says so in the warning colour, so the user can wait for the
 * reset or hand over to Codex instead of being cut off halfway.
 */
export function EstimateMeter({ estimate }: { estimate: TurnEstimate }) {
  const { t } = useTranslation();
  const short = estimate.left !== undefined && estimate.left < estimate.high;
  const tip = [
    t("spend.estimateTip", {
      count: estimate.samples,
      typical: percent(estimate.typical),
      high: percent(estimate.high),
    }),
    estimate.left !== undefined ? t("spend.leftTip", { pct: percent(estimate.left) }) : "",
    short ? t("spend.shortTip") : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={cn("hidden items-center gap-1 text-[11px] sm:flex", short ? "text-warning" : "text-fg-subtle")}
      data-tip={tip}
    >
      <Hourglass size={12} aria-hidden="true" />
      {estimate.left !== undefined
        ? t("spend.estimateLeft", { pct: percent(estimate.typical), left: percent(estimate.left) })
        : t("spend.estimate", { pct: percent(estimate.typical) })}
    </span>
  );
}
