// Pre-written WhatsApp messages. They're only a starting point — the
// WhatsAppMessage box lets staff edit them before sending.

function rupees(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function paymentReminder(d: {
  customerName: string;
  registrationNumber: string;
  vehicle: string;
  invoiceNumber: string;
  invoiceDate: string;
  total: number;
  paid: number;
  due: number;
}): string {
  const lines = [
    `Dear ${d.customerName},`,
    "",
    `Greetings from Motors Mitra. This is a gentle reminder about the payment pending for the service of your vehicle ${d.registrationNumber}${d.vehicle ? ` (${d.vehicle})` : ""}.`,
    "",
    `Invoice No.: ${d.invoiceNumber}`,
    `Invoice date: ${new Date(d.invoiceDate).toLocaleDateString("en-IN")}`,
    `Invoice amount: ${rupees(d.total)}`,
  ];
  if (d.paid > 0) lines.push(`Paid so far: ${rupees(d.paid)}`);
  lines.push(
    `Amount outstanding: ${rupees(d.due)}`,
    "",
    "We'd be grateful if you could clear the outstanding amount at your earliest convenience. If you have already paid, please ignore this message and accept our thanks.",
    "",
    "Thank you,",
    "Motors Mitra"
  );
  return lines.join("\n");
}

export function kmRequest(d: { customerName: string; registrationNumber: string; vehicle: string; lastKm: number | null }): string {
  return [
    `Dear ${d.customerName},`,
    "",
    `Greetings from Motors Mitra. To plan the next service for your vehicle ${d.registrationNumber}${d.vehicle ? ` (${d.vehicle})` : ""} on time, could you please share its current odometer (KM) reading?`,
    d.lastKm != null ? `The last reading we have is ${d.lastKm.toLocaleString("en-IN")} km.` : "",
    "",
    "A photo of the dashboard showing the KM is perfect too.",
    "",
    "Thank you,",
    "Motors Mitra",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");
}
