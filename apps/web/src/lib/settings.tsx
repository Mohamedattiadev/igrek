import { DEFAULT_SETTINGS, type Settings } from "@igrek/core";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { applyLanguage, loadBundled } from "./i18n";

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  error?: string;
  update: (patch: Partial<Settings>) => Promise<void>;
  /** Applies settings pushed by the server (e.g. changed in another tab). */
  receive: (settings: Settings) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function resolveTheme(theme: Settings["theme"]): "light" | "dark" {
  if (theme === "darcula") return "dark";
  if (theme === "notion") return "light";
  if (theme !== "system") return theme;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyToDocument(settings: Settings, loaded: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.density = settings.density;
  root.dataset.text = settings.textSize ?? "normal";
  if (settings.theme === "darcula" || settings.theme === "notion") root.dataset.palette = settings.theme;
  else delete root.dataset.palette;
  root.dataset.mode = settings.mode;
  // The language pack comes from the API, which needs the session cookie: before the settings have
  // loaded, the bootstrap call may not have set it yet and the request would fail with a 401.
  if (loaded) applyLanguage(settings.language);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    api
      .bootstrap()
      .then(api.settings)
      .then(async (value) => {
        // The chosen language's texts arrive before the first screen is drawn.
        await loadBundled(value.language).catch(() => undefined);
        setSettings(value);
        setLoaded(true);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    applyToDocument(settings, loaded);
    if (settings.theme !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyToDocument(settings, loaded);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [settings, loaded]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
    try {
      setSettings(await api.updateSettings(patch));
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const value = useMemo(
    () => ({ settings, loaded, error, update, receive: setSettings }),
    [settings, loaded, error, update],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings must be used inside SettingsProvider");
  return value;
}
