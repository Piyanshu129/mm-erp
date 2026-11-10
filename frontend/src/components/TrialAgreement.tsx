// The vehicle trial agreement — "वाहन ट्रायल अनुमति एवं अस्थायी सुपुर्दगी पत्र"
// (trial permission and temporary handover letter) the customer signs before
// taking the vehicle out on trial after the repair. What the system knows is
// filled in; the rest (times, signatures) is left as lines to fill by hand.

export const FUEL_LEVELS: { value: string; label: string }[] = [
  { value: "Reserve", label: "रिज़र्व (Reserve)" },
  { value: "1/4", label: "1/4" },
  { value: "1/2", label: "1/2" },
  { value: "3/4", label: "3/4" },
  { value: "Full", label: "फुल टैंक (Full)" },
];

export interface TrialAgreementJobCard {
  jobCardNumber: string;
  kmAtService: number | null;
  trialBy?: string | null;
  trialFuelLevel?: string | null;
  trialArea?: string | null;
  trialReturnBy?: string | null;
  vehicle: {
    registrationNumber: string;
    make: string;
    model: string;
    variant?: string | null;
    customer: { name: string; mobile: string; address?: string | null };
  };
}

const dateText = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
const timeText = (d: Date) => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

// A value written on its line, or an empty line to fill by hand.
function Fill({ value, wide }: { value?: string | number | null; wide?: boolean }) {
  const text = value == null || value === "" ? "" : String(value);
  return (
    <span className={`inline-block border-b border-gray-500 px-1 align-bottom ${wide ? "min-w-[16rem]" : "min-w-[9rem]"}`}>
      {text || " "}
    </span>
  );
}

function Row({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  return (
    <p className="leading-7">
      {label}: <Fill value={value} wide={wide} />
    </p>
  );
}

export function TrialAgreement({ jobCard, now = new Date() }: { jobCard: TrialAgreementJobCard; now?: Date }) {
  const { vehicle } = jobCard;
  const { customer } = vehicle;
  const returnBy = jobCard.trialReturnBy ? new Date(jobCard.trialReturnBy) : null;
  const fuel = FUEL_LEVELS.find((f) => f.value === jobCard.trialFuelLevel)?.label ?? jobCard.trialFuelLevel;
  const model = [vehicle.make, vehicle.model, vehicle.variant].filter(Boolean).join(" ");

  return (
    <div className="space-y-3 text-[13px] leading-relaxed" style={{ fontFamily: '"Nirmala UI", "Noto Sans Devanagari", Mangal, sans-serif' }}>
      <div className="border-b border-gray-300 pb-2 text-center">
        <p className="text-xl font-bold tracking-wide">MOTORS MiTRA</p>
        <p className="text-xs font-semibold tracking-widest text-gray-600">MULTIBRAND CAR WORKSHOP</p>
        <p className="mt-2 text-base font-bold">वाहन ट्रायल अनुमति एवं अस्थायी सुपुर्दगी पत्र</p>
      </div>

      <div className="flex flex-wrap justify-between gap-x-6">
        <Row label="जॉब कार्ड संख्या" value={jobCard.jobCardNumber} />
        <p className="leading-7">
          दिनांक: <Fill value={dateText(now)} /> समय: <Fill />
        </p>
      </div>

      <section>
        <p className="font-bold">1. ग्राहक एवं वाहन का विवरण</p>
        <Row label="ग्राहक का नाम" value={customer.name} wide />
        <Row label="मोबाइल नंबर" value={customer.mobile} />
        <Row label="पूरा पता" value={customer.address} wide />
        <Row label="वाहन रजिस्ट्रेशन नंबर" value={vehicle.registrationNumber} />
        <Row label="वाहन का मॉडल" value={model} wide />
        <Row label="वर्तमान किलोमीटर रीडिंग" value={jobCard.kmAtService != null ? jobCard.kmAtService.toLocaleString("en-IN") : null} />
        <Row label="ईंधन स्तर" value={fuel} />
      </section>

      <section className="space-y-1.5">
        <p className="font-bold">2. वाहन ट्रायल हेतु सहमति एवं घोषणा</p>
        <p>
          मैं, उपरोक्त नामित ग्राहक, अपनी स्वेच्छा से अपना वाहन Motors MiTRA वर्कशॉप से मरम्मत कार्य के पश्चात ट्रायल एवं जांच के
          उद्देश्य से अस्थायी रूप से अपने कब्जे में ले रहा/रही हूँ।
        </p>
        <p>मैं निम्नलिखित शर्तों से सहमत हूँ:</p>
        <ol className="list-decimal space-y-1 pl-6">
          <li>मैं वाहन को केवल मरम्मत कार्य की जांच एवं ट्रायल के उद्देश्य से ले जा रहा/रही हूँ।</li>
          <li>मैं निर्धारित समय के भीतर वाहन को सुरक्षित अवस्था में Motors MiTRA वर्कशॉप में वापस जमा करवाऊंगा/करवाऊंगी।</li>
          <li>
            मैं बिना वर्कशॉप की पूर्व अनुमति के वाहन को किसी अन्य व्यक्ति को नहीं सौंपूंगा/सौंपूंगी और न ही वाहन का विक्रय, हस्तांतरण
            या अन्य किसी प्रकार से दुरुपयोग करूंगा/करूंगी।
          </li>
          <li>मैं निर्धारित ट्रायल क्षेत्र एवं मार्ग से बाहर वाहन नहीं ले जाऊंगा/जाऊंगी।</li>
          <li>
            वाहन मेरे कब्जे में रहने के दौरान किसी दुर्घटना, क्षति, चालान या अन्य घटना की स्थिति में तत्काल वर्कशॉप को सूचित
            करूंगा/करूंगी। मेरी जिम्मेदारी लागू कानून एवं वास्तविक परिस्थितियों के अनुसार निर्धारित होगी।
          </li>
          <li>
            मैं निर्धारित समय से अधिक वाहन अपने पास नहीं रखूंगा/रखूंगी। अतिरिक्त समय की आवश्यकता होने पर पहले वर्कशॉप से लिखित
            अनुमति लूंगा/लूंगी।
          </li>
        </ol>
      </section>

      <section>
        <p className="font-bold">3. वाहन वापस जमा करने का विवरण</p>
        <Row label="वाहन ले जाने की तारीख" value={dateText(now)} />
        <Row label="वाहन वापस करने की तारीख" value={returnBy ? dateText(returnBy) : null} />
        <Row label="निर्धारित वापसी का समय" value={returnBy ? timeText(returnBy) : null} />
        <Row label="ट्रायल का निर्धारित क्षेत्र" value={jobCard.trialArea} wide />
      </section>

      <section className="space-y-1.5">
        <p className="font-bold">4. वाहन वापस न करने की स्थिति में कानूनी कार्रवाई</p>
        <p>
          यदि मैं बिना पूर्व अनुमति के निर्धारित समय पर वाहन वापस जमा नहीं करता/करती हूँ, अथवा वाहन को जानबूझकर अपने पास
          रखता/रखती हूँ या इस सुपुर्दगी की शर्तों का बेईमानी से उल्लंघन करता/करती हूँ, तो Motors MiTRA को मेरे विरुद्ध उचित
          कानूनी कार्रवाई करने, पुलिस में शिकायत दर्ज कराने तथा आवश्यकतानुसार सक्षम न्यायालय में कार्यवाही करने का अधिकार होगा।
        </p>
        <p>
          मैं यह घोषणा करता/करती हूँ कि मैंने इस पत्र की सभी शर्तों को पढ़ और समझ लिया है तथा अपनी स्वेच्छा से उनका पालन करने के
          लिए सहमत हूँ।
        </p>
      </section>

      <section>
        <p className="font-bold">5. हस्ताक्षर एवं सुपुर्दगी</p>
        <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <Row label="ग्राहक के हस्ताक्षर" />
            <Row label="ग्राहक का नाम" value={customer.name} />
            <Row label="मोबाइल नंबर" value={customer.mobile} />
          </div>
          <div>
            <Row label="वर्कशॉप प्रतिनिधि के हस्ताक्षर" />
            {jobCard.trialBy && <p className="-mt-1 text-xs text-gray-600">({jobCard.trialBy})</p>}
            <Row label="वाहन सुपुर्दगी का समय" />
            <Row label="वाहन वापस प्राप्ति का समय" />
          </div>
        </div>
      </section>
    </div>
  );
}
