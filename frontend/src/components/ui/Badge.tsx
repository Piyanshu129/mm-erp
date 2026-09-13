const TONES = {
  gray: "bg-gray-100 text-gray-700",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  purple: "bg-purple-50 text-purple-700",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const JOB_CARD_STATUS_TONE: Record<string, BadgeTone> = {
  DRAFT: "gray",
  VEHICLE_RECEIVED: "blue",
  WORK_STARTED: "blue",
  WAITING_FOR_PARTS: "amber",
  WORK_IN_PROGRESS: "blue",
  COMPLETED: "green",
  INVOICED: "purple",
  CLOSED: "gray",
  CANCELLED: "red",
};

export function JobCardStatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={JOB_CARD_STATUS_TONE[status] ?? "gray"}>{label}</Badge>;
}

export function StockStatusBadge({
  currentStock,
  minStock,
}: {
  currentStock: number;
  minStock: number;
}) {
  if (currentStock <= 0) return <Badge tone="red">Out of stock</Badge>;
  if (currentStock <= minStock) return <Badge tone="amber">Low stock</Badge>;
  return <Badge tone="green">In stock</Badge>;
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Disabled</Badge>;
}
