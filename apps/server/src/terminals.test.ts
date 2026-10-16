import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { Bus, StopRegistry } from "./bus";
import { cleanEnv } from "./env";
import { handoffPrompt } from "./terminal-routes";
import { Terminals } from "./terminals";

describe("terminals", () => {
  test("runs a real PTY, streams output, replays it on reattach and stops on emergency stop", async () => {
    const stops = new StopRegistry();
    const terminals = new Terminals(new Bus(), stops);
    const info = terminals.start({ projectId: "p", cwd: tmpdir(), tool: "shell", cols: 80, rows: 20 });
    let live = "";
    terminals.attach(info.id, (data) => (live += data));
    terminals.input(info.id, "echo GODEYE_OK\n");
    await Bun.sleep(1500);
    expect(live).toContain("GODEYE_OK");

    let replay = "";
    terminals.attach(info.id, (data) => (replay += data));
    expect(replay).toContain("GODEYE_OK");

    expect(await stops.stopAll()).toBe(1);
    await Bun.sleep(1800);
    expect(terminals.get(info.id)?.status).toBe("exited");
    terminals.stopAll();
  });

  test("refuses folders that don't exist", () => {
    const terminals = new Terminals(new Bus(), new StopRegistry());
    expect(() => terminals.start({ projectId: "p", cwd: "/no/such/folder", tool: "shell" })).toThrow();
    terminals.stopAll();
  });
});

describe("environment for new sessions", () => {
  test("drops Claude Code's own session markers but keeps everything else", () => {
    process.env.CLAUDE_CODE_CHILD_SESSION = "1";
    process.env.CLAUDECODE = "1";
    process.env.CLAUDE_CONFIG_DIR = "/x";
    const env = cleanEnv({ EXTRA: "y" });
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined();
    expect(env.CLAUDECODE).toBeUndefined();
    expect(env.CLAUDE_CONFIG_DIR).toBe("/x");
    expect(env.EXTRA).toBe("y");
  });
});

describe("handoff", () => {
  test("carries what was done and what is open into the new session", () => {
    const prompt = handoffPrompt(
      "Login",
      {
        title: "Login page",
        generatedAt: 0,
        texts: { en: { did: ["form built"], why: "users sign in", left: ["reset password"], risks: [] } },
      },
      "en",
    );
    expect(prompt).toContain("form built");
    expect(prompt).toContain("reset password");
    expect(prompt).toContain("checking the current state");
  });
});
