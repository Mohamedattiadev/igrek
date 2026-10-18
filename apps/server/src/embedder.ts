import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { EmbedderStatus } from "@igrek/core";

/**
 * Local meaning vectors for the library (plan.md 7.1): a small multilingual model that runs on
 * this computer (ONNX Runtime), so Turkish questions find English books. Free, no API. The model
 * is downloaded once from Hugging Face when the user asks for it; until then search uses words only.
 */
export const EMBED_MODEL = {
  id: "Xenova/multilingual-e5-small",
  files: ["tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"],
  dims: 384,
  sizeMb: 118,
  maxTokens: 512,
};

type Session = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { dims: readonly number[]; data: unknown }>>;
};
type TokenizerLike = { encode: (text: string) => { ids: number[] } };

export interface Embed {
  status(): EmbedderStatus;
  ready(): boolean;
  embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]>;
}

export class Embedder implements Embed {
  private state: EmbedderStatus["state"];
  private progress = 0;
  private error?: string;
  private downloading?: Promise<void>;
  private loaded?: Promise<{ session: Session; tokenizer: TokenizerLike; ort: typeof import("onnxruntime-node") }>;
  /** The model is let go after a few idle minutes: it is ~300 MB in memory (plan.md 13.6 "Hafiflik"). */
  private idleTimer?: ReturnType<typeof setTimeout>;
  private busy = 0;

  constructor(
    private readonly dir: string,
    private readonly onChange: () => void = () => undefined,
  ) {
    this.state = this.present() ? "ready" : "missing";
  }

  private present(): boolean {
    return EMBED_MODEL.files.every((f) => existsSync(join(this.dir, f)) && statSync(join(this.dir, f)).size > 0);
  }

  status(): EmbedderStatus {
    return {
      state: this.state,
      ...(this.state === "downloading" ? { progress: this.progress } : {}),
      ...(this.error ? { error: this.error } : {}),
      model: EMBED_MODEL.id,
      sizeMb: EMBED_MODEL.sizeMb,
    };
  }

  ready(): boolean {
    return this.state === "ready";
  }

  /** Downloads the model files (once); resolves when ready. */
  download(): Promise<void> {
    if (this.state === "ready") return Promise.resolve();
    if (this.downloading) return this.downloading;
    this.state = "downloading";
    this.progress = 0;
    this.error = undefined;
    this.onChange();
    this.downloading = this.fetchAll()
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

  private async fetchAll(): Promise<void> {
    const total = EMBED_MODEL.sizeMb * 1024 * 1024;
    let done = 0;
    let lastReport = 0;
    for (const file of EMBED_MODEL.files) {
      const target = join(this.dir, file);
      if (existsSync(target) && statSync(target).size > 0) continue;
      mkdirSync(dirname(target), { recursive: true });
      const res = await fetch(`https://huggingface.co/${EMBED_MODEL.id}/resolve/main/${file}`, {
        signal: AbortSignal.timeout(30 * 60_000),
      });
      if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) for ${file}`);
      const part = `${target}.part`;
      const out = createWriteStream(part);
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          out.write(value);
          done += value.byteLength;
          this.progress = Math.min(0.99, done / total);
          if (Date.now() - lastReport > 1000) {
            lastReport = Date.now();
            this.onChange();
          }
        }
      } catch (err) {
        out.destroy();
        rmSync(part, { force: true });
        throw err;
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      renameSync(part, target);
    }
  }

  private load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        const ort = await import("onnxruntime-node");
        const { Tokenizer } = await import("@huggingface/tokenizers");
        const tokenizer = new Tokenizer(
          await Bun.file(join(this.dir, "tokenizer.json")).json(),
          await Bun.file(join(this.dir, "tokenizer_config.json")).json(),
        ) as unknown as TokenizerLike;
        const session = (await ort.InferenceSession.create(
          join(this.dir, "onnx/model_quantized.onnx"),
        )) as unknown as Session;
        return { session, tokenizer, ort };
      })();
      this.loaded.catch(() => {
        this.loaded = undefined;
      });
    }
    return this.loaded;
  }

  /** e5 models expect "query: " for questions and "passage: " for stored text. Vectors are normalized. */
  /** Frees the model's memory; the next search loads it again (about a second). */
  async unload(): Promise<void> {
    if (this.worker && !this.busy) {
      this.worker.kill();
      this.worker = undefined;
    }
    const loaded = this.loaded;
    if (!loaded || this.busy) return;
    this.loaded = undefined;
    const { session } = await loaded.catch(() => ({ session: undefined }));
    await (session as { release?: () => Promise<void> } | undefined)?.release?.().catch(() => undefined);
    Bun.gc(true);
  }

  async embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
    this.busy++;
    clearTimeout(this.idleTimer);
    try {
      return await this.embedNow(texts, kind);
    } finally {
      this.busy--;
      this.idleTimer = setTimeout(() => void this.unload(), Number(process.env.GODEYE_EMBED_IDLE_MS) || 3 * 60_000);
      this.idleTimer.unref?.();
    }
  }

  /**
   * The model runs in a child process that stops after a few idle minutes: ONNX Runtime keeps its
   * memory (~350 MB) until the process ends, and God Eye should stay light when idle (plan.md 13.6).
   */
  private async embedNow(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
    if (process.env.GODEYE_EMBED_WORKER === "1") return this.embedHere(texts, kind);
    if (!this.ready()) throw new Error("The search model is not downloaded");
    const worker = this.startWorker();
    const id = ++this.nextId;
    const answer = new Promise<Float32Array[]>((resolve, reject) => this.waiting.set(id, { resolve, reject }));
    worker.stdin.write(`${JSON.stringify({ id, texts, kind })}\n`);
    worker.stdin.flush();
    return answer;
  }

  private worker?: Bun.Subprocess<"pipe", "pipe", "inherit">;
  private nextId = 0;
  private waiting = new Map<number, { resolve: (v: Float32Array[]) => void; reject: (e: Error) => void }>();

  private startWorker(): Bun.Subprocess<"pipe", "pipe", "inherit"> {
    if (this.worker && !this.worker.killed && this.worker.exitCode === null) return this.worker;
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "embed-worker.ts"), this.dir], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "inherit",
      env: { ...process.env, GODEYE_EMBED_WORKER: "1" },
    });
    this.worker = proc;
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of proc.stdout) {
        buffer += decoder.decode(chunk, { stream: true });
        for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          try {
            const msg = JSON.parse(line) as { id: number; vectors?: string[]; error?: string };
            const w = this.waiting.get(msg.id);
            if (!w) continue;
            this.waiting.delete(msg.id);
            if (msg.error) w.reject(new Error(msg.error));
            else
              w.resolve(
                (msg.vectors ?? []).map((b) => new Float32Array(new Uint8Array(Buffer.from(b, "base64")).buffer)),
              );
          } catch {
            // Not a message line.
          }
        }
      }
      for (const w of this.waiting.values()) w.reject(new Error("The search model stopped"));
      this.waiting.clear();
    })();
    return proc;
  }

  async embedHere(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
    if (!this.ready()) throw new Error("The search model is not downloaded");
    const { session, tokenizer, ort } = await this.load();
    const out: Float32Array[] = [];
    for (let start = 0; start < texts.length; start += 16) {
      const batch = texts.slice(start, start + 16).map((t) => `${kind}: ${t}`);
      const encoded = batch.map((t) => tokenizer.encode(t).ids.slice(0, EMBED_MODEL.maxTokens));
      const width = Math.max(1, ...encoded.map((ids) => ids.length));
      const n = batch.length;
      const ids = new BigInt64Array(n * width);
      const mask = new BigInt64Array(n * width);
      encoded.forEach((row, i) => {
        row.forEach((id, j) => {
          ids[i * width + j] = BigInt(id);
          mask[i * width + j] = 1n;
        });
      });
      const feeds: Record<string, unknown> = {
        input_ids: new ort.Tensor("int64", ids, [n, width]),
        attention_mask: new ort.Tensor("int64", mask, [n, width]),
      };
      if (session.inputNames.includes("token_type_ids"))
        feeds.token_type_ids = new ort.Tensor("int64", new BigInt64Array(n * width), [n, width]);
      const result = await session.run(feeds);
      const hidden = result[session.outputNames[0] as string];
      if (!hidden) throw new Error("The model gave no output");
      const dims = hidden.dims[2] as number;
      const data = hidden.data as Float32Array;
      for (let i = 0; i < n; i++) {
        // Mean of the token vectors (padding excluded), then unit length.
        const v = new Float32Array(dims);
        let count = 0;
        for (let j = 0; j < width; j++) {
          if (!mask[i * width + j]) continue;
          count++;
          const base = (i * width + j) * dims;
          for (let k = 0; k < dims; k++) v[k] = (v[k] as number) + (data[base + k] as number);
        }
        let norm = 0;
        for (let k = 0; k < dims; k++) {
          v[k] = (v[k] as number) / Math.max(1, count);
          norm += (v[k] as number) ** 2;
        }
        norm = Math.sqrt(norm) || 1;
        for (let k = 0; k < dims; k++) v[k] = (v[k] as number) / norm;
        out.push(v);
      }
    }
    return out;
  }
}
