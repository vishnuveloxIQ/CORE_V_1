import type { PolicyData, PolicyKey } from "@/modules/core-data";
import { weekOffText } from "@/modules/core-data";
import type { IconName } from "@/shared/ui/icons";
import { money } from "@/shared/lib/format";

export const POLICY_META: Record<
  PolicyKey,
  { title: string; desc: string; icon: IconName }
> = {
  rules: {
    title: "Rules and regulations",
    desc: "Company rules people must read.",
    icon: "book",
  },
  "payment-threshold": {
    title: "Payment threshold",
    desc: "PMS handles payments below the limit, while Head Office approves and processes payments above the limit.",
    icon: "rupee",
  },
  holidays: {
    title: "Holiday policy",
    desc: "Company holiday calendar with per-project variants.",
    icon: "calendar",
  },
  shifts: {
    title: "Shift count",
    desc: "Number of shifts per day.",
    icon: "clock",
  },
  leave: {
    title: "Leave policy",
    desc: "Leave types, carry-forward and expiry, subject to law.",
    icon: "leaveCalendar",
  },
  overtime: {
    title: "Overtime policy",
    desc: "Overtime, rates and caps.",
    icon: "timer",
  },
};

export const POLICY_KEYS = Object.keys(POLICY_META) as PolicyKey[];
export const isPolicyKey = (k: string): k is PolicyKey => k in POLICY_META;

export function summarize<K extends PolicyKey>(
  key: K,
  data: PolicyData[K],
): string {
  switch (key) {
    case "shifts": {
      const d = data as PolicyData["shifts"];
      return `${d.shiftsPerDay} shift${d.shiftsPerDay === 1 ? "" : "s"} per day${d.timings?.length ? ` · ${d.timings.map((t) => `${t.name} ${t.start}–${t.end}`).join(", ")}` : ""}${d.weekOff ? ` · Off: ${weekOffText(d.weekOff)}` : ""}`;
    }
    case "holidays": {
      const d = data as PolicyData["holidays"];
      return `${d.year}: ${d.holidays.length} holidays, ${d.variants.length} variant${d.variants.length === 1 ? "" : "s"}`;
    }
    case "overtime": {
      const d = data as PolicyData["overtime"];
      if (d.enabled === false) return "Off for all locations";
      return `${d.mode}, ${d.weekdayRate}× weekday, ${d.holidayRate}× holiday, cap ${d.dailyCapHours} h/day`;
    }
    case "leave": {
      const d = data as PolicyData["leave"];
      return (
        d.leaveTypes.map((t) => `${t.code} ${t.annualDays}`).join(" · ") ||
        "No leave types"
      );
    }
    case "payment-threshold": {
      const d = data as PolicyData["payment-threshold"];
      return `${money(d.amount)}`;
    }
    case "rules": {
      const d = data as PolicyData["rules"];
      return `${d.rules.length} rule${d.rules.length === 1 ? "" : "s"}`;
    }
    default:
      return "";
  }
}
