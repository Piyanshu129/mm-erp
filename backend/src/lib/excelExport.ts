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
      { header: "Item Type", key: "itemType", width: 14 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item/Expense", key: "itemName", width: 22 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Purchase Cost", key: "purchaseCost", width: 14 },
      { header: "Selling Price", key: "sellingPrice", width: 14 },
      { header: "Bill", key: "billUrl", width: 22 },
      { header: "Paid", key: "paymentAmount", width: 12 },
      { header: "Payment Mode", key: "paymentMode", width: 14 },
      { header: "Payment Ref.", key: "paymentReference", width: 16 },
      { header: "Paid By", key: "paymentBy", width: 16 },
      { header: "Payment Date", key: "paymentDate", width: 18 },
      { header: "Remarks", key: "remarks", width: 20 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: purchases.map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate,
      supplierName: p.supplier.name,
      itemType: p.itemType,
      itemCode: p.item?.itemCode ?? "",
      itemName: p.item?.name ?? p.description ?? "",
      quantity: p.quantity,
      purchaseCost: n(p.purchaseCost),
      sellingPrice: n(p.sellingPrice),
      billUrl: p.billUrl,
      paymentAmount: n(p.paymentAmount),
      paymentMode: p.paymentMode,
      paymentReference: p.paymentReference,
      paymentBy: p.paymentBy,
      paymentDate: p.paymentDate,
      remarks: p.remarks,
      createdByName: p.createdBy.name,
    })),
  };
}

// Every physical unit's full trail: which purchase it came from, its
// current status, and (once issued) which job card/vehicle it went to.
// This is the direct replacement for the old aggregate Stock Ledger sheet.
async function itemUnitsSheet(): Promise<SheetSpec> {
  const units = await prisma.itemUnit.findMany({
    include: {
      item: true,
      purchase: { include: { supplier: true } },
      jobCardPart: { include: { jobCard: { include: { vehicle: true } } } },
    },
    orderBy: { id: "asc" },
  });
  return {
    name: "Item Units",
    columns: [
      { header: "Serial No.", key: "id", width: 12 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Status", key: "status", width: 10 },
      { header: "Purchase Serial No.", key: "purchaseId", width: 16 },
      { header: "Supplier", key: "supplierName", width: 20 },
      { header: "Issued To Job Card", key: "jobCardNumber", width: 16 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Purchased On", key: "createdAt", width: 20 },
    ],
    rows: units.map((u) => ({
      id: u.id,
      itemCode: u.item.itemCode,
      itemName: u.item.name,
      status: u.status,
      purchaseId: u.purchaseId,
      supplierName: u.purchase.supplier.name,
      jobCardNumber: u.jobCardPart?.jobCard.jobCardNumber ?? "",
      vehicleRegistration: u.jobCardPart?.jobCard.vehicle.registrationNumber ?? "",
      createdAt: u.createdAt,
    })),
  };
}

async function jobCardsSheet(): Promise<SheetSpec> {
  const jobCards = await prisma.jobCard.findMany({
    include: { vehicle: { include: { customer: true } }, createdBy: true, assignedEmployee: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Cards",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Job Type", key: "jobType", width: 16 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Customer", key: "customerName", width: 20 },
      { header: "KM", key: "kmAtService", width: 10 },
      { header: "Complaint", key: "complaint", width: 26 },
      { header: "Required Work", key: "requiredWork", width: 26 },
      { header: "Expected Delivery", key: "expectedDelivery", width: 18 },
      { header: "Inspection Findings", key: "inspectionFindings", width: 26 },
      { header: "Estimate Amount", key: "estimateAmount", width: 14 },
      { header: "Estimate Approved", key: "estimateApproved", width: 14 },
      { header: "Assigned To", key: "assignedEmployeeName", width: 18 },
      { header: "Final Inspection", key: "finalInspectionStatus", width: 14 },
      { header: "Final Inspection By", key: "finalInspectionBy", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Delivered At", key: "deliveredAt", width: 18 },
      { header: "Created By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: jobCards.map((jc) => ({
      jobCardNumber: jc.jobCardNumber,
      jobType: jc.jobType,
      vehicleRegistration: jc.vehicle.registrationNumber,
      customerName: jc.vehicle.customer.name,
      kmAtService: jc.kmAtService,
      complaint: jc.complaint,
      requiredWork: jc.requiredWork,
      expectedDelivery: jc.expectedDelivery,
      inspectionFindings: jc.inspectionFindings,
      estimateAmount: n(jc.estimateAmount),
      estimateApproved: jc.estimateApproved == null ? "" : jc.estimateApproved ? "Yes" : "No",
      assignedEmployeeName: jc.assignedEmployee?.name ?? "",
      finalInspectionStatus: jc.finalInspectionStatus,
      finalInspectionBy: jc.finalInspectionBy,
      status: jc.status,
      deliveredAt: jc.deliveredAt,
      createdByName: jc.createdBy.name,
      createdAt: jc.createdAt,
    })),
  };
}

async function jobCardPartsSheet(): Promise<SheetSpec> {
  const parts = await prisma.jobCardPart.findMany({
    include: { jobCard: true, item: true, itemUnit: true, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Card Parts",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Serial No.", key: "itemUnitId", width: 12 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Issued By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: parts.map((p) => ({
      jobCardNumber: p.jobCard.jobCardNumber,
      itemCode: p.item.itemCode,
      itemName: p.item.name,
      itemUnitId: p.itemUnitId,
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
      { header: "Paid", key: "paymentAmount", width: 12 },
      { header: "Payment Mode", key: "paymentMode", width: 14 },
      { header: "Payment Ref.", key: "paymentReference", width: 16 },
      { header: "Received By", key: "paymentReceivedBy", width: 16 },
      { header: "Payment Date", key: "paymentDate", width: 18 },
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
      paymentAmount: n(inv.paymentAmount),
      paymentMode: inv.paymentMode,
      paymentReference: inv.paymentReference,
      paymentReceivedBy: inv.paymentReceivedBy,
      paymentDate: inv.paymentDate,
      createdByName: inv.createdBy.name,
    })),
  };
}

async function employeesSheet(): Promise<SheetSpec> {
  const employees = await prisma.employee.findMany({ orderBy: { id: "asc" } });
  return {
    name: "Employees",
    columns: [
      { header: "ID", key: "id", width: 8 },
      { header: "Name", key: "name", width: 22 },
      { header: "Role", key: "role", width: 16 },
      { header: "Email", key: "email", width: 24 },
      { header: "Mobile", key: "mobile", width: 15 },
      { header: "Portal Access", key: "hasPortalAccess", width: 14 },
      { header: "Joining Date", key: "joiningDate", width: 16 },
      { header: "Monthly Salary", key: "monthlySalary", width: 14 },
      { header: "Monthly Leave Allowance", key: "monthlyLeaveAllowance", width: 18 },
      { header: "Active", key: "isActive", width: 10 },
    ],
    // passwordHash is deliberately left off the declared columns above —
    // exceljs only writes keys that appear in `columns`, so spreading the
    // full row here never leaks the hash into the sheet.
    rows: employees.map((e) => ({
      ...e,
      monthlySalary: n(e.monthlySalary),
      hasPortalAccess: e.passwordHash != null ? "Yes" : "No",
    })),
  };
}

async function attendanceSheet(): Promise<SheetSpec> {
  const rows = await prisma.attendance.findMany({
    include: { employee: true, correctedBy: true },
    orderBy: [{ date: "asc" }, { employeeId: "asc" }],
  });
  return {
    name: "Attendance",
    columns: [
      { header: "Date", key: "date", width: 14 },
      { header: "Employee", key: "employeeName", width: 22 },
      { header: "Status", key: "status", width: 12 },
      { header: "Marked By", key: "markedBy", width: 12 },
      { header: "Punched At", key: "punchedAt", width: 20 },
      { header: "Latitude", key: "latitude", width: 12 },
      { header: "Longitude", key: "longitude", width: 12 },
      { header: "Selfie", key: "selfieUrl", width: 22 },
      { header: "Corrected By", key: "correctedByName", width: 16 },
    ],
    rows: rows.map((a) => ({
      date: a.date,
      employeeName: a.employee.name,
      status: a.status,
      markedBy: a.markedBy,
      punchedAt: a.punchedAt,
      latitude: n(a.latitude),
      longitude: n(a.longitude),
      selfieUrl: a.selfieUrl,
      correctedByName: a.correctedBy?.name ?? "",
    })),
  };
}

async function salaryPaymentsSheet(): Promise<SheetSpec> {
  const payments = await prisma.salaryPayment.findMany({
    include: { employee: true },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }, { employeeId: "asc" }],
  });
  return {
    name: "Salary Payments",
    columns: [
      { header: "Employee", key: "employeeName", width: 22 },
      { header: "Month", key: "periodMonth", width: 8 },
      { header: "Year", key: "periodYear", width: 8 },
      { header: "Present Days", key: "presentDays", width: 12 },
      { header: "Absent Days", key: "absentDays", width: 12 },
      { header: "Leave Days", key: "leaveDays", width: 12 },
      { header: "Gross Salary", key: "grossSalary", width: 14 },
      { header: "Net Salary", key: "netSalary", width: 14 },
      { header: "Paid", key: "paymentAmount", width: 12 },
      { header: "Payment Date", key: "paymentDate", width: 18 },
      { header: "Payment Mode", key: "paymentMode", width: 14 },
      { header: "Paid By", key: "paymentBy", width: 16 },
    ],
    rows: payments.map((s) => ({
      employeeName: s.employee.name,
      periodMonth: s.periodMonth,
      periodYear: s.periodYear,
      presentDays: s.presentDays,
      absentDays: s.absentDays,
      leaveDays: s.leaveDays,
      grossSalary: n(s.grossSalary),
      netSalary: n(s.netSalary),
      paymentAmount: n(s.paymentAmount),
      paymentDate: s.paymentDate,
      paymentMode: s.paymentMode,
      paymentBy: s.paymentBy,
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
    itemUnitsSheet(),
    jobCardsSheet(),
    jobCardPartsSheet(),
    jobCardLabourSheet(),
    invoicesSheet(),
    employeesSheet(),
    attendanceSheet(),
    salaryPaymentsSheet(),
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
