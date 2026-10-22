import type { Database } from "bun:sqlite";
import type { ChatTodo } from "@igrek/core";

const MAX_TEXT = 300;
/** A list is meant to stay small: what this chat is doing, not a project backlog. */
const MAX_ITEMS = 50;

type Row = { id: string; text: string; done: number; created_at: number; done_at: number | null };

const toTodo = (r: Row): ChatTodo => ({
  id: r.id,
  text: r.text,
  done: r.done === 1,
  createdAt: r.created_at,
  ...(r.done_at ? { doneAt: r.done_at } : {}),
});

/** A chat's own to-do list: what is done and what is left, kept with the conversation. */
export class ChatTodos {
  constructor(private readonly db: Database) {}

  list(key: string): ChatTodo[] {
    return (
      this.db
        .query("SELECT id, text, done, created_at, done_at FROM chat_todos WHERE chat_key = ? ORDER BY created_at")
        .all(key) as Row[]
    ).map(toTodo);
  }

  add(key: string, text: string, now = Date.now()): ChatTodo[] {
    const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (!clean) throw new Error("Write what is to be done");
    if (this.list(key).length >= MAX_ITEMS) throw new Error(`A chat's list holds at most ${MAX_ITEMS} items`);
    this.db
      .query("INSERT INTO chat_todos (id, chat_key, text, done, created_at) VALUES (?, ?, ?, 0, ?)")
      .run(crypto.randomUUID(), key, clean, now);
    return this.list(key);
  }

  update(key: string, id: string, patch: { done?: boolean; text?: string }, now = Date.now()): ChatTodo[] {
    const text = patch.text?.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    // Ticking off and renaming together is one change: both happen or neither does.
    this.db.transaction(() => {
      if (patch.done !== undefined)
        this.db
          .query("UPDATE chat_todos SET done = ?, done_at = ? WHERE id = ? AND chat_key = ?")
          .run(patch.done ? 1 : 0, patch.done ? now : null, id, key);
      if (text) this.db.query("UPDATE chat_todos SET text = ? WHERE id = ? AND chat_key = ?").run(text, id, key);
    })();
    return this.list(key);
  }

  remove(key: string, id: string): ChatTodo[] {
    this.db.query("DELETE FROM chat_todos WHERE id = ? AND chat_key = ?").run(id, key);
    return this.list(key);
  }

  /**
   * The AI wrote its plan (Claude Code's TodoWrite): its steps join the chat's list and are ticked off
   * as the AI finishes them. The user's own items stay as they are; a step is matched by its text.
   */
  fromPlan(key: string, plan: { content: string; status: string }[], now = Date.now()): ChatTodo[] {
    this.db.transaction(() => {
      const have = new Map(this.list(key).map((todo) => [todo.text.toLowerCase(), todo]));
      for (const step of plan) this.planStep(key, step, have, now);
    })();
    return this.list(key);
  }

  /** One plan step (inside fromPlan's transaction): ticked as the AI says, or added when it is new and there is room. */
  private planStep(key: string, step: { content: string; status: string }, have: Map<string, ChatTodo>, now: number) {
    const text = step.content.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    const done = step.status === "completed";
    const existing = have.get(text.toLowerCase());
    if (existing) {
      if (existing.done !== done) this.tick(key, existing.id, done, now);
    } else if (text && have.size < MAX_ITEMS) have.set(text.toLowerCase(), this.insert(key, text, done, now));
  }

  private tick(key: string, id: string, done: boolean, now: number): void {
    this.db
      .query("UPDATE chat_todos SET done = ?, done_at = ? WHERE id = ? AND chat_key = ?")
      .run(done ? 1 : 0, done ? now : null, id, key);
  }

  private insert(key: string, text: string, done: boolean, now: number): ChatTodo {
    const id = crypto.randomUUID();
    this.db
      .query("INSERT INTO chat_todos (id, chat_key, text, done, created_at, done_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, key, text, done ? 1 : 0, now, done ? now : null);
    return { id, text, done, createdAt: now };
  }

  /** The chat got its session id: the items written before move to it. */
  adopt(from: string, to: string): void {
    this.db.query("UPDATE chat_todos SET chat_key = ? WHERE chat_key = ?").run(to, from);
  }
}
