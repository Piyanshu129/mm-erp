import "dotenv/config";
import fs from "fs";
import { restoreFromBundle, BackupBundle } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const filePath = process.argv[2];
  const confirmed = process.argv.includes("--yes");

  if (!filePath) {
    console.error("Usage: npm run backup:restore -- <path-to-backup.json> --yes");
    process.exit(1);
  }
  if (!confirmed) {
    console.error(
      "Restore only runs against an EMPTY database and cannot be undone. Re-run with --yes to confirm."
    );
    process.exit(1);
  }

  const bundle: BackupBundle = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`Restoring backup from ${bundle.generatedAt}...`);

  const counts = await restoreFromBundle(bundle);
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count} rows restored`);
  }
  console.log("Restore complete.");
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
