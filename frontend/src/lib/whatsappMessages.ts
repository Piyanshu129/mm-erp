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
  // Kept short on purpose: greeting, the vehicle, and just the three amounts
  // — in English, then the same in Hindi.
  const vehicle = `${d.registrationNumber}${d.vehicle ? ` (${d.vehicle})` : ""}`;
  return [
    `Dear ${d.customerName} Ji,`,
    "",
    `Greetings from Motors Mitra. This is a gentle reminder about the payment pending for the service of your vehicle ${vehicle}.`,
    "",
    `Total Amount: ${rupees(d.total)}`,
    `Paid Amount: ${rupees(d.paid)}`,
    `Balance Outstanding: ${rupees(d.due)}`,
    "",
    "We'd be grateful if you could clear the balance at your earliest convenience.",
    "",
    "Thank you,",
    "Motors Mitra",
    "",
    "------------------------------",
    "",
    `आदरणीय ${d.customerName} जी,`,
    "",
    `Motors Mitra की ओर से नमस्कार। आपके वाहन ${vehicle} की सर्विस का भुगतान अभी बाकी है। यह एक विनम्र अनुस्मारक है।`,
    "",
    `कुल राशि: ${rupees(d.total)}`,
    `जमा राशि: ${rupees(d.paid)}`,
    `बकाया राशि: ${rupees(d.due)}`,
    "",
    "कृपया अपनी सुविधा अनुसार जल्द से जल्द बकाया राशि का भुगतान करें।",
    "",
    "धन्यवाद,",
    "Motors Mitra",
  ].join("\n");
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
