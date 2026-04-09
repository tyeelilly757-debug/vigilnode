import { createHash } from "node:crypto";

/** Must match Worker `promptHash` in `/inject` + KV key `client:{id}:prompt:{hash}`. */
export function promptHashForKv(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase(), "utf8").digest("hex").slice(0, 32);
}
