"use client";

// A 12-hour time picker (hour, minute, AM/PM). Reads and writes "HH:MM" in
// 24-hour form, which is how times are stored; only the display is 12-hour.
// Choosing "--" for the hour clears the time.

const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function split(value: string | null) {
  if (!value) return null;
  const h24 = Number(value.slice(0, 2));
  return { hour: h24 % 12 === 0 ? 12 : h24 % 12, minute: value.slice(3, 5), pm: h24 >= 12 };
}

function join(hour: number, minute: string, pm: boolean): string {
  const h24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${minute}`;
}

// "18:30" → "6:30 PM"
export function format12(value: string | null | undefined): string {
  const t = split(value ?? null);
  return t ? `${t.hour}:${t.minute} ${t.pm ? "PM" : "AM"}` : "";
}

export function TimeInput12({
  value,
  onChange,
  disabled,
  label,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  label: string;
}) {
  const t = split(value);
  const minutes = t && !MINUTES.includes(t.minute) ? [...MINUTES, t.minute].sort() : MINUTES;
  const cls = "rounded-md border border-gray-300 bg-white px-1 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400";

  return (
    <span className="inline-flex items-center gap-0.5" aria-label={label} role="group">
      <select
        aria-label={`${label} hour`}
        disabled={disabled}
        value={t ? String(t.hour) : ""}
        onChange={(e) => {
          if (!e.target.value) return onChange(null);
          const hour = Number(e.target.value);
          // A new time: morning for 7–11, afternoon/evening for 12–6.
          const pm = t ? t.pm : hour === 12 || hour <= 6;
          onChange(join(hour, t?.minute ?? "00", pm));
        }}
        className={cls}
      >
        <option value="">--</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-gray-400">:</span>
      <select
        aria-label={`${label} minute`}
        disabled={disabled || !t}
        value={t?.minute ?? "00"}
        onChange={(e) => t && onChange(join(t.hour, e.target.value, t.pm))}
        className={cls}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        aria-label={`${label} AM or PM`}
        disabled={disabled || !t}
        value={t?.pm ? "PM" : "AM"}
        onChange={(e) => t && onChange(join(t.hour, t.minute, e.target.value === "PM"))}
        className={cls}
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  );
}
