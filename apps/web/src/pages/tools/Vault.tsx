import type { VaultEntry } from "@godeye/core";
import { Check, Copy, Eye, EyeOff, KeyRound, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge, Button, Card, Dialog, EmptyState, field } from "../../components/ui";
import { cn } from "../../lib/cn";
import { relativeTime } from "../../lib/format";
import { useProjects } from "../../lib/live";
import { vaultApi } from "../../lib/ops-api";

const ROTATIONS = [0, 30, 90, 180, 365];

function Row({ e, projectName, onChange }: { e: VaultEntry; projectName?: string; onChange: () => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string>();
  const [copied, setCopied] = useState(false);
  const reveal = async () => setValue(value === undefined ? (await vaultApi.reveal(e.ref)).value : undefined);
  return (
    <li className="flex flex-wrap items-center gap-2 px-pad py-2">
      <KeyRound size={14} className={e.due ? "text-danger" : "text-fg-subtle"} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[12.5px] font-medium">{e.name}</p>
        <p className="truncate text-[11px] text-fg-subtle">
          {projectName ?? t("vault.noProject")}
          {e.file && ` · ${e.file}`}
          {e.note && ` · ${e.note}`}
          {e.changedAt && ` · ${t("vault.changed", { when: relativeTime(e.changedAt) })}`}
        </p>
        {value !== undefined && (
          <code className="mt-1 block break-all rounded bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px]">{value}</code>
        )}
      </div>
      {e.sameAs > 0 && (
        <Badge tone="warning">
          <span data-tip={t("vault.sameTip")}>{t("vault.same", { count: e.sameAs })}</span>
        </Badge>
      )}
      {e.due && <Badge tone="danger">{t("vault.due")}</Badge>}
      <select
        value={e.rotateDays}
        onChange={(ev) => void vaultApi.rotation(e.ref, Number(ev.target.value)).then(onChange)}
        className={cn(field, "h-7 text-xs")}
        aria-label={t("vault.rotate")}
      >
        {ROTATIONS.map((d) => (
          <option key={d} value={d}>
            {d ? t("vault.every", { count: d }) : t("vault.noReminder")}
          </option>
        ))}
      </select>
      {e.due && (
        <Button
          size="sm"
          variant="ghost"
          icon={RefreshCcw}
          onClick={() => void vaultApi.rotated(e.ref).then(onChange)}
          data-tip={t("vault.rotatedTip")}
        >
          {t("vault.rotated")}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        icon={value === undefined ? Eye : EyeOff}
        aria-label={t("vault.reveal")}
        onClick={() => void reveal()}
      />
      <Button
        size="sm"
        variant="ghost"
        icon={copied ? Check : Copy}
        aria-label={t("vault.copy")}
        onClick={async () => {
          await navigator.clipboard.writeText((await vaultApi.reveal(e.ref)).value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      />
      {e.kind === "item" && (
        <Button
          size="sm"
          variant="ghost"
          icon={Trash2}
          aria-label={t("vault.remove")}
          onClick={() => void vaultApi.remove(e.ref.slice(5)).then(onChange)}
        />
      )}
    </li>
  );
}

function AddItem({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", value: "", note: "", projectId: "" });
  const [error, setError] = useState<string>();
  return (
    <>
      <Button icon={Plus} onClick={() => setOpen(true)}>
        {t("vault.add")}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} label={t("vault.add")}>
        <form
          className="space-y-3 p-5"
          onSubmit={async (ev) => {
            ev.preventDefault();
            try {
              await vaultApi.add({ ...form, projectId: form.projectId || undefined });
              setForm({ name: "", value: "", note: "", projectId: "" });
              setOpen(false);
              onAdded();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <h2 className="text-[15px] font-semibold">{t("vault.add")}</h2>
          <p className="text-xs text-fg-muted">{t("vault.addHint")}</p>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder={t("vault.name")}
            aria-label={t("vault.name")}
            className={cn(field, "w-full font-mono")}
          />
          <input
            type="password"
            autoComplete="off"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
            placeholder={t("vault.value")}
            aria-label={t("vault.value")}
            className={cn(field, "w-full font-mono")}
          />
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder={t("vault.note")}
            aria-label={t("vault.note")}
            className={cn(field, "w-full")}
          />
          <select
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            className={cn(field, "w-full")}
            aria-label={t("suite.project")}
          >
            <option value="">{t("vault.noProject")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("persona.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={!form.name.trim() || !form.value}>
              {t("vault.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Secret vault (plan.md 12): every project's keys in one place, never shown unless you ask. */
export function VaultTab() {
  const { t } = useTranslation();
  const projects = useProjects();
  const [list, setList] = useState<VaultEntry[]>();
  const [query, setQuery] = useState("");
  const load = useCallback(
    () =>
      void vaultApi
        .list()
        .then(setList)
        .catch(() => undefined),
    [],
  );
  useEffect(load, [load]);
  const q = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (e) =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      (projects.find((p) => p.id === e.projectId)?.name ?? "").toLowerCase().includes(q),
  );
  const due = (list ?? []).filter((e) => e.due).length;
  const reused = (list ?? []).filter((e) => e.sameAs > 0).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{t("vault.intro")}</p>
        <AddItem onAdded={load} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("vault.search")}
          aria-label={t("vault.search")}
          className={cn(field, "min-w-0 flex-1 basis-48")}
        />
        <span className="text-xs text-fg-muted">
          {t("vault.count", { count: list?.length ?? 0 })}
          {due > 0 && ` · ${t("vault.dueCount", { count: due })}`}
          {reused > 0 && ` · ${t("vault.reusedCount", { count: reused })}`}
        </span>
      </div>
      {list && !list.length ? (
        <EmptyState icon={KeyRound} title={t("vault.emptyTitle")} body={t("vault.emptyBody")} />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {shown.map((e) => (
              <Row key={e.ref} e={e} projectName={projects.find((p) => p.id === e.projectId)?.name} onChange={load} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
