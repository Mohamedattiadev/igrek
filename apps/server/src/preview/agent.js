// God Eye preview agent (plan.md Faz 10): injected by God Eye's local preview proxy only.
// It highlights and picks elements for the panel next to the preview, and reports console and
// network errors. It talks to the God Eye window with postMessage and never sends data anywhere else.
(() => {
  if (window.__godeyeAgent) return;
  window.__godeyeAgent = true;
  const post = (msg) => {
    try {
      window.parent.postMessage({ godeye: true, ...msg }, "*");
    } catch {
      // not framed
    }
  };
  let picking = false;
  let selected = null;
  const box = document.createElement("div");
  const label = document.createElement("div");
  const sel = document.createElement("div");
  const styleBox = (el, color, fill) => {
    el.style.cssText = `position:fixed;pointer-events:none;z-index:2147483646;border:2px solid ${color};background:${fill};border-radius:3px;transition:all 60ms;display:none`;
  };
  styleBox(box, "#2563eb", "rgba(37,99,235,0.08)");
  styleBox(sel, "#16a34a", "rgba(22,163,74,0.06)");
  label.style.cssText =
    "position:fixed;pointer-events:none;z-index:2147483647;background:#111;color:#fff;font:11px/1.4 ui-monospace,monospace;padding:2px 6px;border-radius:3px;display:none;white-space:nowrap";
  const mount = () => {
    if (!document.body) return;
    for (const el of [box, label, sel]) if (!el.isConnected) document.body.appendChild(el);
  };
  const place = (el, target) => {
    const r = target.getBoundingClientRect();
    Object.assign(el.style, {
      display: "block",
      left: `${r.left - 2}px`,
      top: `${r.top - 2}px`,
      width: `${r.width + 4}px`,
      height: `${r.height + 4}px`,
    });
    return r;
  };
  const ours = (el) => el === box || el === label || el === sel;
  const sourceOf = (el) => el.closest?.("[data-gd-src]")?.getAttribute("data-gd-src") ?? undefined;
  const selectorOf = (el) => {
    const parts = [];
    for (
      let node = el;
      node && node.nodeType === 1 && node !== document.documentElement && parts.length < 6;
      node = node.parentElement
    ) {
      if (node.id) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const parent = node.parentElement;
      const index = parent ? [...parent.children].filter((c) => c.tagName === node.tagName).indexOf(node) : -1;
      parts.unshift(`${node.tagName.toLowerCase()}${index > 0 ? `:nth-of-type(${index + 1})` : ""}`);
    }
    return parts.join(" > ");
  };
  const describe = (el) => {
    const cs = getComputedStyle(el);
    const styles = {};
    for (const k of [
      "color",
      "background-color",
      "font-size",
      "font-weight",
      "padding",
      "margin",
      "display",
      "border-radius",
      "width",
      "height",
    ])
      styles[k] = cs.getPropertyValue(k);
    const r = el.getBoundingClientRect();
    const clone = el.cloneNode(true);
    for (const c of clone.querySelectorAll?.("[data-gd-src]") ?? []) c.removeAttribute("data-gd-src");
    clone.removeAttribute?.("data-gd-src");
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: [...el.classList].slice(0, 20),
      text: (el.innerText || el.textContent || "").trim().slice(0, 200),
      source: sourceOf(el),
      selector: selectorOf(el),
      html: (clone.outerHTML || "").slice(0, 1500),
      styles,
      rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
      url: location.pathname + location.search,
    };
  };
  const choose = (el) => {
    if (!el || ours(el)) return;
    selected = el;
    mount();
    place(sel, el);
    post({ type: "picked", element: describe(el) });
  };
  document.addEventListener(
    "mousemove",
    (e) => {
      if (!picking) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || ours(el)) return;
      mount();
      const r = place(box, el);
      label.textContent = `${el.tagName.toLowerCase()}${sourceOf(el) ? `  ${sourceOf(el)}` : ""}`;
      Object.assign(label.style, {
        display: "block",
        left: `${Math.max(0, r.left)}px`,
        top: `${Math.max(0, r.top - 20)}px`,
      });
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      if (!picking) return;
      e.preventDefault();
      e.stopPropagation();
      choose(document.elementFromPoint(e.clientX, e.clientY));
    },
    true,
  );
  window.addEventListener("scroll", () => selected && place(sel, selected), true);
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg?.godeye !== true || e.source !== window.parent) return;
    if (msg.type === "pick") {
      picking = !!msg.on;
      if (!picking) box.style.display = label.style.display = "none";
      document.documentElement.style.cursor = picking ? "crosshair" : "";
    } else if (msg.type === "up" && selected?.parentElement && selected.parentElement !== document.body)
      choose(selected.parentElement);
    else if (msg.type === "down" && selected?.firstElementChild) choose(selected.firstElementChild);
    else if (msg.type === "reselect" && msg.selector) {
      try {
        const el = document.querySelector(msg.selector);
        if (el) choose(el);
      } catch {
        // the page changed too much
      }
    }
  });

  // ---- errors ----------------------------------------------------------------------
  const report = (kind, message, extra = {}) =>
    post({ type: "error", error: { kind, message: String(message).slice(0, 1000), at: Date.now(), ...extra } });
  const original = console.error;
  console.error = (...args) => {
    report(
      "console",
      args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
    original.apply(console, args);
  };
  window.addEventListener("error", (e) =>
    report("error", e.message, { stack: e.error?.stack?.slice(0, 1500), url: e.filename }),
  );
  window.addEventListener("unhandledrejection", (e) =>
    report("promise", e.reason?.message ?? e.reason, { stack: e.reason?.stack?.slice(0, 1500) }),
  );
  const fetch0 = window.fetch;
  window.fetch = async (...args) => {
    const url = String(args[0]?.url ?? args[0]);
    try {
      const res = await fetch0(...args);
      if (res.status >= 400 && !url.includes("__godeye"))
        report("network", `${res.status} ${res.statusText}`, { url, status: res.status });
      return res;
    } catch (err) {
      report("network", err?.message ?? "Request failed", { url });
      throw err;
    }
  };
  const open0 = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.addEventListener("loadend", () => {
      if (this.status >= 400 || this.status === 0)
        report("network", `${this.status || "failed"} ${method}`, { url: String(url), status: this.status });
    });
    return open0.call(this, method, url, ...rest);
  };
  post({ type: "ready", url: location.pathname + location.search });
})();
