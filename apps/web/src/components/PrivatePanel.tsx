import { PRIVATE_KINDS, PRIVATE_NAME, type PrivateKind, type PrivateValueInfo, placeholderOf } from "@igrek/core";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { Button, field } from "./ui";

/** "T.C. kimlik" → "t_c_kimlik": a placeholder name from a label, in the letters a name may use. */
export function nameFromLabel(label: string): string {
  return label
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşü]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" })[c] ?? c)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/**
 * The user's private details (core/private.ts): a label and a short name for each, the value only
 * typed in, never shown again. A chat hides them before a message leaves; the AI sees the placeholder.
 */
export function PrivatePanel({ initial }: { initial?: { label?: string; value?: string } } = {}) {
  const { t } = useTranslation();
  const [list, setList] = useState<PrivateValueInfo[]>([]);
  const [label, setLabel] = useState(initial?.label ?? "");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PrivateKind>("identity");
  const [value, setValue] = useState(initial?.value ?? "");
  const [error, setError] = useState<string>();
  useEffect(() => {
    let current = true;
    api
      .privateValues()
      .then((l) => current && setList(l))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const short = name || nameFromLabel(label);
  const save = () => {
    setError(undefined);
    api
      .savePrivateValue({ name: short, label: label.trim(), kind, value })
      .then((next) => {
        setList(next);
        setLabel("");
        setName("");
        setValue("");
      })
      .catch((err: Error) => setError(err.message));
  };
  return (
    <div className="space-y-3">
      {list.length > 0 && (
        <ul className="divide-y divide-border rounded-ui border border-border">
          {list.map((item) => (
            <li key={item.name} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
              <Lock size={13} className="shrink-0 text-fg-subtle" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                {item.label} <span className="text-fg-subtle">· {t(`private.kind_${item.kind}`)}</span>
              </span>
              <code className="hidden truncate font-mono text-[11.5px] text-fg-muted sm:inline">
                {placeholderOf(item.name)}
              </code>
              <button
                type="button"
                onClick={() =>
                  window.confirm(t("private.removeConfirm", { label: item.label })) &&
                  void api.removePrivateValue(item.name).then(setList)
                }
                aria-label={t("private.remove")}
                title={t("private.remove")}
                className="shrink-0 rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t("private.label")}
          aria-label={t("private.label")}
          className={field}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as PrivateKind)}
          aria-label={t("private.kind")}
          className={field}
        >
          {PRIVATE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`private.kind_${k}`)}
            </option>
          ))}
        </select>
        <input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("private.value")}
          aria-label={t("private.value")}
          className={field}
        />
        <input
          value={short}
          onChange={(e) => setName(e.target.value.toLowerCase())}
          placeholder={t("private.name")}
          aria-label={t("private.name")}
          data-tip={t("private.nameTip")}
          className={`${field} font-mono`}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button
        icon={Plus}
        disabled={!label.trim() || value.trim().length < 3 || !PRIVATE_NAME.test(short)}
        onClick={save}
      >
        {t("private.add")}
      </Button>
    </div>
  );
}
