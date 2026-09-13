import { prisma } from "./prisma";

// Dependency order matters twice over: this is the order tables are restored
// in (each table's foreign keys must already exist), and stock_ledger has to
// come after BOTH purchases and job_card_parts since it can reference either.
// refresh_tokens is deliberately excluded — sessions are meant to be
// re-issued, not restored.
export const BACKUP_TABLES = [
  "role",
  "user",
  "customer",
  "supplier",
  "item",
  "vehicle",
  "jobCard",
  "purchase",
  "jobCardPart",
  "jobCardLabour",
  "jobCardMedia",
  "stockLedger",
  "invoice",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupBundle {
  generatedAt: string;
  tables: Record<BackupTable, unknown[]>;
}

export async function buildBackupBundle(): Promise<BackupBundle> {
  const tables = {} as Record<BackupTable, unknown[]>;

  for (const table of BACKUP_TABLES) {
    // Decimal/Date fields survive JSON.stringify as strings automatically;
    // no manual serialization needed for this data shape.
    tables[table] = await (prisma[table] as any).findMany();
  }

  return { generatedAt: new Date().toISOString(), tables };
}

export async function restoreFromBundle(bundle: BackupBundle): Promise<Record<BackupTable, number>> {
  const counts = {} as Record<BackupTable, number>;

  await prisma.$transaction(
    async (tx) => {
      // Restoring into a non-empty database would violate unique
      // constraints (emails, item codes, etc.) in confusing ways, so this
      // only ever runs against tables that are already empty.
      for (const table of [...BACKUP_TABLES].reverse()) {
        const existing = await (tx[table] as any).count();
        if (existing > 0) {
          throw new Error(
            `Refusing to restore: table "${table}" already has ${existing} row(s). Restore only runs against an empty database.`
          );
        }
      }

      for (const table of BACKUP_TABLES) {
        const rows = bundle.tables[table] ?? [];
        if (rows.length === 0) {
          counts[table] = 0;
          continue;
        }
        await (tx[table] as any).createMany({ data: rows });
        counts[table] = rows.length;
      }

      // Explicit ids were just inserted, bypassing each table's identity
      // sequence — without this, the very next normal insert could collide
      // with a restored id.
      for (const table of BACKUP_TABLES) {
        await tx.$executeRawUnsafe(`
          SELECT setval(
            pg_get_serial_sequence('"${tableNameFor(table)}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "${tableNameFor(table)}"), 1)
          )
        `);
      }
    },
    { timeout: 60_000 }
  );

  return counts;
}

// Mirrors each model's @@map(...) in schema.prisma.
function tableNameFor(table: BackupTable): string {
  const map: Record<BackupTable, string> = {
    role: "roles",
    user: "users",
    customer: "customers",
    supplier: "suppliers",
    item: "items",
    vehicle: "vehicles",
    jobCard: "job_cards",
    purchase: "purchases",
    jobCardPart: "job_card_parts",
    jobCardLabour: "job_card_labour",
    jobCardMedia: "job_card_media",
    stockLedger: "stock_ledger",
    invoice: "invoices",
  };
  return map[table];
}
