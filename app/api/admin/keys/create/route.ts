// app/api/admin/keys/create/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { createApiKey } from "@/lib/keygen";
import { ensureProject } from "@/lib/project";

type Body = {
  projectId?: string; // optional → auto-create kalau tidak ada
  projectName?: string; // optional nama jika auto-create / saat upsert
  scopes?: string[];
  prefix?: "sk_live" | "sk_test";
};

export async function POST(req: Request) {
  const {
    projectId,
    projectName,
    scopes = ["upload", "download"],
    prefix = "sk_live",
  } = (await req.json()) as Body;

  // Pastikan project ada (atau buat baru jika projectId tidak diberikan)
  const project = await ensureProject({ projectId, name: projectName });

  const { key, hash, publicId } = createApiKey(prefix);

  try {
    const apiKey = await db.apiKey.create({
      data: {
        hash,
        publicId,
        prefix,
        projectId: project.id,
        scopes, // kolom Json di Prisma
        allowCIDRs: [], // kolom Json di Prisma (opsional)
      },
    });

    return NextResponse.json({
      apiKey: key, // tampilkan sekali saja
      publicId: apiKey.publicId,
      projectId: project.id,
      scopes: apiKey.scopes,
    });
  } catch (e: any) {
    // tangani FK / unik dsb. agar error lebih informatif
    if (e.code === "P2003") {
      return NextResponse.json(
        { error: "Invalid projectId (foreign key)" },
        { status: 400 }
      );
    }
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Duplicate API key hash" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Internal error", detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
