import type { Database } from "bun:sqlite";
import {
  answerFromCards,
  audienceOf,
  type BotSay,
  canAssign,
  cardPeople,
  emptyOrg,
  foldOrg,
  followUps,
  morningReport,
  namedIn,
  newCard,
  type OrgCard,
  type OrgPost,
  type OrgState,
  type OrgStructure,
  pickAssignee,
  type TeamMember,
  understand,
} from "@igrek/core";
import { bundledResources } from "@igrek/i18n";
import type { Bus } from "./bus";

/** What the company needs from the team sync: who I am, the people, the hub, and a way to send. */
export interface OrgDeps {
  db: Database;
  bus: Bus;
  me: () => (TeamMember & { role: TeamMember["role"] }) | undefined;
  people: () => TeamMember[];
  hub: <T>(path: string, init?: RequestInit) => Promise<T>;
  /** Encrypts and sends one event on the company stream; false while the hub cannot be reached. */
  publish: (kind: string, id: string, value: unknown) => Promise<boolean>;
}

const MINUTE = 60_000;

/** What the bot said, as text in a language Igrek carries (for a phone, which has no page to render it). */
export function botText(say: BotSay, language: string): string {
  const pack = (bundledResources[language as keyof typeof bundledResources] ?? bundledResources.en) as unknown as {
    orgBot: Record<string, string>;
  };
  const vars: Record<string, string | number> = { ...say.vars };
  if (typeof vars.due === "number") vars.due = vars.due ? new Date(vars.due).toLocaleString(language) : "-";
  if (typeof vars.why === "string" && vars.why)
    vars.why = botText({ key: vars.why, vars: { ...say.vars, why: "" } }, language);
  return (pack.orgBot[say.key] ?? say.key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars[k] ?? ""));
}

/**
 * The company in Igrek on a computer (plan.md 20.2-20.7): its teams from the hub, and its cards,
 * channels, requests and announcements folded from the encrypted company stream with the same code
 * as the hub's web page (@igrek/core org.ts). What is written while offline waits in org_outbox.
 * When this person's Igrek hosts the coordinator bot, it reads commands and follows cards up here.
 */
export class Org {
  state: OrgState = emptyOrg();
  structure: OrgStructure = { teams: [], generalManagers: [] };
  /** A question the bot asked ("Backend or Frontend?"), waiting for its answer in that channel. */
  private asked = new Map<
    string,
    { draft: Extract<ReturnType<typeof understand>, { kind: "ask" }>["draft"]; by: string }
  >();
  /** What the bot has already handled, so a replay of the stream does not act twice. */
  private handled = new Set<string>();
  private live = false;

  constructor(private readonly deps: OrgDeps) {}

  me(): TeamMember | undefined {
    return this.deps.me();
  }

  /** Teams and who leads them, from the hub; called on connect and when the hub says they changed. */
  async loadStructure(): Promise<void> {
    try {
      this.structure = await this.deps.hub<OrgStructure>("/api/org");
      this.changed();
    } catch {
      // Offline, or a hub from before teams: keep what we had.
    }
  }

  /** The stream starts again from the hub (on connect): start from nothing, then fold it all. */
  reset(): void {
    this.state = emptyOrg();
    this.live = false;
  }

  /** The replay is over: from now on, what arrives is news (notices, bot commands). */
  caughtUp(): void {
    this.live = true;
  }

  /** One decrypted event from the company stream. */
  apply(kind: string, value: Record<string, unknown>, author: string, at: number): void {
    const { card, post } = foldOrg(this.state, kind, value, { author, at });
    if (this.live && post && kind === "org-post") {
      this.notice(post);
      void this.botHears(post);
    }
    if (this.live && card) this.cardNotice(card);
    this.changed();
  }

  private changed(): void {
    this.deps.bus.publish({ type: "org-changed" });
  }

  /** Something for this person's phone (Telegram), set by the server at startup. */
  onTell?: (text: string) => void;
  /** The language the bot's words are told in on the phone. */
  language: () => string = () => "en";

  /** A message from the phone: to the bot when it starts with its @handle. */
  async fromPhone(text: string): Promise<boolean> {
    const me = this.deps.me();
    if (!me || !new RegExp(`^@${this.state.bot.handle}\\b`, "i").test(text)) return false;
    await this.post({ channel: `bot:${me.id}`, text });
    return true;
  }

  /** A message that names me (or my team) reaches the desktop, Telegram and the like. */
  private notice(post: OrgPost): void {
    const me = this.deps.me()?.id;
    if (!me) return;
    // The bot's words to me go to the phone too, mine included (the host writes them as me).
    if (post.channel === `bot:${me}` && post.say)
      this.onTell?.(`${this.state.bot.name}: ${botText(post.say, this.language())}`);
    if (post.by === me) return;
    const direct = post.channel === `bot:${me}`;
    const onMyCard = cardPeople(this.state, post.channel).includes(me);
    if (direct || onMyCard || audienceOf(this.structure, post).includes(me) || post.announce)
      this.deps.bus.publish({
        type: "alert",
        kind: "org",
        title: post.say ? this.state.bot.name : post.text.slice(0, 120),
        link: "/org",
      });
  }

  private cardNotice(card: OrgCard): void {
    const me = this.deps.me()?.id;
    if (me && card.assignee === me && card.updatedBy !== me && card.status === "accepted")
      this.deps.bus.publish({ type: "alert", kind: "org", title: card.title, link: "/org" });
  }

  // ---- writing ------------------------------------------------------------------------

  /** Written here: folded at once, then sent in order (or kept until the hub can be reached). */
  async act(kind: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const me = this.deps.me();
    if (!me) throw new Error("Not in a team");
    const id = String(value.id ?? crypto.randomUUID().slice(0, 18));
    const full = { ...value, id, at: Number(value.at ?? Date.now()) };
    foldOrg(this.state, kind, full, { author: me.id, at: full.at });
    this.deps.db
      .query("INSERT INTO org_outbox (id, kind, value, at) VALUES (?, ?, ?, ?)")
      .run(`${kind}-${id}-${crypto.randomUUID().slice(0, 8)}`, kind, JSON.stringify(full), Date.now());
    this.changed();
    await this.flush();
    // My own command to the bot that runs here: it hears it like anyone else's.
    const post = kind === "org-post" ? this.state.posts[id] : undefined;
    if (post && this.live) {
      if (post.bot) this.notice(post);
      await this.botHears(post);
    }
    return full;
  }

  /** How many of my writes still wait for the hub (shown as the sync state, plan.md 20.10). */
  waiting(): number {
    return (this.deps.db.query("SELECT COUNT(*) AS n FROM org_outbox").get() as { n: number }).n;
  }

  /** Sends what waits, oldest first; stops at the first one the hub cannot take yet. */
  async flush(): Promise<void> {
    const rows = this.deps.db.query("SELECT id, kind, value FROM org_outbox ORDER BY at, rowid LIMIT 200").all() as {
      id: string;
      kind: string;
      value: string;
    }[];
    for (const r of rows) {
      const value = JSON.parse(r.value) as Record<string, unknown>;
      if (!(await this.deps.publish(r.kind, `${r.kind}-${String(value.id)}`.slice(0, 40), value))) return;
      this.sent(r.id, r.value);
    }
  }

  /** Off the outbox, only the copy that was sent: a row changed meanwhile goes again. */
  private sent(id: string, value: string): void {
    this.deps.db.query("DELETE FROM org_outbox WHERE id = ? AND value = ?").run(id, value);
  }

  /** A post from me, with the people and teams it names. */
  post(input: { channel: string; text: string; announce?: boolean; audience?: string[]; card?: string }) {
    return this.act("org-post", { ...input, ...namedIn(this.structure, this.deps.people(), input.text) });
  }

  // ---- the coordinator bot (plan.md 20.7) ------------------------------------------------

  /** This Igrek runs the bot: it is switched on and this person is its host. */
  hostsBot(): boolean {
    const me = this.deps.me()?.id;
    return !!me && this.state.bot.enabled && this.state.bot.host === me;
  }

  private say(channel: string, say: BotSay, card?: string) {
    return this.act("org-post", {
      channel,
      text: "",
      say,
      bot: true,
      mentions: [],
      teamMentions: [],
      ...(card ? { card } : {}),
    });
  }

  /** A message to the bot: "@asistan ...", or anything in someone's conversation with it. */
  private async botHears(post: OrgPost): Promise<void> {
    if (!this.hostsBot() || post.bot || this.handled.has(post.id)) return;
    const handle = this.state.bot.handle;
    const toBot = post.channel === `bot:${post.by}` || new RegExp(`(^|\\s)@${handle}\\b`, "i").test(post.text);
    if (!toBot) return;
    this.handled.add(post.id);
    const person = this.deps.people().find((p) => p.id === post.by);
    const reply = post.channel;
    // Only those who may give work give it through the bot (plan.md 20.7, rules).
    if (!person || !canAssign(this.structure, person)) {
      await this.say(reply, { key: "notAllowed" });
      return;
    }
    await this.command(post, reply);
  }

  private async command(post: OrgPost, reply: string): Promise<void> {
    const pending = this.asked.get(reply);
    const people = this.deps.people().map((p) => ({ id: p.id, username: p.username, displayName: p.displayName }));
    if (pending) {
      const team = this.structure.teams.find(
        (t) => pending.draft.options.includes(t.id) && post.text.toLowerCase().includes(t.name.toLowerCase()),
      );
      if (team) {
        this.asked.delete(reply);
        await this.give({ ...pending.draft, team: team.id }, post.by, reply);
        return;
      }
    }
    const u = understand(post.text, { structure: this.structure, people, botHandle: this.state.bot.handle });
    if (u.kind === "ask") {
      this.asked.set(reply, { draft: u.draft, by: post.by });
      await this.say(reply, u.say);
    } else if (u.kind === "question") {
      const cards = answerFromCards(this.structure, this.state, u);
      await this.say(reply, {
        key: cards.length ? "answer" : "answerNone",
        vars: {
          count: cards.length,
          list: cards
            .slice(0, 8)
            .map((c) => `${c.title} (${c.status})`)
            .join("; "),
        },
      });
    } else await this.give(u, post.by, reply);
  }

  /** Opens the card for the right person, and says to whom and why. */
  private async give(
    want: { title: string; team?: string; person?: string; due?: number; priority: OrgCard["priority"] },
    by: string,
    reply: string,
  ): Promise<void> {
    const pick = pickAssignee(this.structure, this.state, want);
    const card = newCard(
      {
        title: want.title,
        ...(want.team ? { team: want.team } : {}),
        ...(pick.assignee ? { assignee: pick.assignee } : {}),
        ...(want.due ? { due: want.due } : {}),
        priority: want.priority,
        origin: "bot",
        requestedBy: by,
        ...(pick.say ? { reason: JSON.stringify(pick.say) } : {}),
      },
      by,
    );
    await this.act("org-card", card as unknown as Record<string, unknown>);
    const name = this.deps.people().find((p) => p.id === pick.assignee)?.displayName ?? "";
    await this.say(
      reply,
      {
        key: pick.assignee ? "gave" : "queued",
        vars: {
          title: card.title,
          who: name,
          team: this.structure.teams.find((t) => t.id === want.team)?.name ?? "",
          due: card.due ?? 0,
          why: pick.say?.key ?? "",
          count: Number(pick.say?.vars?.count ?? 0),
        },
      },
      card.id,
    );
    if (pick.assignee && pick.assignee !== by)
      await this.say(
        `bot:${pick.assignee}`,
        { key: "forYou", vars: { title: card.title, due: card.due ?? 0 } },
        card.id,
      );
  }

  /** Every minute on the host: follow-ups, and the morning report once a day. */
  async tick(now = Date.now()): Promise<void> {
    if (!this.hostsBot() || !this.live) return;
    for (const f of followUps(this.structure, this.state, now)) {
      const card = this.state.cards[f.card];
      if (!card) continue;
      for (const to of f.to) await this.say(`bot:${to}`, f.say, card.id);
      await this.act("org-card", {
        ...card,
        told: { ...card.told, [f.stage]: now },
        updatedAt: Math.max(now, card.updatedAt + 1),
        base: card.updatedAt,
      } as unknown as Record<string, unknown>);
    }
    await this.report(now);
  }

  private async report(now: number): Promise<void> {
    const hour = this.state.bot.reportHour;
    const day = new Date(now).toDateString();
    if (hour < 0 || new Date(now).getHours() < hour) return;
    // Every morning the day; on Monday the week as well (plan.md 20.3, a weekly report).
    const spans = new Date(now).getDay() === 1 ? [1, 7] : [1];
    for (const gm of this.structure.generalManagers)
      for (const days of spans) {
        const id = `${days > 1 ? "week" : "day"}-${gm}-${day}`.replace(/\s+/g, "-").slice(0, 40);
        if (this.state.posts[id]) continue;
        const say = morningReport(this.state, now, days);
        await this.act("org-post", {
          id,
          channel: `bot:${gm}`,
          text: "",
          say,
          bot: true,
          mentions: [],
          teamMentions: [],
        });
      }
  }

  /**
   * A site went down (monitors): the team that looks after servers hears it in its channel, and
   * the general manager gets one line from the bot (plan.md 20.5). Only the bot's host says it, once.
   */
  async siteDown(title: string): Promise<void> {
    if (!this.hostsBot()) return;
    const team = this.structure.teams.find((t) =>
      /sunucu|server|ops|altyap|infra|devops/i.test(`${t.name} ${t.description}`),
    );
    if (team) await this.say(`team:${team.id}`, { key: "siteDown", vars: { site: title } });
    for (const gm of this.structure.generalManagers)
      await this.say(`bot:${gm}`, { key: "siteDown", vars: { site: title } });
  }

  /** Starts the bot's minute; the returned function stops it. */
  start(): () => void {
    const timer = setInterval(() => void this.tick().catch(() => undefined), MINUTE);
    return () => clearInterval(timer);
  }
}
