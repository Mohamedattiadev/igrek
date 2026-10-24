// Igrek's side panel. It talks only to Igrek on this computer (localhost), with the pairing key
// made in Igrek's Settings. Private values come from Igrek straight into the page's fields; the
// AI that writes a field's text sees placeholders and never the values (Igrek fills them in).

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;
const $ = (id) => document.getElementById(id);

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
$("instruction").placeholder = t("writePlaceholder");
$("goal").placeholder = t("actPlaceholder");

let config = { address: "", key: "" };
let matches = [];
/** The page as last read, the picked element, the steps proposed and what was done, for the next ask. */
const act = { page: undefined, picked: undefined, steps: [], done: [] };

function note(text, error = false) {
  const el = $("note");
  el.hidden = !text;
  el.textContent = text ?? "";
  el.classList.toggle("error", error);
}

async function call(path, body) {
  const res = await fetch(`${config.address}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-igrek-ext-key": config.key },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error(t("notPaired"));
  if (!res.ok) throw new Error(data.error || `${res.status}`);
  return data;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error(t("noPage"));
  return tab.id;
}

async function inPage(func, args = []) {
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId: await activeTab() }, func, args });
    return result?.result;
  } catch (err) {
    // activeTab lasts until the page changes; after that the user opens the panel on the new page.
    if (/permission|Cannot access/i.test(String(err?.message))) throw new Error(t("needClick"));
    throw err;
  }
}

// ---- run inside the page -------------------------------------------------------------------

/** The fillable fields of the page, each marked so it can be found again, with the words around it. */
function collectFields() {
  const fields = [];
  const inputs = document.querySelectorAll(
    "input:not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]), textarea",
  );
  inputs.forEach((el, i) => {
    if (el.disabled || el.readOnly || !el.offsetParent) return;
    el.dataset.igrekField = String(i);
    const label = el.labels?.[0]?.innerText ?? el.closest("label")?.innerText ?? "";
    const text = [label, el.placeholder, el.name, el.id, el.getAttribute("aria-label"), el.autocomplete]
      .filter(Boolean)
      .join(" ")
      .slice(0, 300);
    if (text.trim()) fields.push({ id: String(i), text });
  });
  return fields;
}

/** Puts values in fields the way typing does, so the page's own code (React, Vue) sees the change. */
function fillFields(pairs) {
  let filled = 0;
  for (const { id, value } of pairs) {
    const el = document.querySelector(`[data-igrek-field="${id}"]`);
    if (!el) continue;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    filled++;
  }
  return filled;
}

/** The field the user was last in, its question, and the page around it (for writing its text). */
function fieldContext() {
  const el = document.activeElement;
  if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type === "text"))) return undefined;
  el.dataset.igrekTarget = "1";
  const question = el.labels?.[0]?.innerText ?? el.getAttribute("aria-label") ?? el.placeholder ?? "";
  return {
    question,
    page: { title: document.title, url: location.href, text: document.body.innerText.slice(0, 6000) },
  };
}

function fillTarget(text) {
  const el = document.querySelector('[data-igrek-target="1"]');
  if (!el) return false;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.removeAttribute("data-igrek-target");
  return true;
}

/**
 * The page for acting on it: its text and the things a step can use, each marked with data-igrek-el.
 * Password fields are left out: no step ever types into one.
 */
function snapshotPage() {
  const visible = (el) => !!(el.offsetParent || el.getClientRects().length);
  const nodes = document.querySelectorAll(
    'a[href], button, input:not([type=hidden]):not([type=password]), textarea, select, [role=button], [role=link], [role=checkbox], [role=tab], [role=menuitem], [contenteditable="true"]',
  );
  const elements = [];
  for (const el of nodes) {
    if (elements.length >= 150) break;
    if (!visible(el) || el.disabled) continue;
    const id = String(elements.length + 1);
    el.dataset.igrekEl = id;
    const role =
      el.getAttribute("role") ||
      (el.tagName === "A" ? "link" : el.tagName === "SELECT" ? "select" : el.tagName === "BUTTON" ? "button" : "") ||
      (el.tagName === "TEXTAREA" ? "textbox" : el.type === "checkbox" || el.type === "radio" ? el.type : "textbox");
    const label = el.labels?.[0]?.innerText || el.getAttribute("aria-label") || el.placeholder || "";
    const text = [label, el.innerText || el.value || el.name || ""].filter(Boolean).join(" · ").replace(/\s+/g, " ");
    elements.push({ id, role, text: text.slice(0, 160) });
  }
  return { title: document.title, url: location.href, text: document.body.innerText.slice(0, 8000), elements };
}

/** Outlines one element, so the user sees what a step would touch before allowing it. */
function highlight(id) {
  for (const old of document.querySelectorAll("[data-igrek-shown]")) {
    old.style.outline = old.dataset.igrekShown;
    old.removeAttribute("data-igrek-shown");
  }
  const el = id && document.querySelector(`[data-igrek-el="${id}"]`);
  if (!el) return false;
  el.dataset.igrekShown = el.style.outline;
  el.style.outline = "3px solid #2267ef";
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  return true;
}

/** Does one step the user allowed. Typing goes in the way typing does, so the page's own code sees it. */
function doStep(step) {
  const el = document.querySelector(`[data-igrek-el="${step.el}"]`);
  if (!el) return false;
  if (step.action === "scroll") el.scrollIntoView({ block: "center", behavior: "smooth" });
  else if (step.action === "click") el.click();
  else if (step.action === "select" && el instanceof HTMLSelectElement) {
    const want = String(step.text ?? "").toLowerCase();
    const option = [...el.options].find((o) => o.value.toLowerCase() === want || o.text.toLowerCase().includes(want));
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (step.action === "type") {
    if (el instanceof HTMLInputElement && el.type === "password") return false;
    if (el.isContentEditable) el.textContent = step.text ?? "";
    else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, step.text ?? "");
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return true;
}

/** The picker: the element under the pointer is outlined; a click picks it (and does nothing else), Esc stops. */
function pickElement() {
  return new Promise((resolve) => {
    let last;
    const mark = (el, on) => {
      if (!el) return;
      if (on) {
        el.dataset.igrekPickOutline = el.style.outline;
        el.style.outline = "2px dashed #2267ef";
      } else {
        el.style.outline = el.dataset.igrekPickOutline ?? "";
        el.removeAttribute("data-igrek-pick-outline");
      }
    };
    const over = (e) => {
      mark(last, false);
      last = e.target;
      mark(last, true);
    };
    const done = (value) => {
      mark(last, false);
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      resolve(value);
    };
    const click = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      done({ el: el.dataset.igrekEl ?? "", text: (el.innerText || el.value || el.outerHTML).slice(0, 2000) });
    };
    const key = (e) => e.key === "Escape" && done(null);
    document.addEventListener("mouseover", over, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  });
}

// ---- the panel -----------------------------------------------------------------------------

async function start() {
  const saved = await chrome.storage.local.get(["address", "key"]);
  config = { address: saved.address || "http://localhost:7777", key: saved.key || "" };
  $("address").value = config.address;
  if (!config.key) return show(false);
  try {
    const hello = await call("/api/ext/hello");
    $("status").textContent = t("connected", String(hello.details.length));
    show(true);
  } catch (err) {
    show(false);
    note(err.message, true);
  }
}

function show(paired) {
  $("pairing").hidden = paired;
  $("main").hidden = !paired;
  if (!paired) $("status").textContent = "";
}

$("pair").onclick = async () => {
  config = { address: $("address").value.trim().replace(/\/+$/, ""), key: $("key").value.trim() };
  await chrome.storage.local.set(config);
  note("");
  await start();
};

$("unpair").onclick = async () => {
  await chrome.storage.local.remove("key");
  config.key = "";
  show(false);
};

$("scan").onclick = async () => {
  note("");
  try {
    const fields = (await inPage(collectFields)) ?? [];
    matches = await call("/api/ext/match", { fields });
    const list = $("matches");
    list.replaceChildren();
    for (const m of matches) {
      const li = document.createElement("li");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.dataset.id = m.id;
      const text = document.createElement("span");
      text.textContent = `${m.label} → ${fields.find((f) => f.id === m.id)?.text ?? ""}`;
      li.append(box, text);
      list.append(li);
    }
    $("fill").hidden = matches.length === 0;
    note(matches.length ? t("found", String(matches.length)) : t("nothingFound"));
  } catch (err) {
    note(err.message, true);
  }
};

$("fill").onclick = async () => {
  const ticked = new Set([...document.querySelectorAll("#matches input:checked")].map((b) => b.dataset.id));
  const pairs = matches.filter((m) => ticked.has(m.id)).map((m) => ({ id: m.id, value: m.value }));
  try {
    note(t("filled", String(await inPage(fillFields, [pairs]))));
  } catch (err) {
    note(err.message, true);
  }
};

$("write").onclick = async () => {
  note("");
  const instruction = $("instruction").value.trim();
  if (!instruction) return note(t("sayWhat"), true);
  $("write").disabled = true;
  try {
    const context = await inPage(fieldContext);
    if (!context) throw new Error(t("clickField"));
    note(t("writing"));
    const { text } = await call("/api/ext/write", { instruction, ...context });
    note((await inPage(fillTarget, [text])) ? t("written") : t("clickField"), false);
  } catch (err) {
    note(err.message, true);
  } finally {
    $("write").disabled = false;
  }
};

void start();

// ---- acting on the page, one allowed step at a time ------------------------------------------

function describe(step) {
  const el = act.page?.elements.find((e) => e.id === step.el);
  return t(step.action, el?.text || step.el);
}

function showSteps(steps) {
  const list = $("steps");
  list.replaceChildren();
  for (const step of steps) {
    const li = document.createElement("li");
    if (step.risky) li.classList.add("risky");
    const why = document.createElement("div");
    why.className = "why";
    why.textContent = `${describe(step)}${step.why ? ` (${step.why})` : ""}`;
    const row = document.createElement("div");
    row.className = "row";
    const button = (label, onClick, primary) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = t(label);
      if (primary) b.className = "primary";
      b.onclick = onClick;
      row.append(b);
      return b;
    };
    button("show", () => void inPage(highlight, [step.el]).catch((err) => note(err.message, true)));
    const go = button(
      "doIt",
      async () => {
        if (step.risky && !window.confirm(t("riskyConfirm", describe(step)))) return;
        try {
          await inPage(highlight, [undefined]);
          if (!(await inPage(doStep, [step]))) return note(t("stepGone"), true);
          act.done.push(describe(step));
          li.classList.add("done");
          row.remove();
        } catch (err) {
          note(err.message, true);
        }
      },
      true,
    );
    button("skip", () => {
      li.classList.add("done");
      row.remove();
    });
    go.dataset.step = step.el;
    li.append(why, row);
    list.append(li);
  }
  $("more").hidden = steps.length === 0;
}

async function ask() {
  note("");
  const goal = $("goal").value.trim();
  if (!goal) return note(t("sayWhat"), true);
  $("ask").disabled = true;
  $("more").disabled = true;
  try {
    note(t("thinking"));
    // Read again each time: the page changes as steps are done.
    act.page = await inPage(snapshotPage);
    const reply = await call("/api/ext/act", { goal, page: act.page, picked: act.picked, done: act.done });
    note("");
    $("answer").hidden = !reply.answer;
    $("answer").textContent = reply.answer ?? "";
    act.steps = reply.steps ?? [];
    showSteps(act.steps);
  } catch (err) {
    note(err.message, true);
  } finally {
    $("ask").disabled = false;
    $("more").disabled = false;
  }
}

$("ask").onclick = () => void ask();
$("more").onclick = () => void ask();

$("pick").onclick = async () => {
  note(t("picking"));
  try {
    // Marks the elements first, so the picked one has an id a step can use.
    act.page = await inPage(snapshotPage);
    const picked = await inPage(pickElement);
    note("");
    act.picked = picked ?? undefined;
    $("picked").hidden = !picked;
    $("picked").textContent = picked ? t("pickedEl", picked.text.slice(0, 120)) : "";
  } catch (err) {
    note(err.message, true);
  }
};
