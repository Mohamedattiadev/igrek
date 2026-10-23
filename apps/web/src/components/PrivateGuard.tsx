import type { PrivateKind, PrivateShape, PrivateValueInfo } from "@igrek/core";
import { Lock } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { nameFromLabel } from "./PrivatePanel";
import { Button, field } from "./ui";

const KIND_OF: Record<PrivateShape, PrivateKind> = {
  tcKimlik: "identity",
  iban: "finance",
  card: "finance",
  amount: "finance",
  account: "finance",
};

/**
 * A message looks like it holds a T.C. identity number, an IBAN, a card number or a money figure
 * that is not among the private details yet: save it (then it is hidden before the message leaves),
 * send as it is, or go back. Nothing leaves while this is open.
 */
export function PrivateGuard({
  found,
  onSend,
  onHideOnce,
  onCancel,
}: {
  /** What the server found that is not saved yet (api.checkPrivate). */
  found: { kind: PrivateShape; value: string }[];
  /** Send now; after saving, the server hides the values. */
  onSend: () => void;
  /** Hide them for this chat or question only, without saving, and send. */
  onHideOnce: () => void;
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
      // Two of a kind (two figures, two cards) get tutar and tutar_2, not one name saved over the other.
      const taken = new Set(known.map((k) => k.name));
      for (const [i, f] of found.entries()) {
        const base = nameFromLabel(i === 0 ? label : t(`private.shape_${f.kind}`)) || f.kind;
        let name = base;
        for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
        taken.add(name);
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
        <span>
          {t("private.guard", {
            what: [...new Set(found.map((f) => inSentence(t(`private.shape_${f.kind}`))))].join(", "),
          })}
        </span>
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
        <Button size="sm" variant="ghost" onClick={onHideOnce} data-tip={t("private.guardOnceTip")}>
          {t("private.guardOnce")}
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

/** "Mali rakam" reads "mali rakam" inside a sentence; a name in capitals (IBAN, T.C.) stays as it is. */
const inSentence = (label: string) =>
  /^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLocaleLowerCase() + label.slice(1) : label;

// What a chat hid for itself only is named for what it is (Chats.hideOnce): amount_1, iban_2.
const SHAPE_OF: Record<string, PrivateShape> = {
  amount: "amount",
  account: "account",
  iban: "iban",
  card: "card",
  tckimlik: "tcKimlik",
};

/** A placeholder's name as the user knows it: a saved detail by its label, the rest by what it is. */
function usePrivateLabel(): (name: string) => string {
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
  return (name) => {
    const shape = SHAPE_OF[name.replace(/_\d+$/, "")];
    return labels[name] ?? (shape ? t(`private.shape_${shape}`) : name);
  };
}

function PrivateChips({ text }: { text: string }) {
  const { t } = useTranslation();
  const label = usePrivateLabel();
  const parts: ReactNode[] = [];
  let at = 0;
  for (const m of text.matchAll(/\[\[private:([a-z0-9_]{2,40})\]\]/g)) {
    const start = m.index ?? 0;
    parts.push(text.slice(at, start));
    parts.push(
      <span
        key={start}
        data-tip={t("private.hiddenTip")}
        className="inline-flex items-center gap-1 rounded bg-bg px-1.5 align-baseline text-[0.9em] text-fg-muted"
      >
        <Lock size={11} aria-hidden="true" />
        {label(m[1] ?? "")}
      </span>,
    );
    at = start + m[0].length;
  }
  parts.push(text.slice(at));
  return parts;
}

/**
 * The user's own message with its private details shown as what they are ("Maaş", "Mali rakam")
 * behind a lock, not as the [[private:...]] the AI got.
 */
export function PrivateText({ text }: { text: string }) {
  return text.includes("[[private:") ? <PrivateChips text={text} /> : text;
}

/** "2 private details hidden: T.C. kimlik, IBAN": under a message, by label where the name is known. */
export function PrivateNotice({ names }: { names: string[] }) {
  const { t } = useTranslation();
  const label = usePrivateLabel();
  return (
    <p className="flex items-center justify-end gap-1.5 text-[11px] text-fg-subtle">
      <Lock size={11} aria-hidden="true" />
      {t("private.hidden", { count: names.length, what: names.map(label).join(", ") })}
    </p>
  );
}

/** An answer that uses placeholders: copy it with the real values, put in here on this computer. */
export function CopyWithPrivate({ text, chatId }: { text: string; chatId?: string }) {
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
          .fillPrivate(text, chatId)
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
