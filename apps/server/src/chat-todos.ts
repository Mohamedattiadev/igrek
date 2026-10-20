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

  /** The chat got its session id: the items written before move to it. */
  adopt(from: string, to: string): void {
    this.db.query("UPDATE chat_todos SET chat_key = ? WHERE chat_key = ?").run(to, from);
  }
}
