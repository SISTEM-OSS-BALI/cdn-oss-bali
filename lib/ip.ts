// lib/ip.ts
// Minimal IPv4 + CIDR matcher (no deps). Supports:
// - single IPv4: "203.0.113.10"
// - CIDR: "203.0.113.0/24"
// If input is not valid IPv4, returns false.

function parseIPv4(ip: string): number | null {
  const s = ip.trim();
  const parts = s.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const v = Number(p);
    if (v < 0 || v > 255) return null;
    n = (n << 8) | v;
  }
  // >>> 0 to force unsigned
  return n >>> 0;
}

function ipMatchesRule(ip: string, rule: string): boolean {
  const candidate = parseIPv4(ip);
  if (candidate == null) return false;

  const r = rule.trim();
  if (!r) return false;

  // single IPv4
  if (!r.includes("/")) {
    const exact = parseIPv4(r);
    return exact != null && exact === candidate;
  }

  // CIDR
  const [baseStr, bitsStr] = r.split("/");
  const base = parseIPv4(baseStr);
  if (base == null) return false;
  const bits = Number(bitsStr);
  if (!Number.isFinite(bits) || bits < 0 || bits > 32) return false;

  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (candidate & mask) === (base & mask);
}

// Match an IP against a list of allow rules.
// Rules can be single IPv4 or CIDR.
export function ipMatchesAllowlist(ip: string, rules: string[]): boolean {
  return rules.some((r) => ipMatchesRule(ip, r));
}
