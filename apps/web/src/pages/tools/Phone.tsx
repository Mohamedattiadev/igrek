import type { PhoneCheck, PhoneDevice, ProjectListItem } from "@igrek/core";
import { ArrowLeft, Circle, Download, LayoutGrid, RefreshCw, ScanEye, Send, Smartphone, Wifi } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FixButton } from "../../components/FixButton";
import { Button, Card, field } from "../../components/ui";
import { api, request } from "../../lib/api";

const post = <T,>(path: string, body: unknown = {}) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

/** How to connect a phone: USB, or wireless debugging with a pairing code (Android 11 and later). */
function Connect({ onChange }: { onChange: () => void }) {
  const { t } = useTranslation();
  const [pairAddress, setPairAddress] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState<string>();
  const run = (call: Promise<{ message: string }>) =>
    call.then(
      (r) => {
        setNote(r.message);
        onChange();
      },
      (err: Error) => setNote(err.message),
    );
  return (
    <Card className="space-y-3 p-pad text-[13px]">
      <p className="font-medium">{t("phone.usbTitle")}</p>
      <ol className="list-decimal space-y-1 ps-5 text-fg-muted">
        <li>{t("phone.usb1")}</li>
        <li>{t("phone.usb2")}</li>
        <li>{t("phone.usb3")}</li>
      </ol>
      <p className="flex items-center gap-1.5 pt-2 font-medium">
        <Wifi size={14} aria-hidden="true" /> {t("phone.wifiTitle")}
      </p>
      <p className="text-fg-muted">{t("phone.wifiHint")}</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={pairAddress}
          onChange={(e) => setPairAddress(e.target.value.trim())}
          placeholder="192.168.1.5:37000"
          aria-label={t("phone.pairAddress")}
          className={`${field} w-48`}
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          placeholder="123456"
          aria-label={t("phone.pairCode")}
          className={`${field} w-28`}
        />
        <Button
          disabled={!pairAddress || code.length !== 6}
          onClick={() => run(post("/api/phone/pair", { address: pairAddress, code }))}
        >
          {t("phone.pair")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value.trim())}
          placeholder="192.168.1.5:41235"
          aria-label={t("phone.connectAddress")}
          className={`${field} w-48`}
        />
        <Button disabled={!address} onClick={() => run(post("/api/phone/connect", { address }))}>
          {t("phone.connect")}
        </Button>
      </div>
      {note && <p className="text-xs text-fg-muted">{note}</p>}
    </Card>
  );
}

/** The phone's screen, refreshed while it is open; a click on it is a tap on the phone. */
function Screen({ serial }: { serial: string }) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(true);
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(timer);
  }, [live]);
  const act = (call: Promise<unknown>) =>
    call.then(
      () => setTick((n) => n + 1),
      (err: Error) => setError(err.message),
    );
  const tap = (e: MouseEvent<HTMLImageElement>) => {
    const el = img.current;
    if (!el?.naturalWidth) return;
    const box = el.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * el.naturalWidth;
    const y = ((e.clientY - box.top) / box.height) * el.naturalHeight;
    void act(post(`/api/phone/${encodeURIComponent(serial)}/tap`, { x, y }));
  };
  const key = (name: "back" | "home" | "apps") =>
    act(post(`/api/phone/${encodeURIComponent(serial)}/key`, { key: name }));
  return (
    <div className="space-y-2">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: the keys below do what a keyboard would; a tap needs a point */}
      <img
        ref={img}
        src={`/api/phone/${encodeURIComponent(serial)}/screen?t=${tick}`}
        alt={t("phone.screen")}
        onClick={tap}
        onError={() => setError(t("phone.noScreen"))}
        onLoad={() => setError(undefined)}
        className="max-h-[70vh] w-auto cursor-pointer rounded-xl border border-border bg-bg-subtle"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => key("back")}>
          {t("phone.back")}
        </Button>
        <Button size="sm" variant="ghost" icon={Circle} onClick={() => key("home")}>
          {t("phone.home")}
        </Button>
        <Button size="sm" variant="ghost" icon={LayoutGrid} onClick={() => key("apps")}>
          {t("phone.apps")}
        </Button>
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => setLive((v) => !v)} aria-pressed={live}>
          {live ? t("phone.live") : t("phone.paused")}
        </Button>
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (text) void act(post(`/api/phone/${encodeURIComponent(serial)}/text`, { text })).then(() => setText(""));
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("phone.typeHint")}
          aria-label={t("phone.typeHint")}
          className={`${field} min-w-0 flex-1`}
        />
        <Button type="submit" icon={Send} disabled={!text}>
          {t("phone.type")}
        </Button>
      </form>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

/** A project's built APK, installed on the phone. */
function Install({ serial }: { serial: string }) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectId, setProjectId] = useState("");
  const [apks, setApks] = useState<string[]>([]);
  const [note, setNote] = useState<string>();
  useEffect(() => {
    let current = true;
    api
      .projects()
      .then((list) => current && setProjects(list.filter((p) => !p.hidden)))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    let current = true;
    if (projectId)
      request<string[]>(`/api/projects/${projectId}/apks`)
        .then((list) => current && setApks(list))
        .catch(() => current && setApks([]));
    return () => {
      current = false;
    };
  }, [projectId]);
  return (
    <div className="space-y-2 text-[13px]">
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        aria-label={t("phone.project")}
        className={`${field} w-full`}
      >
        <option value="">{t("phone.pickProject")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {projectId && apks.length === 0 && <p className="text-fg-muted">{t("phone.noApk")}</p>}
      {apks.map((path) => (
        <div key={path} className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]">{path}</code>
          <Button
            size="sm"
            icon={Download}
            onClick={() =>
              void post<{ message: string }>(`/api/phone/${encodeURIComponent(serial)}/install`, {
                projectId,
                path,
              }).then(
                (r) => setNote(r.message),
                (err: Error) => setNote(err.message),
              )
            }
          >
            {t("phone.install")}
          </Button>
        </div>
      ))}
      {note && <p className="text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

/** The screen checked on the phone, the way the real-screen check does for the web. */
function Check({ serial }: { serial: string }) {
  const { t } = useTranslation();
  const [result, setResult] = useState<PhoneCheck>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = () => {
    setBusy(true);
    setError(undefined);
    post<PhoneCheck>(`/api/phone/${encodeURIComponent(serial)}/check`)
      .then(setResult, (err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="space-y-2 text-[13px]">
      <p className="text-fg-muted">{t("phone.checkHint")}</p>
      <Button icon={ScanEye} disabled={busy} onClick={run}>
        {busy ? t("phone.checking") : t("phone.check")}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && (
        <ul className="space-y-1">
          <li className={result.small.length ? "text-warning" : "text-success"}>
            {t("phone.small", { count: result.small.length })}
            {result.small.slice(0, 5).map((s) => (
              <span key={`${s.bounds}`} className="block font-mono text-[11.5px] text-fg-muted">
                {s.id || s.bounds.join(",")}: {s.width} x {s.height} dp
              </span>
            ))}
          </li>
          <li className={result.unnamed.length ? "text-warning" : "text-success"}>
            {t("phone.unnamed", { count: result.unnamed.length })}
            {result.unnamed.slice(0, 5).map((u) => (
              <span key={`${u.bounds}`} className="block font-mono text-[11.5px] text-fg-muted">
                {u.id || u.kind}
              </span>
            ))}
          </li>
          <li className={result.crashes.length ? "text-danger" : "text-success"}>
            {t("phone.crashes", { count: result.crashes.length })}
            {result.crashes.slice(-3).map((line) => (
              <span key={line} className="block truncate font-mono text-[11.5px] text-fg-muted">
                {line}
              </span>
            ))}
          </li>
        </ul>
      )}
    </div>
  );
}

/**
 * Testing mobile apps on your own phone, for a computer too weak for an emulator (plan.md 10): adb
 * over USB or Wi-Fi shows the phone's screen here, taps and types on it, installs the project's
 * APK, and checks the screen. Free; nothing is installed on the phone.
 */
export function PhoneTab() {
  const { t } = useTranslation();
  const [state, setState] = useState<{ adb: boolean; devices: PhoneDevice[] }>();
  const [serial, setSerial] = useState<string>();
  const load = useCallback(() => {
    let current = true;
    request<{ adb: boolean; devices: PhoneDevice[] }>("/api/phone")
      .then((s) => {
        if (!current) return;
        setState(s);
        setSerial((now) => now ?? s.devices.find((d) => d.state === "ready")?.serial);
      })
      .catch(() => current && setState({ adb: false, devices: [] }));
    return () => {
      current = false;
    };
  }, []);
  useEffect(load, [load]);
  if (!state) return null;
  if (!state.adb)
    return (
      <Card className="space-y-2 p-pad text-[13px]">
        <p className="font-medium">{t("phone.noAdb")}</p>
        <ul className="list-disc space-y-1 ps-5 font-mono text-[12px] text-fg-muted">
          <li>Linux: sudo pacman -S android-tools / sudo apt install adb</li>
          <li>macOS: brew install android-platform-tools</li>
          <li>Windows: winget install Google.PlatformTools</li>
        </ul>
        <FixButton fix="install-adb" label={t("fix.installTool", { tool: "adb" })} />
      </Card>
    );
  const ready = state.devices.filter((d) => d.state === "ready");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {state.devices.map((d) => (
          <Button
            key={d.serial}
            size="sm"
            variant={d.serial === serial ? "primary" : "secondary"}
            icon={d.wifi ? Wifi : Smartphone}
            disabled={d.state !== "ready"}
            onClick={() => setSerial(d.serial)}
            data-tip={d.state === "unauthorized" ? t("phone.unauthorized") : undefined}
          >
            {d.model ?? d.serial}
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load}>
          {t("phone.refresh")}
        </Button>
      </div>
      {state.devices.some((d) => d.state === "unauthorized") && (
        <p className="text-[12.5px] text-warning">{t("phone.unauthorized")}</p>
      )}
      {serial && ready.some((d) => d.serial === serial) ? (
        <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <Screen key={serial} serial={serial} />
          <div className="space-y-4">
            <Card className="space-y-2 p-pad">
              <p className="text-[13px] font-semibold">{t("phone.installTitle")}</p>
              <Install serial={serial} />
            </Card>
            <Card className="space-y-2 p-pad">
              <p className="text-[13px] font-semibold">{t("phone.checkTitle")}</p>
              <Check key={serial} serial={serial} />
            </Card>
          </div>
        </div>
      ) : (
        <Connect onChange={load} />
      )}
    </div>
  );
}
