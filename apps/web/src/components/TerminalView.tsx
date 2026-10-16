import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Colors follow the app theme so the terminal looks like part of the page. */
function theme() {
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    background: cssVar("--bg"),
    foreground: cssVar("--fg"),
    cursor: cssVar("--accent"),
    cursorAccent: cssVar("--bg"),
    selectionBackground: dark ? "#3a4a6b" : "#cfdcf7",
    black: dark ? "#1e1f22" : "#2b2d30",
    brightBlack: "#6f737a",
    red: cssVar("--danger"),
    brightRed: cssVar("--danger"),
    green: cssVar("--success"),
    brightGreen: cssVar("--success"),
    yellow: cssVar("--warning"),
    brightYellow: cssVar("--warning"),
    blue: cssVar("--accent"),
    brightBlue: cssVar("--accent-hover"),
    white: dark ? "#dfe1e5" : "#5c606a",
    brightWhite: dark ? "#ffffff" : "#1e1f22",
  };
}

/**
 * A real terminal in the page (plan.md 2.1). Keys go to the process on the
 * server; output streams back. Reconnects if the connection drops.
 */
export function TerminalView({ id, onExit }: { id: string; onExit?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const exitRef = useRef(onExit);
  exitRef.current = onExit;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const term = new Terminal({
      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10_000,
      theme: theme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(el);
    fit.fit();

    let socket: WebSocket | undefined;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const send = (message: unknown) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const connect = () => {
      term.reset();
      socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/term/${id}`);
      socket.onopen = () => send({ t: "r", c: term.cols, r: term.rows });
      socket.onmessage = (event) => {
        term.write(event.data);
        if (String(event.data).includes("[process exited with code")) exitRef.current?.();
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 1500);
      };
    };
    connect();

    const input = term.onData((data) => send({ t: "i", d: data }));
    const resize = term.onResize(({ cols, rows }) => send({ t: "r", c: cols, r: rows }));
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(el);
    // Repaint with new colors when the theme changes.
    const themeWatch = new MutationObserver(() => {
      term.options.theme = theme();
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    term.focus();

    return () => {
      closed = true;
      clearTimeout(retry);
      input.dispose();
      resize.dispose();
      observer.disconnect();
      themeWatch.disconnect();
      socket?.close();
      term.dispose();
    };
  }, [id]);

  return <div ref={host} className="h-full w-full overflow-hidden bg-bg px-2 pt-2" />;
}
