import { z } from "zod";

// Mobile numbers are stored as exactly 10 digits. Common ways of typing or
// pasting one are cleaned up first — spaces, dashes and brackets dropped,
// and a leading +91 / 91 country code or 0 trunk prefix removed — so
// "+91 98765-43210" and "09876543210" both become "9876543210".
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export const mobileSchema = z
  .string()
  .transform(normalizeMobile)
  .pipe(z.string().regex(/^\d{10}$/, "Mobile number must be 10 digits"));
