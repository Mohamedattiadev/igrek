import type { Database } from "bun:sqlite";
import {
  aboutFuture,
  answerFromCards,
  audienceOf,
  type BotSay,
  canAssign,
  cardPeople,
  emptyOrg,
  foldOrg,
  followUps,
  freeSlots,
  meetingNotices,
  morningReport,
  namedIn,
  newCard,
  newMeetingKey,
  type OrgCard,
  type OrgPost,
  type OrgState,
  type OrgStructure,
  orgItems,
  pickAssignee,
  roomOfMeeting,
  search,
  type TeamMember,
  type TimelineItem,
  understand,
  upcoming,
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

  /**
   * The stream starts again from the hub (on connect): start from nothing, then fold it all. What
   * still waits in the outbox is not on the hub yet, so it is folded again at once and stays seen.
   */
  reset(): void {
    this.state = emptyOrg();
    this.live = false;
    const me = this.deps.me()?.id ?? "";
    const rows = this.deps.db.query("SELECT kind, value FROM org_outbox ORDER BY at, rowid").all() as {
      kind: string;
      value: string;
    }[];
    for (const r of rows) {
      const value = JSON.parse(r.value) as Record<string, unknown>;
      foldOrg(this.state, r.kind, value, { author: me, at: Number(value.at ?? Date.now()) });
    }
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
    if (this.live && card) {
      this.cardNotice(card);
      void this.botCard(card).catch(() => undefined);
    }
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
    const card = kind === "org-card" ? this.state.cards[id] : undefined;
    if (card && this.live) await this.botCard(card);
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

  private say(channel: string, say: BotSay, card?: string, image?: string) {
    return this.act("org-post", {
      channel,
      text: "",
      say,
      bot: true,
      mentions: [],
      teamMentions: [],
      ...(card ? { card } : {}),
      ...(image ? { image } : {}),
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
    } else if (u.kind === "meet") {
      await this.book(u, post.by, reply);
    } else if (u.kind === "question") {
      await this.answer(u, reply);
    } else await this.give(u, post.by, reply);
  }

  /**
   * This computer's team bots (plan.md 19.2), set by the server at startup: their list, and a way to
   * give one a card's job (it returns the run's id, or nothing when the bot cannot take it here).
   */
  teamBots?: {
    list: () => { handle: string; name: string }[];
    start: (handle: string, card: OrgCard) => Promise<string | undefined>;
  };
  /** Runs started for cards, so the card follows the run. */
  private runs = new Map<string, string>();
  private lastBotList = "";

  /** Tells the company which bots this Igrek runs, when that changed. */
  async announceBots(): Promise<void> {
    const me = this.deps.me()?.id;
    const list = this.teamBots?.list() ?? [];
    const text = JSON.stringify(list);
    if (!me || text === this.lastBotList) return;
    this.lastBotList = text;
    await this.act("org-botlist", { id: `bots-${me}`.slice(0, 40), owner: me, bots: list });
  }

  /** A card given to one of this computer's bots, not started yet: its job begins here. */
  private async botCard(card: OrgCard): Promise<void> {
    const handle = card.assignee?.startsWith("bot:") ? card.assignee.slice(4) : undefined;
    if (
      !handle ||
      card.status !== "accepted" ||
      card.told?.bot ||
      !this.teamBots?.list().some((b) => b.handle === handle)
    )
      return;
    const runId = await this.teamBots.start(handle, card).catch(() => undefined);
    if (!runId) return;
    this.runs.set(runId, card.id);
    await this.act("org-card", {
      ...card,
      status: "doing",
      told: { ...card.told, bot: Date.now() },
      updatedAt: Math.max(Date.now(), card.updatedAt + 1),
      history: [...card.history, { at: Date.now(), by: this.deps.me()?.id ?? "", what: `@${handle} started` }],
      base: card.updatedAt,
    } as unknown as Record<string, unknown>);
  }

  /** A bot's run moved: ready for review or finished, its card follows (merging stays a person's yes). */
  async runChanged(runId: string, status: string): Promise<void> {
    const card = this.state.cards[this.runs.get(runId) ?? ""];
    const next = status === "ready" ? "review" : status === "merged" || status === "done" ? "done" : undefined;
    if (!card || !next || card.status === next) return;
    await this.act("org-card", {
      ...card,
      status: next,
      updatedAt: Math.max(Date.now(), card.updatedAt + 1),
      history: [...card.history, { at: Date.now(), by: this.deps.me()?.id ?? "", what: `run ${status}` }],
      base: card.updatedAt,
    } as unknown as Record<string, unknown>);
  }

  /** A small picture of a page (JPEG, data: address), set by the server at startup when a browser is there. */
  shoot?: (url: string) => Promise<string | undefined>;

  /** Everything this computer may read, for questions to the bot (history.ts); set by the server at startup. */
  history?: () => Promise<TimelineItem[]>;

  /**
   * A question: the cards answer what a team or a person did; anything else is looked up in the
   * whole history and in what is coming, and answered with dates (plan.md 20.9).
   */
  private async answer(u: Extract<ReturnType<typeof understand>, { kind: "question" }>, reply: string): Promise<void> {
    const cards = answerFromCards(this.structure, this.state, u);
    if (cards.length && (u.team || u.person)) {
      const list = cards
        .slice(0, 8)
        .map((c) => `${c.title} (${c.status})`)
        .join("; ");
      await this.say(reply, { key: "answer", vars: { count: cards.length, list } });
      return;
    }
    const items = [...((await this.history?.()) ?? []), ...orgItems(this.state)];
    const found = aboutFuture(u.text) ? upcoming(this.state, u.text) : search(items, u.text).map((f) => f.item);
    const name = (id: string) => this.deps.people().find((p) => p.id === id)?.displayName ?? id;
    const list = found
      .slice(0, 6)
      .map((x) => `${new Date(x.at).toISOString().slice(0, 10)} ${name(x.who)}: ${x.text.slice(0, 120)}`)
      .join("; ");
    await this.say(reply, { key: found.length ? "answerHistory" : "answerNone", vars: { count: found.length, list } });
  }

  /** "30 minutes with Kerim this week": the first time both are free becomes a meeting with an invite. */
  private async book(
    want: { people: string[]; minutes: number; days: number; title: string },
    by: string,
    reply: string,
  ): Promise<void> {
    const people = [...new Set([by, ...want.people])];
    const [at] = freeSlots(
      people,
      want.minutes,
      { availability: this.state.availability, meetings: Object.values(this.state.meetings) },
      {
        from: Date.now() + 30 * MINUTE,
        days: want.days,
        limit: 1,
      },
    );
    const names = want.people.map((p) => this.deps.people().find((x) => x.id === p)?.displayName ?? p).join(", ");
    if (!at) {
      await this.say(reply, { key: "meetNoTime", vars: { who: names } });
      return;
    }
    const now = Date.now();
    await this.act("org-meeting", {
      id: crypto.randomUUID().slice(0, 18),
      title: want.title,
      agenda: "",
      start: at,
      minutes: want.minutes,
      recurrence: "none",
      attendees: people,
      teams: [],
      key: newMeetingKey(),
      replies: { [by]: "yes" },
      consent: {},
      status: "planned",
      transcript: [],
      decisions: [],
      actions: [],
      by,
      at: now,
      updatedAt: now,
    });
    await this.say(reply, { key: "meetBooked", vars: { who: names, due: at, count: want.minutes } });
    for (const p of want.people)
      await this.say(`bot:${p}`, { key: "meetInvite", vars: { title: want.title, due: at } });
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
      // A note from a preview, fixed: whoever left it sees how the page looks now (plan.md 20.7 b).
      const image =
        f.stage === "done" && card.origin === "preview" && card.note?.url
          ? await this.shoot?.(card.note.url)
          : undefined;
      for (const to of f.to) await this.say(`bot:${to}`, f.say, card.id, image);
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

  private toldMeetings = new Set<string>();

  /** My meetings: ten minutes before and at the start, on the desktop and the phone (plan.md 20.8). */
  async meetingTick(now = Date.now()): Promise<void> {
    const me = this.deps.me()?.id;
    if (!me || !this.live) return;
    const teams = this.structure.teams.filter((t) => t.members.includes(me)).map((t) => t.id);
    for (const n of meetingNotices(Object.values(this.state.meetings), me, teams, now)) {
      if (this.toldMeetings.has(n.id)) continue;
      this.toldMeetings.add(n.id);
      // Late: only someone who is not in the call is told it started without them.
      if (n.kind === "late" && (await this.inCall(n.meeting.key, me))) continue;
      const key = { soon: "meetSoon", started: "meetStarted", late: "meetLate" }[n.kind];
      const text = botText({ key, vars: { title: n.meeting.title } }, this.language());
      this.deps.bus.publish({
        type: "alert",
        kind: "org",
        title: text,
        link: `/org?tab=meetings&meet=${n.meeting.id}`,
      });
      this.onTell?.(text);
    }
  }

  /** Whether someone is in a meeting's call now (the hub knows who is in its room, not what is said). */
  private async inCall(key: string, who: string): Promise<boolean> {
    const room = await roomOfMeeting(key);
    const { people } = await this.deps.hub<{ people: string[] }>(`/api/rooms/${room}`).catch(() => ({ people: [who] }));
    return people.includes(who);
  }

  /** Starts the bot's minute (and the meeting reminders); the returned function stops it. */
  start(): () => void {
    const timer = setInterval(() => {
      void this.meetingTick().catch(() => undefined);
      void this.announceBots().catch(() => undefined);
      void this.tick().catch(() => undefined);
    }, MINUTE / 2);
    return () => clearInterval(timer);
  }
}
