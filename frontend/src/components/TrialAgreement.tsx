// The vehicle trial & temporary handover undertaking the customer signs
// before taking the vehicle out on trial after the repair. What the system
// knows is filled in; the rest (signatures, times) is left as lines to fill
// by hand.

export interface TrialAgreementJobCard {
  jobCardNumber: string;
  kmAtService: number | null;
  trialBy?: string | null;
  vehicle: {
    registrationNumber: string;
    make: string;
    model: string;
    variant?: string | null;
    customer: { name: string; mobile: string };
  };
}

const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });

// A value written on its line, or an empty line to fill by hand.
function Fill({ value, wide }: { value?: string | number | null; wide?: boolean }) {
  const text = value == null || value === "" ? "" : String(value);
  return (
    <span className={`inline-block border-b border-gray-500 px-1 align-bottom ${wide ? "min-w-[16rem]" : "min-w-[10rem]"}`}>
      {text || " "}
    </span>
  );
}

function Row({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  return (
    <p className="leading-8">
      {label}: <Fill value={value} wide={wide} />
    </p>
  );
}

export function TrialAgreement({ jobCard, now = new Date() }: { jobCard: TrialAgreementJobCard; now?: Date }) {
  const { vehicle } = jobCard;
  const { customer } = vehicle;
  const model = [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(" ");

  return (
    <div className="space-y-4 text-[13px] leading-relaxed">
      <div className="border-b border-gray-300 pb-2 text-center">
        <p className="text-xl font-bold tracking-wide">MOTORS MiTRA</p>
        <p className="text-xs font-semibold tracking-widest text-gray-600">MULTIBRAND CAR WORKSHOP</p>
        <p className="mt-2 text-base font-bold">VEHICLE TRIAL &amp; TEMPORARY HANDOVER UNDERTAKING</p>
      </div>

      <div className="flex flex-wrap justify-between gap-x-6">
        <Row label="Job Card No." value={jobCard.jobCardNumber} />
        <Row label="Date" value={dateText(now)} />
      </div>

      <section>
        <p className="font-bold">1. CUSTOMER &amp; VEHICLE DETAILS</p>
        <Row label="Customer Name" value={customer.name} wide />
        <Row label="Mobile No." value={customer.mobile} />
        <Row label="Vehicle No." value={vehicle.registrationNumber} />
        <Row label="Vehicle Model" value={model} wide />
        <Row label="KM Reading" value={jobCard.kmAtService != null ? jobCard.kmAtService.toLocaleString("en-IN") : null} />
      </section>

      <section className="space-y-1.5">
        <p className="font-bold">2. CUSTOMER DECLARATION &amp; RESPONSIBILITY</p>
        <p>I voluntarily take my vehicle from Motors MiTRA for trial and inspection after repair.</p>
        <p>I agree that:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>I will return the vehicle within the agreed time and in the same condition as received.</li>
          <li>
            Any accident, damage, scratches, challan, theft or loss during my custody shall be my responsibility, subject to
            applicable law.
          </li>
          <li>I shall bear the reasonable repair costs for any damage caused during my custody.</li>
          <li>
            If I fail to return the vehicle on time without permission, Motors MiTRA has the right to take appropriate legal
            action and file a police complaint wherever legally justified.
          </li>
          <li>I accept full responsibility for the vehicle&apos;s safety and security until it is returned to the workshop.</li>
        </ul>
      </section>

      <section className="space-y-1.5">
        <p className="font-bold">3. CUSTOMER CONSENT &amp; SIGNATURES</p>
        <p>I have read and understood all the above conditions and accept them voluntarily.</p>
        <div className="pt-2">
          <Row label="Customer Signature" />
          <Row label="Workshop Representative" value={jobCard.trialBy} />
          <Row label="Vehicle Handover Time" />
          <Row label="Vehicle Return Time" />
        </div>
      </section>
    </div>
  );
}
