import type { InstalledSkill } from "@igrek/core";
import { Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SkillsDialog } from "../../components/SkillsDialog";
import { Button, Card } from "../../components/ui";
import { api } from "../../lib/api";

/** Installed skills, and the catalog to add more (the same window as "/" in a chat). */
export function SkillsTab() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<InstalledSkill[]>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [reload, setReload] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload after an install or removal
  useEffect(() => {
    let current = true;
    void api
      .skills()
      .then((list) => current && setSkills(list))
      .catch((err: Error) => current && setError(err.message));
    return () => {
      current = false;
    };
  }, [reload, open]);
  const remove = async (name: string) => {
    setError(undefined);
    try {
      await api.removeSkill(name);
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="mx-auto max-w-3xl space-y-3 text-[13px]">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-fg-muted">{t("skills.intro")}</p>
        <Button variant="primary" icon={Search} onClick={() => setOpen(true)}>
          {t("skills.find")}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {skills?.length === 0 && <p className="text-fg-muted">{t("skills.empty")}</p>}
      {skills?.map((s) => (
        <Card key={s.name} className="flex items-start gap-3 p-3">
          <Sparkles size={15} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[12.5px] font-medium">/{s.name}</p>
            {s.description && <p className="line-clamp-2 text-xs text-fg-muted">{s.description}</p>}
            {s.source && <p className="text-[11px] text-fg-subtle">{s.source}</p>}
          </div>
          <Button
            size="sm"
            variant="ghost"
            icon={Trash2}
            onClick={() => void remove(s.name)}
            aria-label={t("skills.remove", { name: s.name })}
          />
        </Card>
      ))}
      <SkillsDialog open={open} query="" onClose={() => setOpen(false)} onUse={() => setOpen(false)} />
    </div>
  );
}
