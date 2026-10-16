import type { IndexStatus } from "@godeye/core";
import { claudeAdapter } from "./adapters/claude";
import { codexAdapter } from "./adapters/codex";
import type { Adapter, ParsedMessage, SessionFile } from "./adapters/types";
import type { Bus } from "./bus";
import type { Store } from "./store";

const CHUNK_BYTES = 8 * 1024 * 1024;
const POLL_MS = 3000;
const NEWLINE = 10;

/**
 * Watches Claude Code transcripts and folds new lines into the database.
 * Each file is read from where we stopped last time, so a 50 MB transcript is
 * parsed once and afterwards only its new lines are.
 */
export class Indexer {
  readonly status: IndexStatus = { running: false, filesTotal: 0, filesDone: 0, sessions: 0, projects: 0 };
  private timer?: ReturnType<typeof setTimeout>;
  private scanning = false;
  private lastBroadcast = 0;

  constructor(
    private readonly store: Store,
    private readonly bus: Bus,
    private readonly adapters: Adapter[] = [claudeAdapter(), codexAdapter()],
  ) {}

  private files(): { file: SessionFile; adapter: Adapter }[] {
    return this.adapters.flatMap((adapter) => adapter.listFiles().map((file) => ({ file, adapter })));
  }

  start(): void {
    const loop = async () => {
      await this.scan().catch((err: Error) => {
        this.status.lastError = err.message;
      });
      this.timer = setTimeout(loop, POLL_MS);
    };
    void loop();
  }

  stop(): void {
    clearTimeout(this.timer);
  }

  /** Re-reads one transcript right away (used by the session-end hook). */
  async touch(sessionId: string): Promise<void> {
    const match = this.files().find(({ file }) => file.sessionId === sessionId);
    const result = match && (await this.processFile(match.file, match.adapter));
    if (result) this.announce([result]);
  }

  async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const files = this.files()
        .filter(({ file }) => {
          const known = this.store.fileOffset(file.path);
          return !known || known.size !== file.size || known.mtime !== file.mtime;
        })
        // Newest first, so today's work shows up before last month's.
        .sort((a, b) => b.file.mtime - a.file.mtime);
      if (files.length === 0) return;

      const big = files.length > 5;
      Object.assign(this.status, { running: big, filesTotal: files.length, filesDone: 0 });
      const changed: { projectId: string | null; sessionId: string }[] = [];
      for (const { file, adapter } of files) {
        const result = await this.processFile(file, adapter);
        if (result) changed.push(result);
        this.status.filesDone++;
        if (big) {
          this.broadcastStatus();
          await Bun.sleep(0);
        }
      }
      this.status.running = false;
      this.broadcastStatus(true);
      this.announce(changed);
    } finally {
      this.scanning = false;
    }
  }

  private announce(changed: { projectId: string | null; sessionId: string }[]): void {
    if (changed.length === 0) return;
    this.bus.publish({
      type: "sessions-changed",
      projectIds: [...new Set(changed.map((c) => c.projectId).filter((id): id is string => !!id))],
      sessionIds: changed.map((c) => c.sessionId),
    });
  }

  private broadcastStatus(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastBroadcast < 500) return;
    this.lastBroadcast = now;
    Object.assign(this.status, this.store.counts());
    this.bus.publish({ type: "index", status: { ...this.status } });
  }

  private async processFile(
    file: SessionFile,
    adapter: Adapter,
  ): Promise<{ projectId: string | null; sessionId: string } | undefined> {
    let offset = this.store.fileOffset(file.path)?.offset ?? 0;
    if (file.size < offset) {
      // Transcript got shorter: it was rewritten, start over.
      this.store.resetSession(file.sessionId, file.path);
      offset = 0;
    }
    const state = this.store.loadState(file.sessionId);
    const blob = Bun.file(file.path);
    const decoder = new TextDecoder();
    let projectId: string | null = null;
    let progressed = false;
    let chunk = CHUNK_BYTES;

    while (offset < file.size) {
      const bytes = new Uint8Array(await blob.slice(offset, Math.min(file.size, offset + chunk)).arrayBuffer());
      const usable = bytes.lastIndexOf(NEWLINE) + 1;
      if (usable === 0) {
        // No complete line yet: either a huge line (read more) or one still being written.
        if (offset + chunk >= file.size) break;
        chunk *= 2;
        continue;
      }
      chunk = CHUNK_BYTES;
      const messages: ParsedMessage[] = [];
      let lineNo = 0;
      for (const line of decoder.decode(bytes.subarray(0, usable)).split("\n")) {
        lineNo++;
        if (line) messages.push(...adapter.applyLine(state, line, `${file.sessionId}:${offset}:${lineNo}`));
      }
      offset += usable;
      projectId = this.store.saveChunk({
        sessionId: file.sessionId,
        tool: adapter.tool,
        file: { path: file.path, offset, size: file.size, mtime: file.mtime },
        state,
        messages,
      });
      progressed = true;
    }
    return progressed ? { projectId, sessionId: file.sessionId } : undefined;
  }
}
