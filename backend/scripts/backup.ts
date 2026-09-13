import "dotenv/config";
import fs from "fs";
import path from "path";
import { buildBackupBundle } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const bundle = await buildBackupBundle();

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });

  const filename = `backup-${bundle.generatedAt.replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2));

  console.log(`Backup written to ${filePath}`);
  for (const [table, rows] of Object.entries(bundle.tables)) {
    console.log(`  ${table}: ${(rows as unknown[]).length} rows`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
