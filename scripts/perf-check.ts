/**
 * Speed and resources, checked before each release (plan.md 19.10): the server's start time, its
 * CPU while idle, its memory, and how long the main reads take, on a sealed-off test server.
 * Fails when one is past its limit; prints the numbers either way.
 */
import { measurePages, PAGE_LIMIT_MS } from "./perf-pages";
import { seedProject, startTestServer } from "./test-server";

const LIMITS = { startMs: 3000, idleCpuPct: 2, rssMb: 200, routeMs: 200 };
const ROUTES = ["/api/projects", "/api/chats", "/api/limits", "/api/chat/channels", "/api/inbox/notices", "/api/team"];

const t0 = Date.now();
const server = await startTestServer({ seed: seedProject, stubAgent: true });
const startMs = Date.now() - t0;
const pid = Number((await Bun.$`pgrep -n -f "apps/server/src/index.ts"`.text()).trim());
const cpuTicks = async () => {
  const fields = (await Bun.file(`/proc/${pid}/stat`).text()).split(") ")[1]?.split(" ") ?? [];
  return Number(fields[11]) + Number(fields[12]);
};
// Past the first moments' one-off work, then half a minute of nothing.
await Bun.sleep(20_000);
const before = await cpuTicks();
await Bun.sleep(30_000);
const idleCpuPct = (((await cpuTicks()) - before) / 100 / 30) * 100;
const rssMb = Number((await Bun.file(`/proc/${pid}/status`).text()).match(/VmRSS:\s+(\d+)/)?.[1] ?? 0) / 1024;
const routes: Record<string, number> = {};
for (const route of ROUTES) {
  const at = performance.now();
  await server.call(route);
  routes[route] = Math.round(performance.now() - at);
}
await server.stop();

// Page switches in a real browser, when one and a built app are there (plan.md 19.10).
const pages = await measurePages();
const slow = Object.entries(routes).filter(([, ms]) => ms > LIMITS.routeMs);
console.log(
  JSON.stringify(
    { startMs, idleCpuPct: Number(idleCpuPct.toFixed(2)), rssMb: Math.round(rssMb), routes, pages },
    null,
    2,
  ),
);
const problems = [
  startMs > LIMITS.startMs && `start ${startMs} ms > ${LIMITS.startMs}`,
  idleCpuPct > LIMITS.idleCpuPct && `idle CPU ${idleCpuPct.toFixed(1)}% > ${LIMITS.idleCpuPct}%`,
  rssMb > LIMITS.rssMb && `memory ${Math.round(rssMb)} MB > ${LIMITS.rssMb}`,
  ...slow.map(([route, ms]) => `${route} ${ms} ms > ${LIMITS.routeMs}`),
  pages && pages.warm > PAGE_LIMIT_MS && `page switch ${pages.warm} ms > ${PAGE_LIMIT_MS}`,
  pages?.webkit &&
    pages.webkit.warm > PAGE_LIMIT_MS &&
    `page switch in WebKitGTK ${pages.webkit.warm} ms > ${PAGE_LIMIT_MS}`,
  pages &&
    pages.typing.slowestKeyMs > PAGE_LIMIT_MS &&
    `a key took ${pages.typing.slowestKeyMs} ms to show while typing`,
].filter(Boolean);
if (problems.length) {
  console.error(`x ${problems.join("\nx ")}`);
  process.exit(1);
}
console.log("speed and resources within their limits");
