import type { PrivateKind, PrivateShape, PrivateValueInfo } from "@igrek/core";
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { nameFromLabel } from "./PrivatePanel";
import { Button, field } from "./ui";

const KIND_OF: Record<PrivateShape, PrivateKind> = { tcKimlik: "identity", iban: "finance", card: "finance" };

/**
 * A message looks like it holds a T.C. identity number, an IBAN or a card number that is not among
 * the private details yet: save it (then it is hidden before the message leaves), send as it is, or
 * go back. Nothing leaves while this is open.
 */
export function PrivateGuard({
  found,
  onSend,
  onCancel,
}: {
  /** What the server found that is not saved yet (api.checkPrivate). */
  found: { kind: PrivateShape; value: string }[];
  /** Send now; after saving, the server hides the values. */
  onSend: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const first = found[0];
  const [label, setLabel] = useState(first ? t(`private.shape_${first.kind}`) : "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [known, setKnown] = useState<PrivateValueInfo[]>([]);
  useEffect(() => {
    let current = true;
    api
      .privateValues()
      .then((l) => current && setKnown(l))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  if (!first) return null;
  const save = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // Every value found is saved; the first gets the label typed here, the others their kind's name.
      for (const [i, f] of found.entries()) {
        const base = nameFromLabel(i === 0 ? label : t(`private.shape_${f.kind}`)) || f.kind;
        let name = base;
        for (let n = 2; known.some((k) => k.name === name); n++) name = `${base}_${n}`;
        await api.savePrivateValue({
          name,
          label: i === 0 ? label.trim() : t(`private.shape_${f.kind}`),
          kind: KIND_OF[f.kind],
          value: f.value,
        });
      }
      onSend();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-2 space-y-2 rounded-ui border border-warning bg-warning-soft p-3 text-[12.5px]">
      <p className="flex items-start gap-2">
        <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <span>{t("private.guard", { what: found.map((f) => t(`private.shape_${f.kind}`)).join(", ") })}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          aria-label={t("private.label")}
          className={`${field} h-7 min-w-0 flex-1`}
        />
        <Button size="sm" variant="primary" disabled={busy || !label.trim()} onClick={() => void save()}>
          {t("private.guardSave")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onSend}>
          {t("private.guardSend")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("persona.cancel")}
        </Button>
      </div>
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}

/** "2 private details hidden: T.C. kimlik, IBAN": under a message, by label where the name is known. */
export function PrivateNotice({ names }: { names: string[] }) {
  const { t } = useTranslation();
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let current = true;
    api
      .privateValues()
      .then((l) => current && setLabels(Object.fromEntries(l.map((v) => [v.name, v.label]))))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return (
    <p className="flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
      <Lock size={11} aria-hidden="true" />
      {t("private.hidden", { count: names.length, what: names.map((n) => labels[n] ?? n).join(", ") })}
    </p>
  );
}

/** An answer that uses placeholders: copy it with the real values, put in here on this computer. */
export function CopyWithPrivate({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  if (!text.includes("[[private:")) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={Lock}
      onClick={() =>
        void api
          .fillPrivate(text)
          .then((r) => navigator.clipboard.writeText(r.text))
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
      }
      data-tip={t("private.copyTip")}
    >
      {done ? t("team.copied") : t("private.copy")}
    </Button>
  );
}
