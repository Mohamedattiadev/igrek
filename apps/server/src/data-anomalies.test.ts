import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import type { DbConnection, DbTable } from "@igrek/core";
import { type AnomalySource, scanAnomalies } from "./data-anomalies";

function source(prod = false): AnomalySource {
  const db = new Database(":memory:");
  db.run(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, name TEXT, city TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), price REAL, note TEXT);`);
  const cities = ["Istanbul", "İstanbul", "istanbul ", "Ankara", "Izmir"];
  for (let i = 1; i <= 30; i++)
    db.run("INSERT INTO users VALUES (?, ?, ?, ?)", [
      i,
      i <= 2 ? "a@x.io" : `u${i}@x.io`,
      i === 7 ? null : `U${i}`,
      cities[i % 5] ?? null,
    ]);
  db.run("INSERT INTO orders VALUES (1, 1, 10, NULL), (2, 99, 5, NULL), (3, 2, -4, NULL)");
  const tables: DbTable[] = [
    {
      name: "users",
      kind: "table",
      rows: 30,
      columns: [
        { name: "id", type: "INTEGER", nullable: false, primary: true },
        { name: "email", type: "TEXT", nullable: true, primary: false },
        { name: "name", type: "TEXT", nullable: true, primary: false },
        { name: "city", type: "TEXT", nullable: true, primary: false },
      ],
    },
    {
      name: "orders",
      kind: "table",
      rows: 3,
      columns: [
        { name: "id", type: "INTEGER", nullable: false, primary: true },
        { name: "user_id", type: "INTEGER", nullable: true, primary: false, references: "users.id" },
        { name: "price", type: "REAL", nullable: true, primary: false },
        { name: "note", type: "TEXT", nullable: true, primary: false },
      ],
    },
  ];
  return {
    get: () => ({ id: "d1", kind: "sqlite", prod }) as DbConnection,
    tables: async () => tables,
    query: async (_id, text) => {
      const rows = db.query(text).values() as unknown[][];
      return { columns: [], rows, truncated: false, ms: 0 };
    },
  };
}

describe("data anomalies", () => {
  test("finds orphans, repeated unique values, rare NULLs and negative prices", async () => {
    const found = await scanAnomalies(source(), "d1");
    const summary = found.map((a) => `${a.kind} ${a.table}.${a.column} ${a.count}`).sort();
    expect(summary).toEqual([
      "duplicate users.email 1",
      "inconsistent users.city 1",
      "negative orders.price 1",
      "orphan orders.user_id 1",
      "unexpectedNull users.name 1",
    ]);
    // Every anomaly comes with a query that lists its rows.
    const orphan = found.find((a) => a.kind === "orphan");
    expect(orphan?.target).toBe("users.id");
  });

  test("a production database needs a confirmation first", async () => {
    await expect(scanAnomalies(source(true), "d1")).rejects.toThrow("production");
    expect((await scanAnomalies(source(true), "d1", { confirmProd: true })).length).toBe(5);
  });
});

describe("inconsistent values", () => {
  test("values that differ only in case, spaces or accents are grouped", async () => {
    const { variantGroups } = await import("./data-anomalies");
    expect(
      variantGroups(["Istanbul", "İstanbul", "istanbul ", "Ankara", "in_progress", "In progress", "done"]),
    ).toEqual([
      ["Istanbul", "İstanbul", "istanbul "],
      ["in_progress", "In progress"],
    ]);
  });
});
