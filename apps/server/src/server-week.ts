import type { Database } from "bun:sqlite";
import type { InboxNotice } from "@igrek/core";
import { ACCESS_COMMAND, accessReport } from "./server-access";
import { findings, SCAN_COMMAND, scanned } from "./server-audit";
import type { Servers } from "./servers";

const WEEK = 7 * 86_400_000;

/** What a week on one server came to, kept so the inbox can say it until the next one. */
export interface ServerWeekReport {
  at: number;
  high: number;
  medium: number;
  /** The most serious findings' ids, for the sentence ("miner, backdoor"). */
  top: string[];
  logins: number;
  people: number;
  unknownKeys: number;
  passwordLogins: number;
  failed: number;
}

/**
 * The weekly server report (plan.md 18.8): once a week each server gets the security scan and the
 * "who used it" read, both read-only, and the inbox gets one line per server. A server that does not
 * answer is tried again at the next tick; nothing is written for it.
 */
export class ServerWeek {
  constructor(
    private readonly db: Database,
    private readonly servers: Servers,
    private readonly now: () => number = Date.now,
  ) {}

  last(serverId: string): ServerWeekReport | undefined {
    const row = this.db.query("SELECT data FROM server_reports WHERE server_id = ?").get(serverId) as {
      data: string;
    } | null;
    return row ? (JSON.parse(row.data) as ServerWeekReport) : undefined;
  }

  /** Reports every server whose last report is a week old (or missing); returns how many were made. */
  async tick(): Promise<number> {
    let made = 0;
    for (const server of this.servers.list()) {
      const last = this.last(server.id);
      if (last && this.now() - last.at < WEEK) continue;
      const report = await this.report(server.id).catch(() => undefined);
      if (!report) continue;
      this.db
        .query(
          "INSERT INTO server_reports (server_id, at, data) VALUES (?, ?, ?) ON CONFLICT(server_id) DO UPDATE SET at = excluded.at, data = excluded.data",
        )
        .run(server.id, report.at, JSON.stringify(report));
      made++;
    }
    return made;
  }

  private async report(serverId: string): Promise<ServerWeekReport | undefined> {
    const scan = await this.servers.inspect(serverId, SCAN_COMMAND, "weekly security report");
    if (!scanned(scan.output)) return undefined;
    const access = accessReport((await this.servers.inspect(serverId, ACCESS_COMMAND, "weekly who used it")).output);
    const list = findings(scan.output);
    return {
      at: this.now(),
      high: list.filter((f) => f.severity === "high").length,
      medium: list.filter((f) => f.severity === "medium").length,
      top: list
        .filter((f) => f.severity === "high")
        .map((f) => f.id)
        .slice(0, 3),
      logins: access.logins.length,
      people: new Set(access.logins.map((l) => l.who || l.key || `${l.user}@${l.ip}`)).size,
      unknownKeys: access.logins.filter((l) => l.key && l.who === undefined).length,
      passwordLogins: access.logins.filter((l) => l.method === "password").length,
      failed: access.failed.total,
    };
  }

  /** One inbox line per server reported in the last week. */
  notices(): InboxNotice[] {
    const out: InboxNotice[] = [];
    for (const server of this.servers.list()) {
      const r = this.last(server.id);
      if (!r || this.now() - r.at > WEEK) continue;
      const alarm = r.high + r.unknownKeys > 0;
      out.push({
        id: `serverweek:${server.id}:${r.at}`,
        kind: alarm ? "serverAlarm" : "serverWeek",
        projectId: "",
        projectName: server.name,
        // The numbers only: the page words them in the reader's language.
        detail: JSON.stringify(r),
        at: r.at,
        link: `/servers/${server.id}?tab=${alarm ? "security" : "access"}`,
      });
    }
    return out;
  }
}
