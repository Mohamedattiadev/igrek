import { cn } from "../lib/cn";

/**
 * The Igrek mark: a plain "Y" (read "why"). One arm takes the accent color, the rest the text color,
 * so it follows the theme and reads on light and dark alike. The favicons in index.html and member.html
 * and docs/logo.svg draw the same shape with fixed colors, since CSS variables do not reach them.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-6 shrink-0", className)}
      fill="none"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 6.5 16 16.5V26" stroke="var(--fg)" />
      <path d="M24 6.5 16 16.5" stroke="var(--accent)" />
    </svg>
  );
}
