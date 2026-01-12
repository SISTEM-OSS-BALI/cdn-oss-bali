import crypto from "node:crypto";
import { db } from "@/lib/prisma";
import { ipMatchesAllowlist } from "@/lib/ip";

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

  if (needScopes.length && !needScopes.every((s) => scopes.includes(s))) {
    return { ok: false, status: 403, error: "Insufficient scope" as const };
  }

  // IP allowlist (opsional)
  // Prefer real client ip from common reverse-proxy headers.
  // - Cloudflare: CF-Connecting-IP
  // - Nginx: X-Real-IP
  // - Proxy chain: X-Forwarded-For (first is original)
  const ip =
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  const allowCIDRs = ensureStringArray(ak.allowCIDRs);
  if (allowCIDRs.length) {
    if (!ip) {
      return {
        ok: false,
        status: 403,
        error: "Client IP unavailable" as const,
      };
    }

    const allowed = ipMatchesAllowlist(ip, allowCIDRs);
    if (!allowed) return { ok: false, status: 403, error: "IP not allowed" as const };
  }

  // update last used (best-effort)
  db.apiKey
    .update({ where: { id: ak.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { ok: true, apiKey: ak };
}

const SCOPES = ["upload", "download", "admin"] as const;

function ensureScopeArray(value: unknown): Scope[] {
  return ensureStringArray(value).filter(isScope);
}

function ensureStringArray(value: unknown): string[] {
  // Normal case: Json array
  if (Array.isArray(value)) {
    return value.filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0
    );
  }

  // Compatibility: stored as string in DB (e.g. '["upload","download"]' or 'upload,download')
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];

    // Try JSON.parse first
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        );
      }
    } catch {
      // ignore
    }

    // Fallback: comma-separated
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}
