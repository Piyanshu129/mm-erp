import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { stickerLabel } from "./itemCode";

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
      { header: "Next Service Due", key: "nextServiceDue", width: 16 },
      { header: "Next Service KM", key: "nextServiceKm", width: 14 },
      { header: "RC Photo", key: "rcPhotoUrl", width: 22 },
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
  const [items, purchased] = await Promise.all([
    prisma.item.findMany({ orderBy: { id: "asc" } }),
    prisma.purchase.groupBy({ by: ["itemId"], where: { itemId: { not: null } }, _sum: { quantity: true } }),
  ]);
  const purchasedQty = new Map(purchased.map((p) => [p.itemId, p._sum.quantity ?? 0]));
  return {
    name: "Items",
    columns: [
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Name", key: "name", width: 22 },
      { header: "Category", key: "category", width: 12 },
      { header: "Part Number", key: "partNumber", width: 16 },
      { header: "Brand", key: "brand", width: 14 },
      { header: "Specification", key: "specification", width: 18 },
      { header: "UOM", key: "uom", width: 8 },
      { header: "Purchase Cost", key: "purchaseCost", width: 14 },
      { header: "MRP", key: "sellingPrice", width: 14 },
      { header: "Min Stock", key: "minStock", width: 10 },
      { header: "Purchased Qty", key: "purchasedQty", width: 12 },
      { header: "Available Qty", key: "currentStock", width: 12 },
      { header: "Active", key: "isActive", width: 10 },
      { header: "Created", key: "createdAt", width: 20 },
    ],
    rows: items.map((i) => ({
      ...i,
      purchasedQty: purchasedQty.get(i.id) ?? 0,
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
      { header: "Stickers", key: "stickers", width: 14 },
      { header: "Rate (per unit)", key: "purchaseCost", width: 14 },
      { header: "Total", key: "total", width: 14 },
      { header: "MRP", key: "sellingPrice", width: 14 },
      { header: "Bill", key: "billUrl", width: 22 },
      { header: "Remarks", key: "remarks", width: 20 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: purchases.map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate,
      supplierName: p.supplier?.name ?? "",
      itemType: p.itemType,
      itemCode: p.item?.itemCode ?? "",
      itemName: p.item?.name ?? p.description ?? "",
      quantity: p.quantity,
      stickers:
        p.item && p.stickerFrom != null && p.stickerTo != null
          ? `${stickerLabel(p.item.itemCode, p.stickerFrom)} – ${stickerLabel(p.item.itemCode, p.stickerTo)}`
          : "",
      purchaseCost: n(p.purchaseCost),
      total: p.quantity * Number(p.purchaseCost),
      sellingPrice: n(p.sellingPrice),
      billUrl: p.billUrl,
      remarks: p.remarks,
      createdByName: p.createdBy.name,
    })),
  };
}

async function supplierPaymentsSheet(): Promise<SheetSpec> {
  const payments = await prisma.supplierPayment.findMany({
    include: { supplier: true, createdBy: true },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
  });
  return {
    name: "Supplier Payments",
    columns: [
      { header: "Date", key: "paymentDate", width: 18 },
      { header: "Supplier", key: "supplierName", width: 22 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Discount", key: "discount", width: 12 },
      { header: "Payment Mode", key: "paymentMode", width: 14 },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Paid By", key: "paidBy", width: 16 },
      { header: "Transaction Photo", key: "proofUrl", width: 24 },
      { header: "Notes", key: "notes", width: 28 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: payments.map((sp) => ({
      paymentDate: sp.paymentDate,
      supplierName: sp.supplier.name,
      amount: n(sp.amount),
      discount: n(sp.discount),
      paymentMode: sp.paymentMode,
      reference: sp.reference,
      paidBy: sp.paidBy,
      proofUrl: sp.proofUrl,
      notes: sp.notes,
      createdByName: sp.createdBy.name,
    })),
  };
}

// One row per estimate line, with its estimate's header details repeated.
async function estimatesSheet(): Promise<SheetSpec> {
  const lines = await prisma.estimateLine.findMany({
    include: { item: true, estimate: { include: { jobCard: { include: { vehicle: { include: { customer: true } } } } } } },
    orderBy: [{ estimateId: "asc" }, { id: "asc" }],
  });
  return {
    name: "Estimates",
    columns: [
      { header: "Estimate No.", key: "estimateNumber", width: 14 },
      { header: "Date", key: "estimateDate", width: 18 },
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Customer", key: "customerName", width: 20 },
      { header: "Status", key: "status", width: 10 },
      { header: "Approved At", key: "approvedAt", width: 18 },
      { header: "Approval Photo", key: "approvalPhotoUrl", width: 24 },
      { header: "Tax %", key: "taxRate", width: 8 },
      { header: "Line Type", key: "lineType", width: 10 },
      { header: "Item Code", key: "itemCode", width: 12 },
      { header: "Description", key: "description", width: 26 },
      { header: "Qty", key: "quantity", width: 8 },
      { header: "Rate", key: "rate", width: 12 },
      { header: "Amount", key: "amount", width: 12 },
    ],
    rows: lines.map((l) => ({
      estimateNumber: l.estimate.estimateNumber,
      estimateDate: l.estimate.estimateDate,
      jobCardNumber: l.estimate.jobCard.jobCardNumber,
      vehicleRegistration: l.estimate.jobCard.vehicle.registrationNumber,
      customerName: l.estimate.jobCard.vehicle.customer.name,
      status: l.estimate.status,
      approvedAt: l.estimate.approvedAt,
      approvalPhotoUrl: l.estimate.approvalPhotoUrl,
      taxRate: n(l.estimate.taxRate),
      lineType: l.lineType,
      itemCode: l.item?.itemCode ?? "",
      description: l.description,
      quantity: l.quantity,
      rate: n(l.rate),
      amount: n(l.amount),
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
    include: { jobCard: true, item: true, createdBy: true },
    orderBy: { id: "asc" },
  });
  return {
    name: "Job Card Parts",
    columns: [
      { header: "Job Card No.", key: "jobCardNumber", width: 14 },
      { header: "Item Code", key: "itemCode", width: 14 },
      { header: "Item Name", key: "itemName", width: 22 },
      { header: "Qty Used", key: "quantity", width: 10 },
      { header: "Rate", key: "rate", width: 12 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Issued By", key: "createdByName", width: 16 },
      { header: "Date", key: "createdAt", width: 20 },
    ],
    rows: parts.map((p) => ({
      jobCardNumber: p.jobCard.jobCardNumber,
      itemCode: p.item?.itemCode ?? "Not in inventory",
      itemName: p.item?.name ?? p.description ?? "",
      quantity: p.quantity,
      rate: n(p.rate),
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
      { header: "Due", key: "due", width: 12 },
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
      due: Number(inv.totalAmount) - Number(inv.paymentAmount),
      createdByName: inv.createdBy.name,
    })),
  };
}

async function invoicePaymentsSheet(): Promise<SheetSpec> {
  const payments = await prisma.invoicePayment.findMany({
    include: {
      invoice: { include: { jobCard: { include: { vehicle: { include: { customer: true } } } } } },
      createdBy: true,
    },
    orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
  });
  return {
    name: "Invoice Payments",
    columns: [
      { header: "Date", key: "paymentDate", width: 18 },
      { header: "Invoice No.", key: "invoiceNumber", width: 14 },
      { header: "Vehicle", key: "vehicleRegistration", width: 16 },
      { header: "Customer", key: "customerName", width: 20 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Discount", key: "discount", width: 12 },
      { header: "Payment Mode", key: "paymentMode", width: 14 },
      { header: "Reference", key: "reference", width: 18 },
      { header: "Received By", key: "receivedBy", width: 16 },
      { header: "Notes", key: "notes", width: 26 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: payments.map((p) => ({
      paymentDate: p.paymentDate,
      invoiceNumber: p.invoice.invoiceNumber,
      vehicleRegistration: p.invoice.jobCard.vehicle.registrationNumber,
      customerName: p.invoice.jobCard.vehicle.customer.name,
      amount: n(p.amount),
      discount: n(p.discount),
      paymentMode: p.paymentMode,
      reference: p.reference,
      receivedBy: p.receivedBy,
      notes: p.notes,
      createdByName: p.createdBy.name,
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
      { header: "In Time", key: "inTime", width: 10 },
      { header: "Out Time", key: "outTime", width: 10 },
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
      inTime: a.inTime,
      outTime: a.outTime,
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
      { header: "Half Days", key: "halfDays", width: 10 },
      { header: "Absent Days", key: "absentDays", width: 12 },
      { header: "Leave Days", key: "leaveDays", width: 12 },
      { header: "Leave Carried In", key: "openingLeaveBalance", width: 14 },
      { header: "Leave Carried Out", key: "closingLeaveBalance", width: 14 },
      { header: "Gross Salary", key: "grossSalary", width: 14 },
      { header: "Advance Deducted", key: "advanceDeduction", width: 16 },
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
      halfDays: s.halfDays,
      absentDays: s.absentDays,
      leaveDays: s.leaveDays,
      openingLeaveBalance: n(s.openingLeaveBalance),
      closingLeaveBalance: n(s.closingLeaveBalance),
      grossSalary: n(s.grossSalary),
      advanceDeduction: n(s.advanceDeduction),
      netSalary: n(s.netSalary),
      paymentAmount: n(s.paymentAmount),
      paymentDate: s.paymentDate,
      paymentMode: s.paymentMode,
      paymentBy: s.paymentBy,
    })),
  };
}

async function employeeAdvancesSheet(): Promise<SheetSpec> {
  const advances = await prisma.employeeAdvance.findMany({
    include: { employee: true, createdBy: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  return {
    name: "Employee Advances",
    columns: [
      { header: "Date Given", key: "date", width: 14 },
      { header: "Employee", key: "employeeName", width: 22 },
      { header: "Amount", key: "amount", width: 12 },
      { header: "Deducted From (Month)", key: "salaryMonth", width: 20 },
      { header: "Notes", key: "notes", width: 24 },
      { header: "Entered By", key: "createdByName", width: 16 },
    ],
    rows: advances.map((a) => ({
      date: a.date,
      employeeName: a.employee.name,
      amount: n(a.amount),
      salaryMonth: `${a.salaryYear}-${String(a.salaryMonth).padStart(2, "0")}`,
      notes: a.notes,
      createdByName: a.createdBy.name,
    })),
  };
}

// The audit trail of admin edits/deletions of recorded payments.
async function paymentAuditsSheet(): Promise<SheetSpec> {
  const audits = await prisma.paymentAudit.findMany({ include: { changedBy: true }, orderBy: { changedAt: "asc" } });
  const fmt = (v: unknown) => {
    if (!v || typeof v !== "object") return "";
    const o = v as Record<string, unknown>;
    return Object.entries(o)
      .map(([k, val]) => `${k}: ${val ?? "-"}`)
      .join("; ");
  };
  return {
    name: "Payment Changes",
    columns: [
      { header: "When", key: "changedAt", width: 20 },
      { header: "By", key: "changedBy", width: 16 },
      { header: "Payment Type", key: "paymentKind", width: 14 },
      { header: "Payment No.", key: "paymentId", width: 12 },
      { header: "Draft Invoice ID", key: "invoiceId", width: 14 },
      { header: "Supplier ID", key: "supplierId", width: 12 },
      { header: "Action", key: "action", width: 10 },
      { header: "Before", key: "before", width: 60 },
      { header: "After", key: "after", width: 60 },
    ],
    rows: audits.map((a) => ({
      changedAt: a.changedAt,
      changedBy: a.changedBy.name,
      paymentKind: a.paymentKind === "INVOICE" ? "Customer" : "Supplier",
      paymentId: a.paymentId,
      invoiceId: a.invoiceId,
      supplierId: a.supplierId,
      action: a.action,
      before: fmt(a.before),
      after: fmt(a.after),
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
    supplierPaymentsSheet(),
    jobCardsSheet(),
    estimatesSheet(),
    jobCardPartsSheet(),
    jobCardLabourSheet(),
    invoicesSheet(),
    invoicePaymentsSheet(),
    employeesSheet(),
    attendanceSheet(),
    salaryPaymentsSheet(),
    employeeAdvancesSheet(),
    paymentAuditsSheet(),
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
