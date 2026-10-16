import { APP_VERSION } from "@godeye/core";
import { loadConfig } from "./config";
import { checkTools } from "./system";

const HELP: Record<string, string> = {
  git: "Needed to track your projects. Install it from https://git-scm.com",
  claude: "Install Claude Code to use Claude: https://claude.com/claude-code",
  codex: "Install Codex CLI to use Codex: npm install -g @openai/codex",
  gemini: "Install Gemini CLI to use Gemini: npm install -g @google/gemini-cli",
  ssh: "Needed to work on your servers. Install OpenSSH client",
  docker: "Optional. Lets God Eye manage your containers",
};

async function doctor(): Promise<number> {
  const config = loadConfig();
  console.log(`\nGod Eye ${APP_VERSION} — health check\n`);
  console.log(`   Data folder: ${config.dataDir}`);
  console.log(`   Address:     http://localhost:${config.port}\n`);

  let problems = 0;
  for (const tool of await checkTools()) {
    if (tool.found) {
      console.log(`   [ok]   ${tool.id.padEnd(7)} ${tool.version ?? ""}`);
    } else {
      if (tool.required) problems++;
      const mark = tool.required ? "[fail]" : "[--]  ";
      console.log(`   ${mark} ${tool.id.padEnd(7)} not found — ${HELP[tool.id]}`);
    }
  }
  const aiTools = (await checkTools()).filter((t) => ["claude", "codex", "gemini"].includes(t.id) && t.found);
  if (aiTools.length === 0) {
    problems++;
    console.log("\n   [fail] No AI tool found. Install at least one (Claude Code, Codex or Gemini).");
  }
  console.log(problems === 0 ? "\n   Everything looks good.\n" : `\n   ${problems} thing(s) need attention.\n`);
  return problems === 0 ? 0 : 1;
}

const command = process.argv[2];
if (command === "doctor") {
  process.exit(await doctor());
} else {
  console.log("Usage: godeye doctor");
  process.exit(command ? 1 : 0);
}
