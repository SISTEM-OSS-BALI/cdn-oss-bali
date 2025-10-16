export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { s3 } from "@/lib/s3";
import { db } from "@/lib/prisma";

type ConfirmBody = { key: string };

export async function POST(req: Request) {
  const { key } = (await req.json()) as ConfirmBody;
  if (!key)
    return NextResponse.json({ error: "key required" }, { status: 400 });

  const head = await s3.send(
    new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })
  );

  const size = head.ContentLength ?? undefined;
  const etag = (head.ETag || "").replaceAll('"', "");

  await db.fileObject.update({
    where: { key },
    data: { size: size ? Number(size) : null, etag },
  });

  return NextResponse.json({ ok: true, size, etag });
}
