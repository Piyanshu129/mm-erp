// GST on one invoice line. The line's amount is either before GST (GST is
// added on top) or already includes it (GST is taken out of it). Within the
// state the GST splits half CGST, half SGST; to another state it's all IGST.
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];

// SAC for "maintenance and repair services of motor vehicles".
export const LABOUR_SAC = "998714";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface GstLine {
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export function gstForLine(amount: number, rate: number, opts: { inclusive: boolean; inter: boolean }): GstLine {
  const taxable = r2(opts.inclusive ? amount / (1 + rate / 100) : amount);
  const tax = r2(opts.inclusive ? amount - taxable : (taxable * rate) / 100);
  const half = r2(tax / 2);
  return {
    taxable,
    rate,
    cgst: opts.inter ? 0 : half,
    sgst: opts.inter ? 0 : r2(tax - half),
    igst: opts.inter ? tax : 0,
    total: r2(taxable + tax),
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

// Whole rupees in words, Indian style (lakh, crore): 125000 → "One Lakh
// Twenty Five Thousand".
export function rupeesInWords(amount: number): string {
  let n = Math.round(amount);
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(" ");
}
