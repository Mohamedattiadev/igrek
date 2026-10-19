import type { MouseEvent } from "react";
import { Link, type LinkProps, useNavigate } from "react-router";

/** Whether this tab has an earlier page of this app to go back to (React Router counts them). */
function canGoBack(): boolean {
  return ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
}

/**
 * A page's back arrow: returns to the page the user came from, like the browser's back button, so
 * "session, continue in chat, back" lands on the session again. Opened straight from a link or a
 * new tab, there is nothing to go back to and it goes to `to`, the page above this one.
 */
export function BackLink({ onClick, ...props }: LinkProps) {
  const navigate = useNavigate();
  return (
    <Link
      {...props}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || !canGoBack()) return;
        e.preventDefault();
        void navigate(-1);
      }}
    />
  );
}
