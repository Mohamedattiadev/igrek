import type { Settings, SystemStatus } from "@godeye/core";
import type { LanguageOption } from "@godeye/i18n";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /** Picks up the session cookie; call once before anything else. */
  session: () => request<{ ok: boolean }>("/api/session"),
  settings: () => request<Settings>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  languages: () => request<LanguageOption[]>("/api/languages"),
  system: () => request<SystemStatus>("/api/system"),
  emergencyStop: () => request<{ stopped: number; stoppedAt: string }>("/api/emergency-stop", { method: "POST" }),
};
