import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Encryption at rest for what God Eye keeps for you locally: database addresses, vault secrets.
 * The key is a random file next to the data (mode 600), so a copied database or backup file
 * alone reveals nothing. It does not protect against someone who can read your whole home folder.
 */
export class Sealer {
  private key?: Promise<CryptoKey>;

  constructor(private readonly dataDir: string) {}

  private load(): Promise<CryptoKey> {
    if (!this.key) {
      const file = join(this.dataDir, "vault.key");
      if (!existsSync(file)) {
        writeFileSync(file, Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64"), {
          mode: 0o600,
        });
        chmodSync(file, 0o600);
      }
      const raw = Buffer.from(readFileSync(file, "utf8").trim(), "base64");
      this.key = crypto.subtle.importKey("raw", new Uint8Array(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
    }
    return this.key;
  }

  async seal(text: string, aad = ""): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) },
      await this.load(),
      new TextEncoder().encode(text),
    );
    return `v1.${Buffer.from(iv).toString("base64")}.${Buffer.from(new Uint8Array(data)).toString("base64")}`;
  }

  async open(sealed: string, aad = ""): Promise<string> {
    const [version, iv, data] = sealed.split(".");
    if (version !== "v1" || !iv || !data) throw new Error("Unknown sealed format");
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(Buffer.from(iv, "base64")), additionalData: new TextEncoder().encode(aad) },
      await this.load(),
      new Uint8Array(Buffer.from(data, "base64")),
    );
    return new TextDecoder().decode(plain);
  }
}
