import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createApiKey } from "@/lib/keygen";

export async function POST(req: Request) {
  // TODO: verifikasi admin (NextAuth/JWT dsb.)
  const {
    projectId,
    scopes = ["upload", "download"],
    prefix = "sk_live",
  } = await req.json();

  const { key, hash, publicId } = createApiKey(prefix as "sk_live" | "sk_test");

  await db.apiKey.create({
    data: { hash, publicId, prefix, projectId, scopes },
  });

  // tampilkan key sekali saja!
  return NextResponse.json({ apiKey: key, publicId, projectId, scopes });
}
