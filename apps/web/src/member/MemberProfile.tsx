import { Bell, ImageUp, LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card, PageHeader, Segmented } from "../components/ui";
import i18n, { loadBundled } from "../lib/i18n";
import type { MemberClient } from "./client";
import { applyTheme, readTheme, type ThemeChoice } from "./hooks";
import { field } from "./MemberBoard";
import { PersonAvatar } from "./MemberMessage";

const COLORS = ["#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#16a34a", "#0891b2", "#475569"];

/** A picture made small enough for the hub (it keeps up to 48 KB): 128 px, JPEG. */
async function smallPicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 128, 128);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** The browser's own notices: asked for once, here, never on page load. */
function Notices() {
  const { t } = useTranslation();
  const can = typeof Notification !== "undefined";
  const [state, setState] = useState(can ? Notification.permission : "denied");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="min-w-0 flex-1 text-[12.5px] text-fg-muted">
        {state === "granted"
          ? t("member.noticesOn")
          : state === "denied"
            ? t("member.noticesBlocked")
            : t("member.noticesAsk")}
      </p>
      {state === "default" && (
        <Button icon={Bell} onClick={() => void Notification.requestPermission().then(setState)}>
          {t("member.noticesTurnOn")}
        </Button>
      )}
    </div>
  );
}

/** Name, picture, language and look (plan.md 20.1); the name and picture are the team's, the rest this browser's. */
export function MemberProfile({ client }: { client: MemberClient }) {
  const { t } = useTranslation();
  const me = client.me();
  const [name, setName] = useState(me?.displayName ?? "");
  const [theme, setTheme] = useState<ThemeChoice>(readTheme);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  if (!me) return null;
  const save = (patch: Parameters<MemberClient["updateProfile"]>[0]) =>
    client
      .updateProfile(patch)
      .then(() => {
        setError(undefined);
        setSaved(true);
      })
      .catch((err: Error) => setError(err.message));
  const language = i18n.language.startsWith("tr") ? "tr" : "en";
  return (
    <>
      <PageHeader title={t("member.profile")} />
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4 md:p-6">
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <PersonAvatar client={client} id={me.id} size={56} />
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => void save({ avatar: c })}
                  aria-label={c}
                  className="size-6 rounded-full ring-1 ring-border"
                  style={{ background: c }}
                />
              ))}
              <Button size="sm" icon={ImageUp} onClick={() => picker.current?.click()}>
                {t("member.picture")}
              </Button>
              <input
                ref={picker}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void smallPicture(file).then((avatar) => save({ avatar }));
                  e.target.value = "";
                }}
              />
            </div>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void save({ displayName: name.trim() });
            }}
          >
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              aria-label={t("member.displayName")}
              placeholder={t("member.displayName")}
              className={field}
              maxLength={40}
            />
            <Button type="submit" variant="primary" disabled={!name.trim() || name === me.displayName}>
              {t("member.save")}
            </Button>
          </form>
          {saved && <p className="text-xs text-success">{t("member.saved")}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
          <p className="text-[12px] text-fg-subtle">
            @{me.username} · {t(`member.role_${me.role}`)}
          </p>
        </Card>
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">{t("member.language")}</span>
            <Segmented
              label={t("member.language")}
              value={language}
              onChange={(v) => {
                void loadBundled(v).then(() => i18n.changeLanguage(v));
                document.documentElement.lang = v;
                void save({ language: v });
              }}
              options={[
                { value: "en", label: "English" },
                { value: "tr", label: "Türkçe" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13.5px] font-medium">{t("member.theme")}</span>
            <Segmented
              label={t("member.theme")}
              value={theme}
              onChange={(v) => {
                setTheme(v);
                applyTheme(v);
              }}
              options={[
                { value: "system", label: t("member.themeSystem") },
                { value: "light", label: t("member.themeLight") },
                { value: "dark", label: t("member.themeDark") },
              ]}
            />
          </div>
          <Notices />
        </Card>
        <Button variant="ghost" icon={LogOut} onClick={() => void client.signOut()}>
          {t("member.signOut")}
        </Button>
      </div>
    </>
  );
}
