import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "./db";
import { EnvFiles } from "./envfiles";
import { Sealer } from "./seal";
import { Store } from "./store";
import { Vault } from "./vault";

describe("vault", () => {
  test("keys from every project, once each; same values found by hash; rotation and reveal", async () => {
    const data = mkdtempSync(join(tmpdir(), "igrek-vault-"));
    const parent = mkdtempSync(join(tmpdir(), "igrek-parent-"));
    const shop = join(parent, "shop");
    const blog = join(parent, "blog");
    mkdirSync(shop);
    mkdirSync(blog);
    writeFileSync(
      join(shop, ".env"),
      "STRIPE_SECRET_KEY=sk_test_same\nPORT=3000\nDATABASE_URL=postgres://a:b@h/shop\n",
    );
    writeFileSync(join(blog, ".env"), "STRIPE_SECRET_KEY=sk_test_same\n");
    writeFileSync(join(blog, ".env.example"), "STRIPE_SECRET_KEY=\n");
    const { sqlite } = openDb(":memory:");
    const store = new Store(sqlite);
    store.addProject(parent); // a folder that holds both projects
    const shopId = store.addProject(shop);
    store.addProject(blog);
    let now = Date.now();
    const vault = new Vault(sqlite, store, new EnvFiles(join(data, "env-backups")), new Sealer(data), () => now);
    const list = vault.list();
    expect(list.map((e) => `${e.name}:${e.file}`).sort()).toEqual([
      "DATABASE_URL:.env",
      "STRIPE_SECRET_KEY:.env",
      "STRIPE_SECRET_KEY:.env",
    ]);
    expect(list.find((e) => e.projectId === shopId && e.name === "STRIPE_SECRET_KEY")?.sameAs).toBe(1);
    expect(JSON.stringify(list)).not.toContain("sk_test_same");
    const ref = list.find((e) => e.projectId === shopId && e.name === "STRIPE_SECRET_KEY")?.ref ?? "";
    expect(await vault.reveal(ref)).toBe("sk_test_same");
    vault.setRotation(ref, 30);
    now += 31 * 86_400_000;
    expect(vault.list().find((e) => e.ref === ref)?.due).toBe(true);
    expect(vault.notices().map((n) => n.kind)).toEqual(["rotate"]);
    // Changing the value in the file resets the clock by itself.
    writeFileSync(join(shop, ".env"), "STRIPE_SECRET_KEY=sk_test_new\n");
    expect(vault.list().find((e) => e.ref === ref)).toMatchObject({ due: false, sameAs: 0 });
    const id = await vault.addItem({ name: "RECOVERY_CODE", value: "abc-123" });
    expect(sqlite.query("SELECT value FROM vault_items").get()).not.toEqual({ value: "abc-123" });
    expect(await vault.reveal(`item:${id}`)).toBe("abc-123");
  });
});
