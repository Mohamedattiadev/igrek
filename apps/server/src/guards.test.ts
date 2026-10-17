import { describe, expect, test } from "bun:test";
import { guardFor, readsOutside } from "./guards";

const bash = (command: string) => ({ command });

describe("agent guards", () => {
  test("shipping commands always need a person", () => {
    for (const cmd of [
      "git push origin main",
      "cd app && git push",
      "git merge feature",
      "gh pr merge 12 --squash",
      "npm publish",
      "bun publish --access public",
      "docker push me/app:1",
      "vercel deploy --prod",
      "fly deploy",
      "kubectl apply -f k8s/",
      "terraform apply -auto-approve",
      "rsync -a dist/ deploy@1.2.3.4:/srv/app",
    ])
      expect(guardFor("Bash", bash(cmd), false)).toBe("ship");
  });

  test("ordinary work is not held up", () => {
    for (const cmd of ["git status", "git commit -m x", "bun test", "npm run build", "rsync -a src/ backup/", "ls -la"])
      expect(guardFor("Bash", bash(cmd), false)).toBeUndefined();
    expect(guardFor("Edit", { file_path: "a.ts" }, false)).toBeUndefined();
  });

  test("after reading the web, risky tools are always asked", () => {
    expect(readsOutside("WebFetch")).toBe(true);
    expect(readsOutside("WebSearch")).toBe(true);
    expect(readsOutside("mcp__browser__navigate")).toBe(true);
    expect(readsOutside("Read")).toBe(false);
    expect(guardFor("Bash", bash("ls"), true)).toBe("external");
    expect(guardFor("Write", { file_path: "x" }, true)).toBe("external");
    expect(guardFor("Read", { file_path: "x" }, true)).toBeUndefined();
  });
});
