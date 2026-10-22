import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { EmbedderStatus } from "@igrek/core";
import type { Hono } from "hono";
import { downloadModel } from "./embedder";

/**
 * Speak instead of typing, recognised on this computer (plan.md 11): OpenAI's Whisper (MIT), the
 * small "base" model in ONNX form, run with ONNX Runtime like the library's search model. Browsers'
 * own speech recognition sends the voice to Google and does not work at all in Brave or Chromium on
 * Linux; this needs neither. The model (about 76 MB) is downloaded once, when the user asks.
 */
const SPEECH_MODEL = {
  id: "onnx-community/whisper-base",
  files: [
    "tokenizer.json",
    "tokenizer_config.json",
    "generation_config.json",
    "config.json",
    "onnx/encoder_model_quantized.onnx",
    // The decoder with its key/value cache: each new word costs one step, not the whole sentence again.
    "onnx/decoder_model_merged_quantized.onnx",
  ],
  sizeMb: 77,
};

const SAMPLE_RATE = 16_000;
const N_FFT = 400;
const HOP = 160;
const N_MELS = 80;
/** Whisper hears 30 seconds at a time. */
const SAMPLES = 30 * SAMPLE_RATE;
const FRAMES = SAMPLES / HOP;
const MAX_TOKENS = 200;

// ---- the log-mel spectrogram Whisper was trained on (openai/whisper audio.py) ---------------

const melOf = (hz: number) => (hz < 1000 ? (3 * hz) / 200 : 15 + Math.log(hz / 1000) / (Math.log(6.4) / 27));
const hzOf = (mel: number) => (mel < 15 ? (200 * mel) / 3 : 1000 * Math.exp((Math.log(6.4) / 27) * (mel - 15)));

/** Slaney-style mel filters (librosa's default, which Whisper uses), N_MELS rows by N_FFT/2+1 bins. */
function melFilters(): Float32Array[] {
  const bins = N_FFT / 2 + 1;
  const freqs = Array.from({ length: bins }, (_, i) => (i * SAMPLE_RATE) / 2 / (bins - 1));
  const top = melOf(SAMPLE_RATE / 2);
  const points = Array.from({ length: N_MELS + 2 }, (_, i) => hzOf((i * top) / (N_MELS + 1)));
  return Array.from({ length: N_MELS }, (_, m) => {
    const row = new Float32Array(bins);
    const lowWidth = (points[m + 1] ?? 0) - (points[m] ?? 0);
    const highWidth = (points[m + 2] ?? 0) - (points[m + 1] ?? 0);
    const norm = 2 / ((points[m + 2] ?? 0) - (points[m] ?? 0));
    for (let k = 0; k < bins; k++) {
      const rising = ((freqs[k] ?? 0) - (points[m] ?? 0)) / lowWidth;
      const falling = ((points[m + 2] ?? 0) - (freqs[k] ?? 0)) / highWidth;
      row[k] = Math.max(0, Math.min(rising, falling)) * norm;
    }
    return row;
  });
}

let tables: { cos: Float32Array; sin: Float32Array; window: Float32Array; filters: Float32Array[] } | undefined;
function dsp() {
  if (!tables) {
    const bins = N_FFT / 2 + 1;
    const cos = new Float32Array(bins * N_FFT);
    const sin = new Float32Array(bins * N_FFT);
    for (let k = 0; k < bins; k++)
      for (let n = 0; n < N_FFT; n++) {
        cos[k * N_FFT + n] = Math.cos((2 * Math.PI * k * n) / N_FFT);
        sin[k * N_FFT + n] = Math.sin((2 * Math.PI * k * n) / N_FFT);
      }
    // A periodic Hann window, as torch.hann_window gives.
    const window = Float32Array.from({ length: N_FFT }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N_FFT));
    tables = { cos, sin, window, filters: melFilters() };
  }
  return tables;
}

/** One windowed frame of the padded audio; false when it is all silence. */
function readFrame(audio: Float32Array, f: number, window: Float32Array, frame: Float32Array): boolean {
  // Centred frames: the signal reflected by half a window at both ends (torch.stft center=True).
  const start = f * HOP - N_FFT / 2;
  let sound = false;
  for (let n = 0; n < N_FFT; n++) {
    const i = start + n;
    const v = (audio[i < 0 ? -i : i >= SAMPLES ? 2 * SAMPLES - i - 2 : i] ?? 0) * (window[n] ?? 0);
    frame[n] = v;
    if (v !== 0) sound = true;
  }
  return sound;
}

/** The power of each frequency bin of one frame (a plain DFT: N_FFT = 400 is not a power of two). */
function framePower(frame: Float32Array, power: Float32Array): void {
  const { cos, sin } = dsp();
  for (let k = 0; k < power.length; k++) {
    let re = 0;
    let im = 0;
    const base = k * N_FFT;
    for (let n = 0; n < N_FFT; n++) {
      re += (frame[n] ?? 0) * (cos[base + n] ?? 0);
      im -= (frame[n] ?? 0) * (sin[base + n] ?? 0);
    }
    power[k] = re * re + im * im;
  }
}

/** One mel band's log energy from a frame's power. */
function bandLog(row: Float32Array, power: Float32Array): number {
  let sum = 0;
  for (let k = 0; k < power.length; k++) sum += (row[k] ?? 0) * (power[k] ?? 0);
  return Math.log10(Math.max(sum, 1e-10));
}

/** 16 kHz mono samples to Whisper's input: 80 mel bands by 3000 frames, log-scaled and normalised. */
export function logMel(samples: Float32Array): Float32Array {
  const { window, filters } = dsp();
  const audio = new Float32Array(SAMPLES);
  audio.set(samples.subarray(0, SAMPLES));
  const mel = new Float32Array(N_MELS * FRAMES);
  const frame = new Float32Array(N_FFT);
  const power = new Float32Array(N_FFT / 2 + 1);
  // Silence (most of the 30 seconds is padding) is the floor in every band, log10(1e-10).
  let peak = -10;
  for (let f = 0; f < FRAMES; f++) {
    const sound = readFrame(audio, f, window, frame);
    if (sound) framePower(frame, power);
    for (let m = 0; m < N_MELS; m++) {
      const value = sound ? bandLog(filters[m] as Float32Array, power) : -10;
      mel[m * FRAMES + f] = value;
      peak = Math.max(peak, value);
    }
  }
  for (let i = 0; i < mel.length; i++) mel[i] = (Math.max(mel[i] ?? 0, peak - 8) + 4) / 4;
  return mel;
}

// ---- the model -----------------------------------------------------------------------------

type Tensor = { dims: readonly number[]; data: Float32Array | BigInt64Array };
type Session = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, Tensor>>;
};
type Ort = { Tensor: new (type: string, data: unknown, dims: number[]) => unknown; InferenceSession: unknown };
type Loaded = {
  ort: Ort;
  encoder: Session;
  decoder: Session;
  decode: (ids: number[]) => string;
  /** Decoder layers, heads and width, for the empty cache of the first step. */
  shape: { layers: number; heads: number; headDim: number };
  config: {
    decoder_start_token_id: number;
    eos_token_id: number;
    no_timestamps_token_id: number;
    lang_to_id: Record<string, number>;
    task_to_id: Record<string, number>;
    suppress_tokens: number[];
    begin_suppress_tokens: number[];
  };
};

export class Speech {
  private state: EmbedderStatus["state"];
  private progress = 0;
  private error?: string;
  private downloading?: Promise<void>;
  private loaded?: Promise<Loaded>;
  /** The model is let go after a few idle minutes, so it does not sit in memory on a small computer. */
  private idleTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly dir: string,
    private readonly onChange: () => void = () => undefined,
  ) {
    this.state = SPEECH_MODEL.files.every((f) => existsSync(join(dir, f)) && statSync(join(dir, f)).size > 0)
      ? "ready"
      : "missing";
  }

  status(): EmbedderStatus {
    return {
      state: this.state,
      ...(this.state === "downloading" ? { progress: this.progress } : {}),
      ...(this.error ? { error: this.error } : {}),
      model: SPEECH_MODEL.id,
      sizeMb: SPEECH_MODEL.sizeMb,
    };
  }

  download(): Promise<void> {
    if (this.state === "ready") return Promise.resolve();
    if (this.downloading !== undefined) return this.downloading;
    this.state = "downloading";
    this.progress = 0;
    this.error = undefined;
    this.onChange();
    this.downloading = downloadModel(SPEECH_MODEL, this.dir, (p) => {
      this.progress = p;
      this.onChange();
    })
      .then(() => {
        this.state = "ready";
      })
      .catch((err: Error) => {
        this.state = "failed";
        this.error = err.message;
      })
      .finally(() => {
        this.downloading = undefined;
        this.onChange();
      });
    return this.downloading;
  }

  private load(): Promise<Loaded> {
    this.loaded ??= (async () => {
      const ort = (await import("onnxruntime-node")) as unknown as Ort & {
        InferenceSession: { create: (path: string) => Promise<Session> };
      };
      const { Tokenizer } = await import("@huggingface/tokenizers");
      const tokenizer = new Tokenizer(
        await Bun.file(join(this.dir, "tokenizer.json")).json(),
        await Bun.file(join(this.dir, "tokenizer_config.json")).json(),
      ) as unknown as { decode: (ids: number[], o: { skip_special_tokens: boolean }) => string };
      return {
        ort,
        encoder: await ort.InferenceSession.create(join(this.dir, "onnx/encoder_model_quantized.onnx")),
        decoder: await ort.InferenceSession.create(join(this.dir, "onnx/decoder_model_merged_quantized.onnx")),
        decode: (ids) => tokenizer.decode(ids, { skip_special_tokens: true }),
        shape: await Bun.file(join(this.dir, "config.json"))
          .json()
          .then((c: { decoder_layers: number; decoder_attention_heads: number; d_model: number }) => ({
            layers: c.decoder_layers,
            heads: c.decoder_attention_heads,
            headDim: c.d_model / c.decoder_attention_heads,
          })),
        config: await Bun.file(join(this.dir, "generation_config.json")).json(),
      };
    })();
    return this.loaded;
  }

  /** 16 kHz mono samples (up to 30 seconds) to text, in the given language ("tr", "en"...). */
  async transcribe(samples: Float32Array, language = "en"): Promise<string> {
    if (this.state !== "ready") throw new Error("Download the speech model first");
    clearTimeout(this.idleTimer);
    try {
      const model = await this.load();
      const { ort, encoder, config } = model;
      const features = new ort.Tensor("float32", logMel(samples), [1, N_MELS, FRAMES]);
      const encoded = await encoder.run({ [encoder.inputNames[0] ?? "input_features"]: features });
      const hidden = encoded[encoder.outputNames[0] ?? "last_hidden_state"] as Tensor;
      const lang = config.lang_to_id[`<|${language}|>`] ?? config.lang_to_id["<|en|>"];
      const prompt = [config.decoder_start_token_id, ...(lang ? [lang] : []), config.task_to_id.transcribe ?? 50359];
      return model.decode(await greedy(model, hidden, [...prompt, config.no_timestamps_token_id])).trim();
    } finally {
      this.idleTimer = setTimeout(() => {
        this.loaded = undefined;
      }, 5 * 60_000);
    }
  }
}

/** The decoder's cache, empty: the first step reads the whole prompt; each later one only the newest token. */
function emptyCache({ ort, shape }: Loaded): Record<string, unknown> {
  const empty = new ort.Tensor("float32", new Float32Array(0), [1, shape.heads, 0, shape.headDim]);
  const past: Record<string, unknown> = {};
  for (let l = 0; l < shape.layers; l++)
    for (const part of ["decoder", "encoder"])
      for (const kv of ["key", "value"]) past[`past_key_values.${l}.${part}.${kv}`] = empty;
  return past;
}

/** The cache for the next step: the decoder's own part grows; the encoder's is made once, at the first step. */
function nextCache(layers: number, out: Record<string, unknown>, past: Record<string, unknown>, first: boolean) {
  const next: Record<string, unknown> = {};
  for (let l = 0; l < layers; l++)
    for (const kv of ["key", "value"]) {
      next[`past_key_values.${l}.decoder.${kv}`] = out[`present.${l}.decoder.${kv}`];
      next[`past_key_values.${l}.encoder.${kv}`] = first
        ? out[`present.${l}.encoder.${kv}`]
        : past[`past_key_values.${l}.encoder.${kv}`];
    }
  return next;
}

/** The likeliest next token, leaving out timestamps (turned off) and what Whisper's config holds back. */
function likeliest(scores: Float32Array, config: Loaded["config"], suppress: Set<number>, first: boolean): number {
  let best = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let v = 0; v < scores.length; v++) {
    if (v > config.no_timestamps_token_id || suppress.has(v)) continue;
    if (first && config.begin_suppress_tokens.includes(v)) continue;
    if ((scores[v] ?? Number.NEGATIVE_INFINITY) > bestScore) {
      bestScore = scores[v] ?? bestScore;
      best = v;
    }
  }
  return best;
}

/** Greedy decoding from the prompt: one token at a time until the end token; returns the words' tokens. */
async function greedy(model: Loaded, hidden: Tensor, prompt: number[]): Promise<number[]> {
  const { ort, decoder, config, shape } = model;
  const tokens = [...prompt];
  const suppress = new Set(config.suppress_tokens);
  let past = emptyCache(model);
  for (let step = 0; step < MAX_TOKENS; step++) {
    const fed = step === 0 ? tokens : tokens.slice(-1);
    const out = await decoder.run({
      input_ids: new ort.Tensor("int64", BigInt64Array.from(fed.map(BigInt)), [1, fed.length]),
      encoder_hidden_states: hidden,
      use_cache_branch: new ort.Tensor("bool", [step > 0], [1]),
      ...past,
    });
    past = nextCache(shape.layers, out, past, step === 0);
    const logits = out.logits as Tensor;
    const vocab = logits.dims[2] ?? 0;
    const last = (logits.data as Float32Array).subarray((fed.length - 1) * vocab, fed.length * vocab);
    const best = likeliest(last, config, suppress, step === 0);
    if (best < 0 || best === config.eos_token_id) break;
    tokens.push(best);
    // A model stuck on one token repeats it forever; stop there.
    if (tokens.length > 12 && tokens.slice(-8).every((t) => t === best)) break;
  }
  return tokens.slice(prompt.length);
}

/** Speech from the chat's microphone button: the model's state, its download, and one recording to text. */
export function registerSpeechRoutes(app: Hono, speech: Speech): void {
  app.get("/api/speech", (c) => c.json(speech.status()));
  app.post("/api/speech/download", (c) => {
    void speech.download();
    return c.json(speech.status());
  });
  app.post("/api/speech", async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    // Raw 32-bit float samples at 16 kHz, mono; at most 30 seconds.
    if (bytes.length < 4 || bytes.length % 4 !== 0 || bytes.length > SAMPLES * 4)
      return c.json({ error: "Send up to 30 seconds of 16 kHz mono audio" }, 400);
    try {
      const samples = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
      return c.json({ text: await speech.transcribe(samples, c.req.query("lang") ?? "en") });
    } catch (err) {
      return c.json({ error: (err as Error).message }, 409);
    }
  });
}
