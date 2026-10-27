import { Ban, Heading } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { NAV_COLORS, type NavColor, useNavColors } from "../lib/nav-colors";
import { NAV_ITEMS } from "./nav";

/** Settings: a colour for each page's icon in the sidebar, or none. */
export function NavColors() {
  const { t } = useTranslation();
  const [colors, setColor] = useNavColors();
  const rows = [
    ...NAV_GROUPS.map((g) => ({
      key: `group:${g}`,
      label: `nav.group${g[0]?.toUpperCase()}${g.slice(1)}`,
      icon: Heading,
    })),
    ...NAV_ITEMS.filter((item) => !item.offStrip).map((item) => ({ key: item.to, label: item.label, icon: item.icon })),
  ];
  return (
    <ul className="divide-y divide-border rounded-ui border border-border">
      {rows.map((item) => (
        <li key={item.key} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
          <item.icon
            size={16}
            strokeWidth={1.75}
            style={{ color: colors[item.key] ? NAV_COLORS[colors[item.key] as NavColor] : undefined }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[13px]">{t(item.label)}</span>
          <span className="flex gap-1" role="radiogroup" aria-label={t("navColors.for", { page: t(item.label) })}>
            <button
              type="button"
              onClick={() => setColor(item.key)}
              aria-label={t("navColors.none")}
              aria-pressed={!colors[item.key]}
              data-tip={t("navColors.none")}
              className={cn(
                "flex size-5 items-center justify-center rounded-full border border-border text-fg-subtle",
                !colors[item.key] && "ring-2 ring-accent",
              )}
            >
              <Ban size={11} aria-hidden="true" />
            </button>
            {(Object.keys(NAV_COLORS) as NavColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(item.key, c)}
                aria-label={t(`navColors.${c}`)}
                aria-pressed={colors[item.key] === c}
                data-tip={t(`navColors.${c}`)}
                className={cn("size-5 rounded-full", colors[item.key] === c && "ring-2 ring-accent")}
                style={{ background: NAV_COLORS[c] }}
              />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The sidebar's headings, coloured like pages ("group:team" in the colour store). */
const NAV_GROUPS = ["team", "work", "know"] as const;

/**
 * Right-click on a sidebar page or heading: its colour, picked on the spot instead of in Settings.
 * Escape or a click elsewhere closes it.
 */
export function NavColorMenu({ at, onClose }: { at?: { x: number; y: number; key: string }; onClose: () => void }) {
  const { t } = useTranslation();
  const [colors, setColor] = useNavColors();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!at) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [at, onClose]);
  if (!at) return null;
  const pick = (color?: NavColor) => {
    setColor(at.key, color);
    onClose();
  };
  return (
    <div
      ref={box}
      role="menu"
      aria-label={t("navColors.title")}
      className="fixed z-50 flex gap-1 rounded-full border border-border bg-bg p-1 shadow-ui"
      style={{ left: at.x, top: at.y }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => pick()}
        aria-label={t("navColors.none")}
        className="flex size-5 items-center justify-center rounded-full border border-border text-fg-subtle"
      >
        <Ban size={11} aria-hidden="true" />
      </button>
      {(Object.keys(NAV_COLORS) as NavColor[]).map((c) => (
        <button
          key={c}
          type="button"
          role="menuitem"
          onClick={() => pick(c)}
          aria-label={t(`navColors.${c}`)}
          className={cn("size-5 rounded-full", colors[at.key] === c && "ring-2 ring-accent")}
          style={{ background: NAV_COLORS[c] }}
        />
      ))}
    </div>
  );
}
