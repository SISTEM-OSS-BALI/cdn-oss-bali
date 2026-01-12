import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Usage:
//   DATABASE_URL=... npx tsx scripts/create-api-key.ts --project "OSS" --scopes upload,download --allow "203.0.113.10" --allow "10.0.0.0/24"
// It prints the plaintext key ONCE. Store it securely.

function parseArgs(argv: string[]) {
  const out: Record<string, any> = { allow: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--projectId") out.projectId = argv[++i];
    else if (a === "--scopes" || a === "-s") out.scopes = argv[++i];
    else if (a === "--allow") out.allow.push(argv[++i]);
    else if (a === "--inactive") out.isActive = false;
  }
  return out;
}

function randomKey() {
  // 32 bytes => 64 hex chars
  const token = crypto.randomBytes(32).toString("hex");
  return `sk_${token}`;
}

const prisma = new PrismaClient();

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const projectName = args.project as string | undefined;
  const projectId = args.projectId as string | undefined;
  const scopesRaw = (args.scopes as string | undefined) ?? "upload,download";
  const scopes = scopesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowCIDRs = (args.allow as string[]) ?? [];
  const isActive = args.isActive !== false;

  if (!projectId && !projectName) {
    throw new Error("Provide --projectId or --project <name>");
  }

  const project = projectId
    ? await prisma.project.findUnique({ where: { id: projectId } })
    : await prisma.project.findFirst({ where: { name: projectName! } });

  const ensuredProject =
    project ??
    (await prisma.project.create({ data: { name: projectName ?? "Project" } }));

  const key = randomKey();
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const publicId = crypto.randomBytes(8).toString("hex");
  const prefix = key.slice(0, 6);

  await prisma.apiKey.create({
    data: {
      projectId: ensuredProject.id,
      hash,
      publicId,
      prefix,
      scopes,
      allowCIDRs,
      isActive,
    },
  });

  console.log("\n✅ API key created");
  console.log("Project:", ensuredProject.id, "(", ensuredProject.name, ")");
  console.log("Scopes:", scopes.join(", "));
  console.log("Allow rules:", allowCIDRs.length ? allowCIDRs.join(", ") : "(none)");
  console.log("\n🔑 PLAINTEXT KEY (save it now, won't be shown again):\n" + key + "\n");
}

main()
  .catch((e) => {
    console.error("\n❌", e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
