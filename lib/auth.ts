import crypto from "node:crypto";
import { db } from "@/lib/prisma";

export type Scope = "upload" | "download" | "admin";

export function readApiKeyFromHeaders(headers: Headers) {
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const h = headers.get("x-api-key");
  return h?.trim() || null;
}

export async function verifyApiKey(headers: Headers, needScopes: Scope[] = []) {
  const key = readApiKeyFromHeaders(headers);
  if (!key)
    return { ok: false, status: 401, error: "Missing API key" as const };

  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const ak = await db.apiKey.findUnique({ where: { hash } });
  if (!ak || !ak.isActive)
    return { ok: false, status: 401, error: "Invalid API key" as const };

  const scopes = ensureScopeArray(ak.scopes);

  // Scope check
  if (needScopes.length && !needScopes.every((s) => scopes.includes(s))) {
    return { ok: false, status: 403, error: "Insufficient scope" as const };
  }

  // IP allowlist (opsional)
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const allowCIDRs = ensureStringArray(ak.allowCIDRs);
  if (allowCIDRs.length && ip) {
    const allowed = allowCIDRs.some((cidr) => ipInCidr(ip, cidr)); // implementasi sederhana di bawah
    if (!allowed)
      return { ok: false, status: 403, error: "IP not allowed" as const };
  }

  // update last used (best-effort)
  db.apiKey
    .update({ where: { id: ak.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, apiKey: ak };
}

// super minim: hanya ip/32 (single ip)  — kalau mau CIDR beneran, pakai library ip-cidr/nn cidr-matcher
function ipInCidr(ip: string, cidr: string) {
  return cidr === ip; // ganti dengan matcher CIDR beneran kalau butuh
}

const SCOPES = ["upload", "download", "admin"] as const;

function ensureScopeArray(value: unknown): Scope[] {
  return ensureStringArray(value).filter(isScope);
}

function ensureStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}
