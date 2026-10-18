/**
 * One entry point for the single-file hub binary (docker/Dockerfile.hub):
 *
 *   igrek-hub                     run the hub
 *   igrek-hub health              exit 0 when the local hub answers (Docker health check)
 *   igrek-hub create-admin <name> | reset-password <name> | backup [folder] | restore <file.geb>
 */
const command = process.argv[2];
if (!command || command === "serve") {
  await import("./index");
} else if (command === "health") {
  const port = process.env.HUB_PORT ?? "7700";
  const ok = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2500) })
    .then((r) => r.ok)
    .catch(() => false);
  process.exit(ok ? 0 : 1);
} else {
  await import("./cli");
}

export {};
