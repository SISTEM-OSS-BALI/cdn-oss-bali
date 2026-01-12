// app/api/storage/confirm/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";
import { verifyApiKey } from "@/lib/auth";

type ConfirmBody = { key?: string };

function sanitizeKey(k?: string) {
  if (!k || typeof k !== "string") return "";
  return k.replace(/^\/+/, "").trim();
}

export async function POST(req: Request) {
  // 1) Auth: butuh scope "upload" (key yang sama dengan create-upload)
  const auth = await verifyApiKey(req.headers, ["upload"]);
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
  let body: ConfirmBody;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = sanitizeKey(body.key);
  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  // 4) Pastikan metadata file ada & milik project yang sama
  const fo = await db.fileObject
    .findUnique({ where: { key } })
    .catch(() => null);
  if (!fo) {
    return NextResponse.json(
      { error: "Metadata not found for this key" },
      { status: 404 }
    );
  }
  if (fo.projectId && fo.projectId !== projectId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (fo.bucket && fo.bucket !== bucket) {
    return NextResponse.json({ error: "Bucket mismatch" }, { status: 400 });
  }

  // 5) HEAD ke S3 untuk ambil ukuran & etag (objek harus sudah ter-upload)
  let head;
  try {
    head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  } catch (e: any) {
    // NotFound / NoSuchKey
    return NextResponse.json(
      { error: "Object not found in storage", detail: e?.name || String(e) },
      { status: 404 }
    );
  }

  const size =
    typeof head.ContentLength === "number" ? head.ContentLength : null;
  const etag = (head.ETag || "").replaceAll('"', "") || null;

  // 6) Update metadata di DB
  await db.fileObject.update({
    where: { key },
    data: {
      size,
      etag,
      // jika tadi row belum di-binding ke project, bind sekarang:
      ...(fo.projectId ? {} : { projectId }),
    },
  });

  return NextResponse.json({ ok: true, size, etag, key });
}
