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

/**
 * The desktop app updates itself: the new version is downloaded, its signature is checked against
 * Igrek's own key, and the app restarts into it. A build made without that key cannot update.
 */
export function DesktopUpdatePanel() {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "checking" | "current" | "installing" | "off">("idle");
  const [version, setVersion] = useState<string>();
  const [error, setError] = useState<string>();
  const check = async () => {
    setState("checking");
    setError(undefined);
    try {
      const found = await desktop<string | null>("update_check");
      setVersion(found ?? undefined);
      setState(found ? "idle" : "current");
    } catch (err) {
      const message = (err as Error).message;
      if (message === "off") setState("off");
      else {
        setError(message);
        setState("idle");
      }
    }
  };
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
    </div>
  );
}
