import { prisma } from "./prisma";

// Dependency order matters twice over: this is the order tables are restored
// in (each table's foreign keys must already exist). itemUnit needs both
// item and purchase; jobCardPart needs jobCard, itemUnit, and item.
// refresh_tokens is deliberately excluded — sessions are meant to be
// re-issued, not restored.
export const BACKUP_TABLES = [
  "role",
  "user",
  "customer",
  "supplier",
  "item",
  "vehicle",
  "employee",
  "jobCard",
  "purchase",
  "supplierPayment",
  "itemUnit",
  "jobCardPart",
  "jobCardLabour",
  "jobCardMedia",
  "invoice",
  "invoicePayment",
  "attendance",
  "salaryPayment",
  "employeeAdvance",
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

const LEGACY_PURCHASE_PAYMENT_FIELDS = [
  "paymentAmount",
  "paymentMode",
  "paymentReference",
  "paymentBy",
  "paymentDate",
] as const;

// Older backups predate some schema changes. Each step below converts one
// of them the same way the matching database migration did, so a backup of
// any age still restores cleanly into the current schema.
function upgradeLegacyBundle(bundle: BackupBundle): BackupBundle {
  return upgradeInvoicePayments(upgradeSupplierPayments(bundle));
}

// Before supplier-level payments (2026-09-29) there was no supplierPayment
// table; each purchase carried its own payment fields. Each paid purchase
// becomes one supplier payment.
function upgradeSupplierPayments(bundle: BackupBundle): BackupBundle {
  if (bundle.tables.supplierPayment) return bundle;

  const purchases = (bundle.tables.purchase ?? []) as Record<string, any>[];
  const supplierPayment = purchases
    .filter((p) => Number(p.paymentAmount ?? 0) > 0)
    .map((p) => ({
      supplierId: p.supplierId,
      amount: p.paymentAmount,
      paymentDate: p.paymentDate ?? p.purchaseDate,
      paymentMode: p.paymentMode ?? null,
      reference: p.paymentReference ?? null,
      paidBy: p.paymentBy ?? null,
      notes: `Recorded against purchase #${p.id} before supplier-level payments`,
      createdById: p.createdById,
      createdAt: p.paymentDate ?? p.createdAt,
    }));

  const purchase = purchases.map((p) => {
    const copy = { ...p };
    for (const field of LEGACY_PURCHASE_PAYMENT_FIELDS) delete copy[field];
    return copy;
  });

  return { ...bundle, tables: { ...bundle.tables, purchase, supplierPayment } };
}

const LEGACY_INVOICE_PAYMENT_FIELDS = ["paymentMode", "paymentReference", "paymentReceivedBy", "paymentDate"] as const;

// Before invoice payment history (2026-09-30) there was no invoicePayment
// table; each invoice carried its running total plus the last payment's
// details. Each paid invoice becomes one payment row (its paymentAmount
// running total is kept as it is).
function upgradeInvoicePayments(bundle: BackupBundle): BackupBundle {
  if (bundle.tables.invoicePayment) return bundle;

  const invoices = (bundle.tables.invoice ?? []) as Record<string, any>[];
  const invoicePayment = invoices
    .filter((i) => Number(i.paymentAmount ?? 0) > 0)
    .map((i) => ({
      invoiceId: i.id,
      amount: i.paymentAmount,
      paymentDate: i.paymentDate ?? i.invoiceDate,
      paymentMode: i.paymentMode ?? null,
      reference: i.paymentReference ?? null,
      receivedBy: i.paymentReceivedBy ?? null,
      notes: "Recorded before payment history was kept",
      createdById: i.createdById,
      createdAt: i.paymentDate ?? i.createdAt,
    }));

  const invoice = invoices.map((i) => {
    const copy = { ...i };
    for (const field of LEGACY_INVOICE_PAYMENT_FIELDS) delete copy[field];
    return copy;
  });

  return { ...bundle, tables: { ...bundle.tables, invoice, invoicePayment } };
}

export async function restoreFromBundle(original: BackupBundle): Promise<Record<BackupTable, number>> {
  const bundle = upgradeLegacyBundle(original);
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
    employee: "employees",
    jobCard: "job_cards",
    purchase: "purchases",
    supplierPayment: "supplier_payments",
    itemUnit: "item_units",
    jobCardPart: "job_card_parts",
    jobCardLabour: "job_card_labour",
    jobCardMedia: "job_card_media",
    invoice: "invoices",
    invoicePayment: "invoice_payments",
    attendance: "attendance",
    salaryPayment: "salary_payments",
    employeeAdvance: "employee_advances",
  };
  return map[table];
}
