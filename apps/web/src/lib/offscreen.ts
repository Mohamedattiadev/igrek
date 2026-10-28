import type { CSSProperties } from "react";

/**
 * A row of a long list (a project's sessions) the browser does not lay out or paint while it is
 * off screen (plan.md 19.10): long lists stay smooth without a list library, and as an inline
 * style it adds nothing to the first screen's CSS. The size is a guess the browser replaces with
 * the real one once it has seen the row. Only for rows nothing overflows from: it clips like
 * overflow: hidden (menus and hover bars of chat messages would be cut).
 */
export const offscreen = (height = 72): CSSProperties => ({
  contentVisibility: "auto",
  containIntrinsicSize: `auto ${height}px`,
});
