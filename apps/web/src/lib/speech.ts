/**
 * Speech to text on this computer (apps/server/src/speech.ts, Whisper): shared by the microphone
 * button and by voice messages in the team chat. Whisper hears 30 seconds at a time, so a longer
 * recording is sent in 30-second parts and the texts are joined.
 */

const RATE = 16_000;
const PART = 30 * RATE;

/** A recording (any format the browser made) as 16 kHz mono samples, the way Whisper wants them. */
async function toSamples(blob: Blob): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** The text of a recording, in parts of 30 seconds; `onPart` says how far it got. */
export async function transcribe(
  blob: Blob,
  language: string,
  onPart?: (done: number, of: number) => void,
): Promise<string> {
  const samples = await toSamples(blob);
  const parts = Math.max(1, Math.ceil(samples.length / PART));
  const texts: string[] = [];
  for (let i = 0; i < parts; i++) {
    onPart?.(i, parts);
    const res = await fetch(`/api/speech?lang=${encodeURIComponent(language)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/octet-stream" },
      body: samples.slice(i * PART, (i + 1) * PART).buffer,
    });
    const body = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) throw new Error(body.error ?? "Speech could not be recognised");
    if (body.text?.trim()) texts.push(body.text.trim());
  }
  return texts.join(" ");
}

/** Why recording cannot work in this window, if it cannot (the button stays and says so). */
export function recordingProblem(): "voice.noRecorder" | "voice.noMic" | undefined {
  if (typeof MediaRecorder === "undefined") return "voice.noRecorder";
  if (!navigator.mediaDevices?.getUserMedia) return "voice.noMic";
  return undefined;
}
