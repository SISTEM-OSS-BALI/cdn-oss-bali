export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";

type CreateUploadBody = {
  mime?: string;
  ext?: string;
  folder?: string;
  isPublic?: boolean;
  checksum?: string; // sha256 opsional dari client
};

function safeExt(ext?: string) {
  const x = (ext ?? "bin").replace(/^\./, "");
  return x || "bin";
}

export async function POST(req: Request) {
  // TODO: tambahkan auth (JWT/NextAuth) + rate-limit sesuai kebutuhan
  const body = (await req.json()) as CreateUploadBody;
  const { mime, ext, folder = "uploads", isPublic = true, checksum } = body;

  const today = new Date().toISOString().slice(0, 10);
  const key = `${folder}/${today}/${crypto.randomUUID()}.${safeExt(ext)}`;

  const cmd = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: mime || "application/octet-stream",
    CacheControl: isPublic
      ? "public, max-age=31536000, immutable"
      : "private, max-age=0, no-store",
    // ServerSideEncryption: "AES256", // opsional
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 }); // 60 detik

  await db.fileObject.create({
    data: {
      bucket: process.env.S3_BUCKET,
      key,
      mimeType: mime || "application/octet-stream",
      isPublic,
      checksum: checksum ?? null,
    },
  });

  return NextResponse.json({
    uploadUrl, // PUT ke s3.onestepsolutionbali.com
    key,
    publicUrl: `${process.env.CDN_PUBLIC_BASE}/${process.env.S3_BUCKET}/${key}`, // GET via cdn.*
  });
}
