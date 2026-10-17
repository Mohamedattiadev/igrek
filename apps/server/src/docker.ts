import type { DockerContainer, DockerHost } from "@godeye/core";
import type { Servers } from "./servers";

/** Container names and ids as Docker makes them; nothing that could change the shell command. */
export function validContainer(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(name);
}

const PS_FORMAT = "{{json .}}";

interface PsRow {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Labels: string;
  CreatedAt: string;
}

interface StatsRow {
  ID: string;
  Name: string;
  CPUPerc: string;
  MemUsage: string;
  MemPerc: string;
}

function jsonLines<T>(text: string): T[] {
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      out.push(JSON.parse(trimmed) as T);
    } catch {
      // A warning line between the JSON lines.
    }
  }
  return out;
}

function label(labels: string, key: string): string | undefined {
  for (const part of labels.split(",")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq) === key) return part.slice(eq + 1);
  }
  return undefined;
}

export function parseContainers(ps: string, stats: string): DockerContainer[] {
  const usage = new Map(jsonLines<StatsRow>(stats).map((s) => [s.ID.slice(0, 12), s]));
  return jsonLines<PsRow>(ps).map((row) => {
    const s = usage.get(row.ID.slice(0, 12));
    const project = label(row.Labels ?? "", "com.docker.compose.project");
    const service = label(row.Labels ?? "", "com.docker.compose.service");
    return {
      id: row.ID.slice(0, 12),
      name: row.Names,
      image: row.Image,
      state: row.State,
      status: row.Status,
      ports: row.Ports,
      ...(project ? { project } : {}),
      ...(service ? { service } : {}),
      createdAt: row.CreatedAt,
      ...(s ? { cpu: s.CPUPerc, mem: s.MemUsage, memPercent: s.MemPerc } : {}),
    };
  });
}

type Action = "restart" | "stop" | "start";

/**
 * Docker manager (plan.md 12): containers, logs, restart and resource use, on this computer or
 * on a server (over the same SSH connection as the Servers page). Looking is free; restart, stop
 * and start are your click, and on a server they go through the audit log like any command.
 */
export class Docker {
  constructor(
    private readonly servers: Servers,
    private readonly local: (args: string[]) => Promise<{ code: number; output: string }> = runLocal,
  ) {}

  private async read(host: DockerHost, args: string[], reason: string): Promise<string> {
    if (host.kind === "local") {
      const r = await this.local(args);
      if (r.code !== 0) throw new Error(dockerError(r.output));
      return r.output;
    }
    const r = await this.servers.inspect(host.serverId, `docker ${args.join(" ")}`, reason);
    if (r.code !== 0) throw new Error(dockerError(r.output));
    return r.output;
  }

  async containers(host: DockerHost): Promise<DockerContainer[]> {
    const [ps, stats] = await Promise.all([
      this.read(host, ["ps", "-a", "--no-trunc", "--format", `'${PS_FORMAT}'`], "Docker: list containers"),
      // Resource use only exists for running containers; an error here just leaves it out.
      this.read(host, ["stats", "--no-stream", "--format", `'${PS_FORMAT}'`], "Docker: resource use").catch(() => ""),
    ]);
    return parseContainers(ps, stats).sort((a, b) =>
      a.state === b.state ? a.name.localeCompare(b.name) : a.state === "running" ? -1 : 1,
    );
  }

  async logs(host: DockerHost, container: string, tail = 300): Promise<string> {
    if (!validContainer(container)) throw new Error("Unknown container");
    const lines = Math.min(5000, Math.max(10, Math.round(tail)));
    return this.read(
      host,
      ["logs", "--timestamps", "--tail", String(lines), container, "2>&1"],
      `Docker: logs of ${container}`,
    );
  }

  async act(host: DockerHost, container: string, action: Action): Promise<string> {
    if (!validContainer(container)) throw new Error("Unknown container");
    if (!["restart", "stop", "start"].includes(action)) throw new Error("Unknown action");
    if (host.kind === "local") {
      const r = await this.local([action, container]);
      if (r.code !== 0) throw new Error(dockerError(r.output));
      return r.output;
    }
    // The user's click is the one confirmation a "change" command needs; it is in the audit log.
    const run = await this.servers.run(host.serverId, `docker ${action} ${container}`, {
      confirmations: 1,
      actor: "user",
      reason: `Docker: ${action} ${container}`,
    });
    if (run.exitCode !== 0) throw new Error(dockerError(run.output ?? ""));
    return run.output ?? "";
  }
}

function dockerError(output: string): string {
  if (/permission denied.*docker\.sock/i.test(output))
    return "No permission to use Docker (add your user to the docker group)";
  if (/command not found|not found: docker|No such file/i.test(output)) return "Docker is not installed here";
  if (/Cannot connect to the Docker daemon/i.test(output)) return "Docker is not running";
  return output.trim().split("\n").slice(-3).join(" ").slice(0, 300) || "Docker failed";
}

async function runLocal(args: string[]): Promise<{ code: number; output: string }> {
  try {
    // Quotes in the format argument are for the remote shell; locally there is no shell.
    const clean = args.filter((a) => a !== "2>&1").map((a) => a.replace(/^'(.*)'$/, "$1"));
    const proc = Bun.spawn(["docker", ...clean], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), 60_000);
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    return { code, output: `${out}${err}`.slice(-400_000) };
  } catch (err) {
    return { code: 127, output: (err as Error).message };
  }
}
