// src/lib/projects.ts
import { db } from "@/lib/prisma";

/**
 * Pastikan project ada. Jika belum ada, buat.
 * - Kalau `projectId` diberikan → pakai sebagai PK (harus unik).
 * - Kalau `projectId` tidak diberikan → buat project baru (cuid otomatis).
 */
export async function ensureProject(opts: {
  projectId?: string;
  name?: string;
}) {
  const { projectId, name } = opts;

  if (projectId) {
    // Aman dari race-condition (idempotent)
    const project = await db.project.upsert({
      where: { id: projectId },
      update: {}, // tidak mengubah apapun jika sudah ada
      create: { id: projectId, name: name || `Project ${projectId}` },
    });
    return project;
  }

  // Tanpa projectId → buat baru (cuid by Prisma)
  const project = await db.project.create({
    data: { name: name || "Untitled Project" },
  });
  return project;
}
