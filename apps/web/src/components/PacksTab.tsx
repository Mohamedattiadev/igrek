import type { CatalogEntry, PackPreview } from "@igrek/core";
import { Download, FileUp, Globe, Library, PackageCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useBusyState } from "../lib/background";
import { usePersonaLabel, usePersonas } from "../lib/personas";
import { Badge, Button, Card, field } from "./ui";

type Opened = { preview: PackPreview; pack: unknown };

/** One package opened: what it holds, the parts to take, and the rules it comes in under. */
function PackPreviewCard({ opened, onDone }: { opened: Opened; onDone: (message: string) => void }) {
  const { t } = useTranslation();
  const { preview } = opened;
  const [personas, setPersonas] = useState(() => preview.personas.filter((p) => !p.exists).map((p) => p.id));
  const [flows, setFlows] = useState(() => preview.flows.filter((f) => f.ok).map((f) => f.name));
  const [error, setError] = useState<string>();
  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h3 className="text-[14px] font-semibold">{preview.name}</h3>
        {preview.author && <p className="text-[12px] text-fg-subtle">{t("packs.by", { author: preview.author })}</p>}
        {preview.description && <p className="mt-1 text-[13px] text-fg-muted">{preview.description}</p>}
      </div>
      <p className="flex items-start gap-1.5 rounded-ui bg-bg-subtle p-2 text-[12px] text-fg-muted">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        {t("packs.rules")}
      </p>
      {preview.personas.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("packs.experts")}
          </legend>
          {preview.personas.map((p) => (
            <label key={p.id} className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-1"
                disabled={p.exists}
                checked={personas.includes(p.id)}
                onChange={() => toggle(personas, setPersonas, p.id)}
              />
              <span className="min-w-0">
                <span className="font-medium">{p.name}</span>
                {p.role && <span className="text-fg-muted"> · {p.role}</span>}
                {p.exists && <span className="block text-[11.5px] text-fg-subtle">{t("packs.exists")}</span>}
                {!p.exists && (p.asked.tools === "edit" || p.asked.web) && (
                  <span className="block text-[11.5px] text-warning">{t("packs.downgraded")}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {preview.flows.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">
            {t("packs.flows")}
          </legend>
          {preview.flows.map((f) => (
            <label key={f.name} className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                className="mt-1"
                disabled={!f.ok}
                checked={flows.includes(f.name)}
                onChange={() => toggle(flows, setFlows, f.name)}
              />
              <span className="min-w-0">
                <span className="font-mono text-[12.5px]">{f.name}</span>{" "}
                <Badge>{t("packs.steps", { count: f.steps })}</Badge>
                {f.description && <span className="block text-fg-muted">{f.description}</span>}
                {f.reason && <span className="block text-[11.5px] text-danger">{t(`packs.refused_${f.reason}`)}</span>}
                {f.ok && f.exists && <span className="block text-[11.5px] text-fg-subtle">{t("packs.replaces")}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={PackageCheck}
          disabled={!personas.length && !flows.length}
          onClick={() =>
            void api
              .installPack(opened.pack, { personas, flows })
              .then((r) => onDone(t("packs.installed", { experts: r.personas.length, flows: r.flows.length })))
              .catch((err: Error) => setError(err.message))
          }
        >
          {t("packs.install")}
        </Button>
      </div>
    </Card>
  );
}

/** Your own experts (and built-ins you changed) and package flows, as one file to share. */
function MakePack() {
  const { t } = useTranslation();
  const { personas } = usePersonas();
  const label = usePersonaLabel();
  const mine = personas.filter((p) => !p.builtin || p.edited);
  const [flows, setFlows] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    api
      .packFlows()
      .then((list) => current && setFlows(list))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const toggle = (id: string) => setPicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));
  if (!mine.length && !flows.length) return <p className="text-[13px] text-fg-muted">{t("packs.nothingToShare")}</p>;
  return (
    <div className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("packs.name")}
        aria-label={t("packs.name")}
        className={`${field} w-full max-w-sm`}
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {mine.map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-[13px]">
            <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
            {label(p).name}
          </label>
        ))}
        {flows.map((f) => (
          <label key={f} className="flex items-center gap-1.5 font-mono text-[12.5px]">
            <input type="checkbox" checked={picked.includes(`flow:${f}`)} onChange={() => toggle(`flow:${f}`)} />
            {f}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button
        icon={Download}
        disabled={!name.trim() || !picked.length}
        onClick={() =>
          void api
            .buildPack({
              name: name.trim(),
              personas: picked.filter((x) => !x.startsWith("flow:")),
              flows: picked.filter((x) => x.startsWith("flow:")).map((x) => x.slice(5)),
            })
            .then((pack) => {
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }));
              a.download = `${
                name
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-") || "pack"
              }.igrek-pack.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            })
            .catch((err: Error) => setError(err.message))
        }
      >
        {t("packs.download")}
      </Button>
    </div>
  );
}

/**
 * Packages of experts and team flows (plan.md 10): Igrek's reviewed catalog, a file or an address of
 * your own, always previewed first; and a package made from your own experts to share.
 */
export function PacksTab() {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogEntry[]>();
  const [url, setUrl] = useState("");
  const [opened, setOpened] = useState<Opened>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useBusyState("PacksTab.PacksTab");
  const file = useRef<HTMLInputElement>(null);
  const open = async (source: { pack?: unknown; url?: string }) => {
    setBusy(true);
    setNote(undefined);
    try {
      setOpened(await api.previewPack(source));
    } catch (err) {
      setNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">{t("packs.catalog")}</h2>
        <p className="text-[12.5px] text-fg-muted">{t("packs.catalogHint")}</p>
        {catalog === undefined ? (
          <Button
            icon={Library}
            disabled={busy}
            onClick={() =>
              void api
                .packCatalog()
                .then(setCatalog)
                .catch((err: Error) => setNote(err.message))
            }
          >
            {t("packs.loadCatalog")}
          </Button>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {catalog.map((entry) => (
              <li key={entry.url}>
                <Card className="flex h-full flex-col gap-1 p-3">
                  <p className="text-[13px] font-medium">{entry.name}</p>
                  <p className="flex-1 text-[12px] text-fg-muted">{entry.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] text-fg-subtle">{entry.author}</span>
                    <Button size="sm" disabled={busy} onClick={() => void open({ url: entry.url })}>
                      {t("packs.preview")}
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
            {catalog.length === 0 && <li className="text-[13px] text-fg-muted">{t("packs.catalogEmpty")}</li>}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">{t("packs.openOwn")}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={FileUp} disabled={busy} onClick={() => file.current?.click()}>
            {t("packs.fromFile")}
          </Button>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              try {
                await open({ pack: JSON.parse(await picked.text()) });
              } catch {
                setNote(t("packs.notJson"));
              }
            }}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            aria-label={t("packs.fromUrl")}
            className={`${field} min-w-0 flex-1`}
          />
          <Button icon={Globe} disabled={busy || !url.startsWith("https://")} onClick={() => void open({ url })}>
            {t("packs.preview")}
          </Button>
        </div>
      </section>
      {note && <p className="text-[12.5px] text-fg-muted">{note}</p>}
      {opened && (
        <PackPreviewCard
          key={opened.preview.name}
          opened={opened}
          onDone={(message) => {
            setOpened(undefined);
            setNote(message);
          }}
        />
      )}
      <section className="space-y-2">
        <h2 className="text-[14px] font-semibold">{t("packs.make")}</h2>
        <p className="text-[12.5px] text-fg-muted">{t("packs.makeHint")}</p>
        <MakePack />
      </section>
    </div>
  );
}
