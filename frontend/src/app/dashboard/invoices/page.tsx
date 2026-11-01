"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Draft invoices are gone: a closed job card's estimate is the bill. Old
// links to this list land on the Estimates list.
export default function InvoicesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/estimates");
  }, [router]);
  return <p className="text-sm text-gray-500">Opening Estimates...</p>;
}
