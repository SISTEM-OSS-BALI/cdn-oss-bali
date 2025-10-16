// app/api/storage/create-download/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";
import { verifyApiKey } from "@/lib/auth";

type CreateDownloadBody = {
  key: string;
  expiresIn?: number; // default 60, min 10, max 600
  asAttachmentName?: string; // opsional: set Content-Disposition attachment
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function sanitizeKey(k: string) {
  // hilangkan leading slash + normalisasi sederhana
  return k.replace(/^\/+/, "").trim();
}

export async function POST(req: Request) {
  // 1) Auth via API key (butuh scope "download")
  const auth = await verifyApiKey(req.headers, ["download"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const projectId = auth.apiKey!.projectId;

  // 2) ENV wajib
  const bucket = process.env.S3_BUCKET;
  if (!bucket) {
    return NextResponse.json(
      { error: "Server misconfigured: S3_BUCKET missing" },
      { status: 500 }
    );
  }

  // 3) Ambil & validasi body
  let body: CreateDownloadBody;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.key || typeof body.key !== "string") {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  const key = sanitizeKey(body.key);
  const expiresIn = clamp(Number(body.expiresIn ?? 60) || 60, 10, 600);
  const asAttachmentName = body.asAttachmentName?.trim();

  // 4) (Disarankan) cek metadata file di DB untuk otorisasi project
  //    - Jika file public → boleh siapa saja (selama punya scope download)
  //    - Jika private → hanya project pemilik yang boleh
  //    - Jika tidak ada di DB → fallback cek HEAD ke S3 (opsional)
  const fo = await db.fileObject
    .findUnique({ where: { key } })
    .catch(() => null);

  if (fo) {
    if (!fo.isPublic) {
      // file private → wajib project match
      if (!fo.projectId || fo.projectId !== projectId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    // opsional: kalau bucket di DB beda dengan env, tolak
    if (fo.bucket && fo.bucket !== bucket) {
      return NextResponse.json({ error: "Bucket mismatch" }, { status: 400 });
    }
  } else {
    // Tidak ada metadata — cek di S3 (HEAD). Kalau 404, ya 404.
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (e) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Tanpa metadata, izinkan saja berdasarkan scope (download) → jika perlu,
    // kamu bisa mewajibkan metadata ada untuk strict mode.
  }

  // 5) Build GetObjectCommand + header opsional
  const cmd = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseCacheControl: "private, max-age=30",
    ...(asAttachmentName
      ? {
          ResponseContentDisposition: `attachment; filename="${asAttachmentName.replace(
            /"/g,
            ""
          )}"`,
        }
      : {}),
  });

  // 6) Buat pre-signed GET URL
  let url: string;
  try {
    url = await getSignedUrl(s3, cmd, { expiresIn });
  } catch (e) {
    return NextResponse.json(
      {
        error: "Failed to sign download URL",
        detail: String((e as Error).message || e),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ url, expiresIn, key });
}
