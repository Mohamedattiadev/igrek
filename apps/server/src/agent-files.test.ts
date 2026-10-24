import { describe, expect, test } from "bun:test";
import { compareAgentFiles, joinAgentFiles } from "./agent-files";

const CLAUDE = "# Rules\n\n- Use bun, not npm.\n- Tests next to the code.\n";
const AGENTS = "# Working here\n\n- Tests next to the code.\n- No emoji.\n";

describe("one memory for every agent", () => {
  test("says which file each rule is in", () => {
    expect(compareAgentFiles()).toEqual({ state: "none", onlyClaude: [], onlyAgents: [] });
    expect(compareAgentFiles(CLAUDE).state).toBe("claudeOnly");
    expect(compareAgentFiles(undefined, AGENTS).state).toBe("agentsOnly");
    expect(compareAgentFiles(CLAUDE, AGENTS)).toEqual({
      state: "apart",
      onlyClaude: ["- Use bun, not npm."],
      onlyAgents: ["- No emoji."],
    });
    expect(compareAgentFiles("@AGENTS.md\n", AGENTS).state).toBe("joined");
  });

  test("joining keeps every rule in AGENTS.md and leaves CLAUDE.md pointing to it", () => {
    const out = joinAgentFiles(CLAUDE, AGENTS);
    expect(out.claude).toBe("@AGENTS.md\n");
    expect(out.agents).toContain("- No emoji.");
    expect(out.agents).toContain("## From CLAUDE.md");
    expect(out.agents).toContain("- Use bun, not npm.");
    // A rule both had is written once.
    expect(out.agents.split("- Tests next to the code.").length).toBe(2);
    expect(compareAgentFiles(out.claude, out.agents).state).toBe("joined");
  });

  test("only CLAUDE.md: its text becomes AGENTS.md", () => {
    const out = joinAgentFiles(CLAUDE, undefined);
    expect(out.agents).toBe(`${CLAUDE.trim()}\n`);
    expect(out.claude).toBe("@AGENTS.md\n");
  });

  test("a CLAUDE.md that already imports AGENTS.md and adds rules is not called joined", () => {
    const both = "@AGENTS.md\n\n- Claude only: use plan mode first.\n";
    expect(compareAgentFiles(both, AGENTS)).toMatchObject({
      state: "apart",
      onlyClaude: ["- Claude only: use plan mode first."],
    });
    expect(joinAgentFiles(both, AGENTS).agents).toContain("- Claude only: use plan mode first.");
  });
});
