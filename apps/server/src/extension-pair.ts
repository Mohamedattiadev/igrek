import type { Hono } from "hono";
import type { ExtensionKeys } from "./extension-routes";

/**
 * Pairing the browser extension without copying a key (plan.md 7.2, nothing by hand): the extension
 * asks, both it and Igrek show the same short code, and the user allows it in Igrek. Only then does
 * the extension get a key, once. A web page cannot ask: these routes answer an extension's own origin
 * only (security.ts), and nothing is granted without the user's click in Igrek itself.
 */
export interface PairRequest {
  id: string;
  code: string;
  at: number;
  status: "waiting" | "allowed" | "denied";
  key?: string;
}

const TTL = 5 * 60_000;
const MAX_WAITING = 3;

export class ExtensionPairing {
  private requests = new Map<string, PairRequest>();

  constructor(
    private readonly keys: Pick<ExtensionKeys, "pair">,
    private readonly changed: () => void = () => undefined,
  ) {}

  private sweep(now: number): void {
    for (const [id, r] of this.requests) if (now - r.at > TTL) this.requests.delete(id);
  }

  ask(now = Date.now()): PairRequest | undefined {
    this.sweep(now);
    if (this.waiting(now).length >= MAX_WAITING) return undefined;
    const digits = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    const request: PairRequest = {
      id: crypto.randomUUID(),
      code: String(digits % 1_000_000).padStart(6, "0"),
      at: now,
      status: "waiting",
    };
    this.requests.set(request.id, request);
    this.changed();
    return request;
  }

  waiting(now = Date.now()): { id: string; code: string; at: number }[] {
    this.sweep(now);
    return [...this.requests.values()]
      .filter((r) => r.status === "waiting")
      .map(({ id, code, at }) => ({ id, code, at }));
  }

  decide(id: string, allow: boolean): boolean {
    const r = this.requests.get(id);
    if (r?.status !== "waiting") return false;
    r.status = allow ? "allowed" : "denied";
    if (allow) r.key = this.keys.pair();
    this.changed();
    return true;
  }

  /** What the extension sees; an allowed key is handed over once and then forgotten here. */
  poll(id: string, now = Date.now()): { status: PairRequest["status"] | "gone"; key?: string } {
    this.sweep(now);
    const r = this.requests.get(id);
    if (!r) return { status: "gone" };
    if (r.status === "waiting") return { status: "waiting" };
    this.requests.delete(id);
    return r.key ? { status: r.status, key: r.key } : { status: r.status };
  }
}

export function registerPairRoutes(app: Hono, pairing: ExtensionPairing): void {
  // From the extension (its origin only, no key yet).
  app.post("/api/ext-pair", (c) => {
    const r = pairing.ask();
    return r ? c.json({ id: r.id, code: r.code }) : c.json({ error: "Too many requests are waiting" }, 429);
  });
  app.get("/api/ext-pair/:id", (c) => c.json(pairing.poll(c.req.param("id"))));
  // From Igrek's own pages.
  app.get("/api/extension/requests", (c) => c.json(pairing.waiting()));
  app.post("/api/extension/requests/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { allow?: unknown };
    return pairing.decide(c.req.param("id"), body.allow === true)
      ? c.json({ ok: true })
      : c.json({ error: "No such request" }, 404);
  });
}
