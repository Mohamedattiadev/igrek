/** Calls back with each non-empty line of a byte stream, as the bytes arrive. */
export async function readLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (line) onLine(line);
    }
  }
}

/** Claude Code's stream-json output: each line one JSON object; a line that is not JSON is skipped. */
export function readJsonLines(
  stream: ReadableStream<Uint8Array>,
  onMessage: (message: Record<string, unknown>) => void,
): Promise<void> {
  return readLines(stream, (line) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    onMessage(message);
  });
}
