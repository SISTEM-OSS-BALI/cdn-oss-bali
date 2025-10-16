export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";

type CreateDownloadBody = {
  key: string;
  expiresIn?: number; // detik, default 60
};

export async function POST(req: Request) {
  // TODO: auth/izin sesuai owner/role
  const { key, expiresIn = 60 } = (await req.json()) as CreateDownloadBody;
  if (!key)
    return NextResponse.json({ error: "key required" }, { status: 400 });

  const cmd = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ResponseCacheControl: "private, max-age=30",
  });

  const url = await getSignedUrl(s3, cmd, {
    expiresIn: Math.min(Number(expiresIn) || 60, 600),
  });

  return NextResponse.json({ url });
}
