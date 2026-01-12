import crypto from "node:crypto";

export function createApiKey(prefix: "sk_live" | "sk_test" = "sk_live") {
  const publicId = crypto.randomBytes(9).toString("base64url"); // pendek, aman utk log
  const secret = crypto.randomBytes(24).toString("base64url"); // rahasia
  const key = `${prefix}_${publicId}.${secret}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return { key, hash, publicId, prefix };
}
