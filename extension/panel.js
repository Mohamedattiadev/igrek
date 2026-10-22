// Igrek's side panel. It talks only to Igrek on this computer (localhost), with the pairing key
// made in Igrek's Settings. Private values come from Igrek straight into the page's fields; the
// AI that writes a field's text sees placeholders and never the values (Igrek fills them in).

const t = (key, ...subs) => chrome.i18n.getMessage(key, subs) || key;
const $ = (id) => document.getElementById(id);

document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
$("instruction").placeholder = t("writePlaceholder");

let config = { address: "", key: "" };
let matches = [];

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
  const [result] = await chrome.scripting.executeScript({ target: { tabId: await activeTab() }, func, args });
  return result?.result;
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
