import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { desktop } from "../lib/desktop";
import { Button, Segmented } from "./ui";

/** Start Igrek with the computer (off until the user turns it on). */
export function AutostartPanel() {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    desktop<boolean>("autostart")
      .then(setOn)
      .catch((err: Error) => setError(err.message));
  }, []);
  const change = async (value: "on" | "off") => {
    setError(undefined);
    try {
      await desktop("set_autostart", { on: value === "on" });
      setOn(value === "on");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <div className="space-y-2">
      {on !== undefined && (
        <Segmented
          value={on ? "on" : "off"}
          onChange={(value) => void change(value)}
          options={[
            { value: "on", label: t("settings.on") },
            { value: "off", label: t("settings.off") },
          ]}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Bytes of the update downloaded so far and its size, read every half second while it installs. */
function useUpdateProgress(installing: boolean): [number, number | null] | undefined {
  const [progress, setProgress] = useState<[number, number | null]>();
  useEffect(() => {
    if (!installing) return setProgress(undefined);
    let live = true;
    const timer = setInterval(
      () =>
        void desktop<[number, number | null]>("update_progress")
          .then((p) => live && setProgress(p))
          .catch(() => undefined),
      500,
    );
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [installing]);
  return progress;
}

const MB = 1024 * 1024;

function UpdateProgressBar({ done, total }: { done: number; total: number | null }) {
  const { t } = useTranslation();
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : undefined;
  return (
    <div className="max-w-sm space-y-1">
      {pct !== undefined && (
        <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-xs text-fg-muted">
        {total
          ? t("desktop.updateProgress", { done: (done / MB).toFixed(1), total: (total / MB).toFixed(1), pct })
          : t("desktop.updateProgressNoSize", { done: (done / MB).toFixed(1) })}
      </p>
    </div>
  );
}

/**
 * The desktop app updates itself: the new version is downloaded, its signature is checked against
 * Igrek's own key, and the app restarts into it. A build made without that key cannot update.
 */
export function DesktopUpdatePanel() {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "checking" | "current" | "installing" | "off">("idle");
  const [version, setVersion] = useState<string>();
  const [error, setError] = useState<string>();
  const progress = useUpdateProgress(state === "installing");
  /** `live` is false once the page is left, so a late answer is dropped. */
  const check = async (live = () => true) => {
    setState("checking");
    setError(undefined);
    try {
      const found = await desktop<string | null>("update_check");
      if (!live()) return;
      setVersion(found ?? undefined);
      setState(found ? "idle" : "current");
    } catch (err) {
      if (!live()) return;
      const message = (err as Error).message;
      if (message === "off") setState("off");
      else {
        setError(message);
        setState("idle");
      }
    }
  };
  // Settings looks by itself when opened; the button is for "look again now".
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, when the panel opens
  useEffect(() => {
    let live = true;
    void check(() => live);
    return () => {
      live = false;
    };
  }, []);
  const install = async () => {
    setState("installing");
    setError(undefined);
    try {
      await desktop("update_install");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };
  if (state === "off") return <p className="text-[13px] text-fg-muted">{t("desktop.updateOff")}</p>;
  return (
    <div className="space-y-2 text-[13px]">
      {state === "current" && <p>{t("update.upToDate")}</p>}
      {version && <p>{t("desktop.updateFound", { version })}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          icon={RefreshCw}
          disabled={state !== "idle" && state !== "current"}
          onClick={() => void check()}
        >
          {state === "checking" ? t("meeting.looking") : t("update.check")}
        </Button>
        {version && (
          <Button variant="primary" icon={Download} disabled={state === "installing"} onClick={() => void install()}>
            {state === "installing" ? t("desktop.updateInstalling") : t("desktop.updateInstall")}
          </Button>
        )}
      </div>
      {progress && <UpdateProgressBar done={progress[0]} total={progress[1]} />}
    </div>
  );
}
