export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";
import { readApiKeyFromHeaders, verifyApiKey } from "@/lib/auth";

// --- util kecil ---
function safeExt(ext?: string) {
  const x = (ext ?? "bin").replace(/^\./, "").trim().toLowerCase();
  // batasi karakter aneh
  return x.replace(/[^a-z0-9]+/g, "") || "bin";
}

// normalisasi path "folder" agar tidak bisa keluar bucket (no ../, dsb.)
function sanitizeFolder(f?: string) {
  const base = (f ?? "uploads").trim().replace(/^\/+|\/+$/g, "");
  const cleaned = base
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]/g, "_"))
    .join("/");
  return cleaned || "uploads";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type CreateUploadBody = {
  mime?: string;
  ext?: string;
  folder?: string;
  isPublic?: boolean;
  checksum?: string; // sha256 hex (opsional)
  expiresIn?: number; // detik, default 60
};

export async function POST(req: Request) {
  // 1) Auth
  // Default: require API key with scope "upload".
  // For local/demo only, you can allow anonymous signing by setting:
  //   ALLOW_ANON_UPLOAD=true
  const allowAnon = process.env.ALLOW_ANON_UPLOAD === "true";
  const providedKey = readApiKeyFromHeaders(req.headers);
  let projectId: string | null = null;

  if (!providedKey && !allowAnon) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  if (providedKey) {
    const auth = await verifyApiKey(req.headers, ["upload"]);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    projectId = auth.apiKey!.projectId;
  }

  // 2) ENV wajib
  const bucket = process.env.S3_BUCKET;
  const cdnBase = process.env.CDN_PUBLIC_BASE;
  if (!bucket || !cdnBase) {
    return NextResponse.json(
      { error: "Server misconfigured: S3_BUCKET/CDN_PUBLIC_BASE missing" },
      { status: 500 }
    );
  }

  // 3) Validasi & normalisasi input
  let body: CreateUploadBody;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mime = (body.mime || "application/octet-stream").trim();
  const ext = safeExt(body.ext);
  const folder = sanitizeFolder(body.folder);
  const isPublic = body.isPublic !== false; // default true
  const expiresIn = clamp(Number(body.expiresIn ?? 60) || 60, 10, 600); // 10..600 dtk

  // checksum optional: harus 64 hex (sha256)
  const checksumHex = body.checksum?.toLowerCase();
  const hasValidChecksum = !!checksumHex && /^[a-f0-9]{64}$/.test(checksumHex);

  const today = new Date().toISOString().slice(0, 10);
  const key = `${folder}/${today}/${crypto.randomUUID()}.${ext}`;

  // 4) Build PutObjectCommand (+ header cache)
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: mime,
    CacheControl: isPublic
      ? "public, max-age=31536000, immutable"
      : "private, max-age=0, no-store",
    // Hanya set ChecksumSHA256 ketika valid
    ...(hasValidChecksum
      ? { ChecksumSHA256: Buffer.from(checksumHex!, "hex").toString("base64") }
      : {}),
    // ServerSideEncryption: "AES256", // aktifkan kalau mau SSE
  });

  // 5) Buat pre-signed URL
  let uploadUrl: string;
  try {
    uploadUrl = await getSignedUrl(s3, cmd, { expiresIn });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to sign upload URL",
        detail: String((e as Error).message || e),
      },
      { status: 500 }
    );
  }

  // 6) Simpan metadata awal ke DB
  try {
    await db.fileObject.create({
      data: {
        bucket,
        key,
        mimeType: mime,
        isPublic,
        checksum: hasValidChecksum ? checksumHex! : null,
        projectId, // jejak API key yang membuat (opsional)
      },
    });
  } catch (e) {
    // Metadata gagal disimpan — masih aman untuk dipakai upload, tapi kita beri tahu klien.
    return NextResponse.json(
      {
        warning: "Upload URL created, but failed to persist metadata",
        uploadUrl,
        key,
        publicUrl: `${cdnBase}/${bucket}/${key}`,
        detail: String((e as Error).message || e),
      },
      { status: 207 } // Multi-Status / partial
    );
  }

  // 7) Respons OK
  return NextResponse.json({
    uploadUrl, // PUT ke s3.onestepsolutionbali.com
    key,
    expiresIn, // info ke klien
    publicUrl: `${cdnBase}/${bucket}/${key}`, // GET via cdn.*
  });
}
