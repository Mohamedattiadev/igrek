import { type RefObject, useEffect, useRef, useState } from "react";

/** How many messages are drawn at first, and how many more each time the list is scrolled up. */
const STEP = 60;
/** Asked for a message that is not drawn yet (a quote, a search hit): the list opens up to it. */
export const SHOW_EVENT = "igrek:chat-show";

/**
 * A long conversation draws only its newest messages (plan.md 19.10); scrolled near the top, the
 * next older ones are added and the view stays where it was. A message that must be seen (where
 * unread ones start, one jumped to) is always included.
 */
export function useMessageWindow(
  total: number,
  conversation: string,
  list: RefObject<HTMLDivElement | null>,
  mustShow?: number,
): { start: number; sentinel: RefObject<HTMLDivElement | null> } {
  const [shown, setShown] = useState(STEP);
  const sentinel = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another conversation starts small again
  useEffect(() => setShown(STEP), [conversation]);
  const start = Math.max(0, Math.min(total - shown, mustShow ?? Number.POSITIVE_INFINITY));
  useEffect(() => {
    const el = sentinel.current;
    const box = list.current;
    if (!el || !box || start === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        const before = box.scrollHeight;
        setShown((s) => s + STEP);
        requestAnimationFrame(() => {
          box.scrollTop += box.scrollHeight - before;
        });
      },
      { root: box, rootMargin: "300px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [start, list]);
  useEffect(() => {
    const all = () => setShown(Number.POSITIVE_INFINITY);
    addEventListener(SHOW_EVENT, all);
    return () => removeEventListener(SHOW_EVENT, all);
  }, []);
  return { start, sentinel };
}
