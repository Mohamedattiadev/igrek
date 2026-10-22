import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { logMel, registerSpeechRoutes, Speech } from "./speech";

describe("speech on this computer", () => {
  test("silence is Whisper's floor in every band, for all 3000 frames", () => {
    const mel = logMel(new Float32Array(16_000));
    expect(mel.length).toBe(80 * 3000);
    expect(new Set(mel)).toEqual(new Set([(-10 + 4) / 4]));
  });

  test("a tone lands in the mel band of its pitch, and a higher tone in a higher band", () => {
    const tone = (hz: number) =>
      Float32Array.from({ length: 16_000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / 16_000));
    const loudest = (mel: Float32Array) => {
      let best = 0;
      for (let m = 1; m < 80; m++) if ((mel[m * 3000 + 50] ?? 0) > (mel[best * 3000 + 50] ?? 0)) best = m;
      return best;
    };
    const low = loudest(logMel(tone(440)));
    const high = loudest(logMel(tone(3000)));
    expect(low).toBeGreaterThan(5);
    expect(low).toBeLessThan(20);
    expect(high).toBeGreaterThan(low + 20);
  });

  test("without the model it says to download it; a wrong recording is refused", async () => {
    const app = new Hono();
    const speech = new Speech(mkdtempSync(join(tmpdir(), "igrek-speech-")));
    registerSpeechRoutes(app, speech);
    expect(((await (await app.request("/api/speech")).json()) as { state: string }).state).toBe("missing");
    const bad = await app.request("/api/speech", { method: "POST", body: new Uint8Array(3) });
    expect(bad.status).toBe(400);
    const early = await app.request("/api/speech", { method: "POST", body: new Float32Array(16_000).buffer });
    expect(early.status).toBe(409);
  });
});
