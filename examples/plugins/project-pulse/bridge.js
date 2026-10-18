// Igrek plugin bridge: ask Igrek for data your plugin has permission to read.
// The page runs in a sandbox without network access, so the data can't leave this computer.
let next = 1;
const waiting = new Map();
const hello = new Promise((resolve) => {
  addEventListener("message", (event) => {
    const m = event.data;
    if (m?.igrek !== 1) return;
    if (m.type === "hello") {
      document.documentElement.dataset.theme = m.theme;
      resolve(m);
    } else if (waiting.has(m.id)) {
      const { ok, fail } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? fail(new Error(m.error)) : ok(m.result);
    }
  });
});

window.igrek = {
  /** { theme, language, projectId } */
  hello,
  /** methods: projects, project, memory, sessions, costs, uptime */
  ask(method, params = {}) {
    const id = next++;
    parent.postMessage({ igrek: 1, id, method, params }, "*");
    return new Promise((ok, fail) => waiting.set(id, { ok, fail }));
  },
};
