import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validateBody } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";

// The workshop's business details, printed on GST invoices. Anyone signed
// in can read them (to print an invoice); only an admin can change them.
export const BUSINESS_KEYS = ["businessName", "address", "phone", "email", "gstin", "state", "stateCode"] as const;
type BusinessKey = (typeof BUSINESS_KEYS)[number];

export async function getBusinessDetails(): Promise<Record<BusinessKey, string>> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: BUSINESS_KEYS.map((k) => `business.${k}`) } } });
  const byKey = new Map(rows.map((r) => [r.key.replace("business.", ""), r.value]));
  return Object.fromEntries(BUSINESS_KEYS.map((k) => [k, byKey.get(k) ?? (k === "businessName" ? "Motors Mitra" : "")])) as Record<
    BusinessKey,
    string
  >;
}

const businessSchema = z.object({
  businessName: z.string().trim().min(1, "Enter the business name").max(120),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[0-9]{2}[A-Z0-9]{13}$/.test(v), "GSTIN must be 15 characters, starting with the 2-digit state code")
    .default(""),
  state: z.string().trim().max(60).default(""),
  stateCode: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[0-9]{2}$/.test(v), "State code is 2 digits, e.g. 06 for Haryana")
    .default(""),
});

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get(
  "/business",
  asyncHandler(async (_req, res) => {
    res.json({ business: await getBusinessDetails() });
  })
);

settingsRouter.put(
  "/business",
  authorize("ADMIN"),
  validateBody(businessSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof businessSchema>;
    await prisma.$transaction(
      BUSINESS_KEYS.map((k) =>
        prisma.appSetting.upsert({
          where: { key: `business.${k}` },
          create: { key: `business.${k}`, value: input[k] ?? "" },
          update: { value: input[k] ?? "" },
        })
      )
    );
    res.json({ business: await getBusinessDetails() });
  })
);
