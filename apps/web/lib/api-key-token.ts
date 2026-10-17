import { createHash, randomBytes } from "node:crypto";

export function hashApiKey(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function generateApiKey() {
  const token = `tw_live_${randomBytes(32).toString("hex")}`;
  return { token, hash: hashApiKey(token), prefix: token.slice(0, 16) };
}
export function parseApiKey(header: string | null) {
  const match = /^Bearer (tw_live_[0-9a-f]{64})$/i.exec(header ?? "");
  return match?.[1] ?? null;
}
