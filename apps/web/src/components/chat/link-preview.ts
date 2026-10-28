import type { LinkPreview } from "@igrek/core";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

/** The first web address in what is being written. */
const firstLink = (text: string) => text.match(/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/)?.[0];

/**
 * The card of the first link in the message being written, like WhatsApp's: asked for once the
 * writer stops typing, dropped with its X (that address is then not asked again).
 */
export function useLinkPreview(text: string): {
  preview?: LinkPreview;
  dismiss: () => void;
  reset: () => void;
} {
  const [preview, setPreview] = useState<LinkPreview>();
  const dismissed = useRef(new Set<string>());
  const url = firstLink(text);
  useEffect(() => {
    if (!url || dismissed.current.has(url)) return setPreview(undefined);
    let current = true;
    const timer = setTimeout(
      () =>
        void api
          .linkPreview(url)
          .then((p) => current && setPreview(p))
          .catch(() => current && setPreview(undefined)),
      600,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [url]);
  return {
    preview: preview && preview.url === url ? preview : undefined,
    dismiss: () => {
      if (url) dismissed.current.add(url);
      setPreview(undefined);
    },
    reset: () => {
      dismissed.current.clear();
      setPreview(undefined);
    },
  };
}
