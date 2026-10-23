/**
 * Entry of the single-file server the desktop app ships (`bun build --compile`, apps/desktop).
 * One file plays every part: with "mcp" or "embed-worker" as the first argument it is that
 * helper (see ownScript in packaged.ts), otherwise it is the server itself. The role is taken out
 * of the arguments, so each part sees the same arguments it gets when run from source.
 */
const role = process.argv[2];
if (role === "mcp" || role === "embed-worker") process.argv.splice(2, 1);

if (role === "mcp") {
  const { serveStdio } = await import("./mcp");
  await serveStdio();
} else if (role === "embed-worker") {
  await import("./embed-worker");
} else {
  await import("./index");
  // The app holds our stdin open for as long as it runs. When it closes, normally or because the app
  // was killed, stop the way Ctrl+C does, so chats, terminals and dev servers are stopped too and
  // nothing is left running behind a closed window. Nothing is ever sent; only the end matters.
  // (Read with "end": with a for-await over Bun.stdin.stream() the server was seen running after
  // the app was killed, once or twice, and that did not happen again this way. Why is not known.)
  process.stdin.once("end", () => process.emit("SIGTERM"));
  process.stdin.resume();
}

// A module, so it may wait at the top level.
export {};
