"""Page switches timed in WebKitGTK, the engine of Igrek's desktop window on Linux (plan.md 19.10).

Run by scripts/perf-pages.ts with the test server's address and the pages to open; prints one line
of JSON. The view sits in an offscreen window, so nothing shows on the screen (without GL compositing, which
an offscreen window cannot give it).
"""
import json
import sys

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.1")
from gi.repository import GLib, Gtk, WebKit2  # noqa: E402

URL, PAGES = sys.argv[1], json.loads(sys.argv[2])

# The same steps as in Chromium (perf-pages.ts): click the page's link, wait until the new page has
# replaced the old one and two frames have been drawn.
MEASURE = """
const pages = JSON.parse(pagesJson);
const visit = async (to) => {
  const before = document.querySelector("main .ge-page");
  const link = document.querySelector(`nav a[href="${to}"]`);
  if (!link) return -1;
  const t0 = performance.now();
  link.click();
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  for (let i = 0; i < 300; i++) {
    await frame();
    const now = document.querySelector("main .ge-page");
    if (now && now !== before && now.childElementCount > 0) {
      await frame();
      await frame();
      return performance.now() - t0;
    }
  }
  return -1;
};
const cold = [];
const warm = {};
for (const p of pages) cold.push(await visit(p));
// Three rounds back to every page: one slow frame of the offscreen view does not decide it.
for (let round = 0; round < 3; round++)
  for (const p of pages) warm[`${p}#${round}`] = Math.round(await visit(p));
return JSON.stringify({ cold, warm, agent: navigator.userAgent });
"""


def done(view, result):
    try:
        value = view.call_async_javascript_function_finish(result)
        print(value.to_string())
    except Exception as err:  # noqa: BLE001 - the error is the result
        print(json.dumps({"error": str(err)}))
    Gtk.main_quit()


def loaded(view, event):
    if event != WebKit2.LoadEvent.FINISHED:
        return
    GLib.timeout_add(2500, lambda: start(view))


def start(view):
    args = GLib.Variant("a{sv}", {"pagesJson": GLib.Variant("s", json.dumps(PAGES))})
    view.call_async_javascript_function(MEASURE, -1, args, None, None, None, done)
    return False


window = Gtk.OffscreenWindow()
window.set_default_size(1280, 820)
view = WebKit2.WebView()
window.add(view)
window.show_all()
view.connect("load-changed", loaded)
view.load_uri(URL)
GLib.timeout_add_seconds(120, lambda: (print(json.dumps({"error": "timed out"})), Gtk.main_quit()))
Gtk.main()
