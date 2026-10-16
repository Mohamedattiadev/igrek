import type { HealthFlag, HealthLevel, SessionHealth } from "@godeye/core";

export interface HealthInput {
  contextTokens: number;
  models: Record<string, number>;
  userMessages: number;
  recentErrors: number[];
  compactions: number;
  updatedAt: number;
  /** Window size reported by the tool (Codex does); otherwise guessed from the model. */
  contextWindow?: number;
}

const ACTIVE_WINDOW = 15 * 60_000;

function contextWindow(models: Record<string, number>, contextTokens: number): number {
  const large = Object.keys(models).some((model) => model.includes("[1m]")) || contextTokens > 200_000;
  return large ? 1_000_000 : 200_000;
}

/**
 * Session health (plan.md 1.8). Long, crowded sessions are where AI starts to
 * forget and invent things, so this scores how "tired" a session is.
 */
export function sessionHealth(input: HealthInput, now = Date.now()): SessionHealth {
  const window = input.contextWindow ?? contextWindow(input.models, input.contextTokens);
  const fill = Math.min(1, input.contextTokens / window);
  const flags: HealthFlag[] = [];
  let score = 100;

  if (fill >= 0.8) flags.push("context-high");
  else if (fill >= 0.5) flags.push("context-mid");
  score -= Math.round(fill * 50);

  if (input.userMessages > 60) {
    flags.push("long");
    score -= 15;
  }
  const lastHour = input.recentErrors.filter((at) => input.updatedAt - at < 60 * 60_000).length;
  if (lastHour >= 5) {
    flags.push("errors");
    score -= Math.min(20, lastHour * 2);
  }
  if (input.compactions >= 2) {
    flags.push("compacted");
    score -= Math.min(15, input.compactions * 5);
  }
  score = Math.max(0, score);
  const level: HealthLevel = score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
  const active = now - input.updatedAt < ACTIVE_WINDOW;
  return {
    score,
    level,
    contextFill: fill,
    contextWindow: window,
    flags,
    suggestFresh: active && level === "bad",
    suggestCompact: active && level !== "bad" && fill >= 0.6,
  };
}

export function isActive(updatedAt: number, now = Date.now()): boolean {
  return now - updatedAt < ACTIVE_WINDOW;
}
