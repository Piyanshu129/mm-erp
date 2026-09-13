import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";

export const EXCEL_EXPORT_PATH = path.join(__dirname, "..", "..", "exports", "mm-erp-data.xlsx");

interface SheetSpec {
  name: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, unknown>[];
}

function n(value: unknown): number | null {
  return value == null ? null : Number(value);
}

async function customersSheet(): Promise<SheetSpec> {
  const rows = await prisma.customer.findMany({ orderBy: { id: "asc" } });
  return {
    name: "Customers",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 22 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "WhatsApp", key: "whatsapp", width: 15 },
      { header: "Email", key: "email", width: 22 },
      { header: "Address", key: "address", width: 28 },
      { header: "Active", key: "isActive", width: 10 },
      { header: "Created", key: "createdAt", width: 20 },
    ],
    rows,
  };
}

async function vehiclesSheet(): Promise<SheetSpec> {
  const vehicles = await prisma.vehicle.findMany({
    include: { customer: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Vehicles",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Registration No.", key: "registrationNumber", width: 18 },
      { header: "Make", key: "make", width: 14 },
      { header: "Model", key: "model", width: 14 },
      { header: "Variant", key: "variant", width: 14 },
      { header: "Year", key: "year", width: 8 },
      { header: "Current KM", key: "currentKm", width: 12 },
      { header: "Owner", key: "customerName", width: 22 },
      { header: "Owner Mobile", key: "customerMobile", width: 15 },
      { header: "Active", key: "isActive", width: 10 },
      { header: "Created", key: "createdAt", width: 20 },
    ],
    rows: vehicles.map((v) => ({
      ...v,
      customerName: v.customer.name,
      customerMobile: v.customer.mobile,
    })),
  };
}

async function suppliersSheet(): Promise<SheetSpec> {
  const rows = await prisma.supplier.findMany({ orderBy: { id: "asc" } });
  return {
    name: "Suppliers",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 22 },
      { header: "Contact Person", key: "contactPerson", width: 18 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Address", key: "address", width: 28 },
      { header: "Active", key: "isActive", width: 10 },
      { header: "Created", key: "createdAt", width: 20 },
    ],
    rows,
  };
}

async function itemsSheet(): Promise<SheetSpec> {
  const items = await prisma.item.findMany({ orderBy: { id: "asc" } });
  return {
    name: "Items",
    columns: [
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Name", key: "name", width: 22 },
      { header: "Category", key: "category", width: 12 },
      { header: "Part Number", key: "partNumber", width: 16 },
      { header: "Brand", key: "brand", width: 14 },
      { header: "UOM", key: "uom", width: 8 },
      { header: "Purchase Cost", key: "purchaseCost", width: 14 },
      { header: "Selling Price", key: "sellingPrice", width: 14 },
      { header: "Min Stock", key: "minStock", width: 10 },
      { header: "Current Stock", key: "currentStock", width: 12 },
      { header: "Active", key: "isActive", width: 10 },
      { header: "Created", key: "createdAt", width: 20 },
    ],
    rows: items.map((i) => ({
      ...i,
      purchaseCost: n(i.purchaseCost),
      sellingPrice: n(i.sellingPrice),
    })),
  };
}

async function purchasesSheet(): Promise<SheetSpec> {
  const purchases = await prisma.purchase.findMany({
    include: { supplier: true, item: true, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Purchases",
    columns: [
      { header: "Serial No.", key: "id", width: 10 },
      { header: "Date", key: "purchaseDate", width: 18 },
      { header: "Supplier", key: "supplierName", width: 20 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Purchase Cost", key: "purchaseCost", width: 14 },
      { header: "Selling Price", key: "sellingPrice", width: 14 },
      { header: "Remarks", key: "remarks", width: 20 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: purchases.map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate,
      supplierName: p.supplier.name,
      itemCode: p.item.itemCode,
      itemName: p.item.name,
      quantity: p.quantity,
      purchaseCost: n(p.purchaseCost),
      sellingPrice: n(p.sellingPrice),
      remarks: p.remarks,
      createdByName: p.createdBy.name,
    })),
  };
}

async function stockLedgerSheet(): Promise<SheetSpec> {
  const entries = await prisma.stockLedger.findMany({
    include: {
      item: true,
      purchase: true,
      jobCardPart: { include: { jobCard: true } },
      createdBy: true,
    },
    orderBy: { id: "asc" },
  });
  return {
    name: "Stock Ledger",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Direction", key: "direction", width: 10 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Balance After", key: "balanceAfter", width: 14 },
      { header: "Reference", key: "reference", width: 22 },
      { header: "By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: entries.map((e) => ({
      id: e.id,
      itemCode: e.item.itemCode,
      itemName: e.item.name,
      direction: e.direction,
      quantity: e.quantity,
      balanceAfter: e.balanceAfter,
      reference: e.purchase
        ? `Purchase #${e.purchase.id}`
        : e.jobCardPart
          ? e.jobCardPart.jobCard.jobCardNumber
          : e.referenceType,
      createdByName: e.createdBy.name,
      createdAt: e.createdAt,
    })),
  };
}

async function jobCardsSheet(): Promise<SheetSpec> {
  const jobCards = await prisma.jobCard.findMany({
    include: { vehicle: { include: { customer: true } }, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Cards",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Customer", key: "customerName", width: 20 },
      { header: "KM", key: "kmAtService", width: 10 },
      { header: "Complaint", key: "complaint", width: 26 },
      { header: "Required Work", key: "requiredWork", width: 26 },
      { header: "Status", key: "status", width: 16 },
      { header: "Created By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: jobCards.map((jc) => ({
      jobCardNumber: jc.jobCardNumber,
      vehicleRegistration: jc.vehicle.registrationNumber,
      customerName: jc.vehicle.customer.name,
      kmAtService: jc.kmAtService,
      complaint: jc.complaint,
      requiredWork: jc.requiredWork,
      status: jc.status,
      createdByName: jc.createdBy.name,
      createdAt: jc.createdAt,
    })),
  };
}

async function jobCardPartsSheet(): Promise<SheetSpec> {
  const parts = await prisma.jobCardPart.findMany({
    include: { jobCard: true, item: true, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Card Parts",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Unit Price", key: "unitPrice", width: 12 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Issued By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: parts.map((p) => ({
      jobCardNumber: p.jobCard.jobCardNumber,
      itemCode: p.item.itemCode,
      itemName: p.item.name,
      quantity: p.quantity,
      unitPrice: n(p.unitPrice),
      amount: n(p.amount),
      createdByName: p.createdBy.name,
      createdAt: p.createdAt,
    })),
  };
}

async function jobCardLabourSheet(): Promise<SheetSpec> {
  const labour = await prisma.jobCardLabour.findMany({
    include: { jobCard: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Card Labour",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Description", key: "description", width: 26 },
      { header: "Technician", key: "technician", width: 16 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Rate", key: "rate", width: 12 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: labour.map((l) => ({
      jobCardNumber: l.jobCard.jobCardNumber,
      description: l.description,
      technician: l.technician,
      quantity: l.quantity,
      rate: n(l.rate),
      amount: n(l.amount),
      createdAt: l.createdAt,
    })),
  };
}

async function invoicesSheet(): Promise<SheetSpec> {
  const invoices = await prisma.invoice.findMany({
    include: { jobCard: { include: { vehicle: { include: { customer: true } } } }, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Invoices",
    columns: [
      { header: "Invoice No.", key: "invoiceNumber", width: 14 },
      { header: "Date", key: "invoiceDate", width: 18 },
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Customer", key: "customerName", width: 20 },
      { header: "Parts Total", key: "partsTotal", width: 12 },
      { header: "Labour Total", key: "labourTotal", width: 12 },
      { header: "Discount", key: "discount", width: 10 },
      { header: "Total", key: "totalAmount", width: 12 },
      { header: "Created By", key: "createdByName", width: 16 },
    ],
    rows: invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      jobCardNumber: inv.jobCard.jobCardNumber,
      vehicleRegistration: inv.jobCard.vehicle.registrationNumber,
      customerName: inv.jobCard.vehicle.customer.name,
      partsTotal: n(inv.partsTotal),
      labourTotal: n(inv.labourTotal),
      discount: n(inv.discount),
      totalAmount: n(inv.totalAmount),
      createdByName: inv.createdBy.name,
    })),
  };
}

// One tab per business entity — deliberately mirrors the master spec's own
// "master sheet" / backup data list, not the full schema (Users/Roles/
// RefreshTokens are login plumbing, not business records).
export async function regenerateExcelExport(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Motors Mitra ERP";
  workbook.created = new Date();

  const sheets = await Promise.all([
    customersSheet(),
    vehiclesSheet(),
    suppliersSheet(),
    itemsSheet(),
    purchasesSheet(),
    stockLedgerSheet(),
    jobCardsSheet(),
    jobCardPartsSheet(),
    jobCardLabourSheet(),
    invoicesSheet(),
  ]);

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.columns;
    ws.getRow(1).font = { bold: true };
    ws.addRows(sheet.rows);
  }

  fs.mkdirSync(path.dirname(EXCEL_EXPORT_PATH), { recursive: true });
  await workbook.xlsx.writeFile(EXCEL_EXPORT_PATH);
}
