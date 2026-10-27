import { Ban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/cn";
import { NAV_COLORS, type NavColor, useNavColors } from "../lib/nav-colors";
import { NAV_ITEMS } from "./nav";

/** Settings: a colour for each page's icon in the sidebar, or none. */
export function NavColors() {
  const { t } = useTranslation();
  const [colors, setColor] = useNavColors();
  return (
    <ul className="divide-y divide-border rounded-ui border border-border">
      {NAV_ITEMS.filter((item) => !item.offStrip).map((item) => (
        <li key={item.to} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
          <item.icon
            size={16}
            strokeWidth={1.75}
            style={{ color: colors[item.to] ? NAV_COLORS[colors[item.to] as NavColor] : undefined }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 text-[13px]">{t(item.label)}</span>
          <span className="flex gap-1" role="radiogroup" aria-label={t("navColors.for", { page: t(item.label) })}>
            <button
              type="button"
              onClick={() => setColor(item.to)}
              aria-label={t("navColors.none")}
              aria-pressed={!colors[item.to]}
              data-tip={t("navColors.none")}
              className={cn(
                "flex size-5 items-center justify-center rounded-full border border-border text-fg-subtle",
                !colors[item.to] && "ring-2 ring-accent",
              )}
            >
              <Ban size={11} aria-hidden="true" />
            </button>
            {(Object.keys(NAV_COLORS) as NavColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(item.to, c)}
                aria-label={t(`navColors.${c}`)}
                aria-pressed={colors[item.to] === c}
                data-tip={t(`navColors.${c}`)}
                className={cn("size-5 rounded-full", colors[item.to] === c && "ring-2 ring-accent")}
                style={{ background: NAV_COLORS[c] }}
              />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
