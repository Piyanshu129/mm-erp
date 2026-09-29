"use client";

import { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/Input";

// Mirrors backend/src/lib/phone.ts: keep digits only, dropping a leading
// +91 / 91 country code or 0 trunk prefix, so a pasted "+91 98765-43210"
// becomes "9876543210".
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

// A 10-digit mobile number box. Only digits can be entered, it stops at 10,
// and the browser refuses to submit the form with fewer than 10 (when
// something has been typed; add `required` to make it mandatory).
export function MobileInput({
  value,
  onChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      pattern="[0-9]{10}"
      title="10-digit mobile number"
      placeholder="10-digit mobile number"
      {...props}
      value={value}
      onChange={(e) => onChange(normalizeMobile(e.target.value))}
    />
  );
}
