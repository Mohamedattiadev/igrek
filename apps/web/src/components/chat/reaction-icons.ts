import type { ChatReaction } from "@igrek/core";
import { Check, Eye, Heart, Laugh, type LucideIcon, PartyPopper, ThumbsUp } from "lucide-react";

/** Icons, not emoji (AGENTS.md): each reaction is a lucide icon with a colour of its own. */
export const REACTION_ICONS: Record<ChatReaction, { icon: LucideIcon; tone: string }> = {
  like: { icon: ThumbsUp, tone: "text-accent" },
  love: { icon: Heart, tone: "text-danger" },
  done: { icon: Check, tone: "text-success" },
  laugh: { icon: Laugh, tone: "text-warning" },
  seen: { icon: Eye, tone: "text-fg-muted" },
  celebrate: { icon: PartyPopper, tone: "text-accent" },
};
