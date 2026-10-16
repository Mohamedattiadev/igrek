import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import { Contrast, Rows3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useSettings } from "../lib/settings";
import { NAV_ITEMS } from "./nav";
import { Kbd } from "./ui";

function Item({ icon: Icon, label, onSelect }: { icon: LucideIcon; label: string; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13px] text-fg-muted data-[selected=true]:bg-bg-hover data-[selected=true]:text-fg"
    >
      <Icon size={15} strokeWidth={1.75} />
      {label}
    </Command.Item>
  );
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, update } = useSettings();

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("palette.placeholder")}
      overlayClassName="fixed inset-0 bg-black/25"
      contentClassName="fixed left-1/2 top-[15vh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-bg text-fg shadow-ui"
    >
      <div className="flex items-center border-b border-border px-4">
        <Command.Input
          placeholder={t("palette.placeholder")}
          className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-fg-subtle"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
        <Command.Empty className="py-8 text-center text-[13px] text-fg-subtle">{t("palette.empty")}</Command.Empty>
        <Command.Group
          heading={t("palette.goTo")}
          className="px-1 text-[11px] text-fg-subtle [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:py-1.5"
        >
          {NAV_ITEMS.map((item) => (
            <Item key={item.to} icon={item.icon} label={t(item.label)} onSelect={() => run(() => navigate(item.to))} />
          ))}
        </Command.Group>
        <Command.Group
          heading={t("palette.actions")}
          className="px-1 text-[11px] text-fg-subtle [&_[cmdk-group-heading]]:px-1.5 [&_[cmdk-group-heading]]:py-1.5"
        >
          <Item
            icon={Contrast}
            label={t("palette.toggleTheme")}
            onSelect={() =>
              run(() => {
                const dark = document.documentElement.dataset.theme === "dark";
                void update({ theme: dark ? "light" : "dark" });
              })
            }
          />
          <Item
            icon={Rows3}
            label={t("palette.toggleDensity")}
            onSelect={() =>
              run(() => void update({ density: settings.density === "compact" ? "comfortable" : "compact" }))
            }
          />
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
