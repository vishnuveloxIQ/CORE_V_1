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
    desc: "Official company policies, rules and procedures that all employees are required to read and comply with.",
    icon: "book",
  },
  "payment-threshold": {
    title: "Payment threshold",
    desc: "Payments within the approved financial limits shall be authorised and processed by the PCM, while payments exceeding the prescribed limits shall be subject to approval and processing by the Head Office..",
    icon: "rupee",
  },
  "equipment-rates": {
    title: "Fleet and equipment",
    desc: "Upload the Excel rate sheet containing equipment details, hire/rental categories, applicable units (hour/day/month) and approved rates for each project. The Fleet and Equipment module will automatically apply the relevant project-specific rates when recording equipment deployment, utilisation, rental charges and operating costs.",
    icon: "truck",
  },
  "material-rates": {
    title: "Material management",
    desc: "Upload the Excel rate sheet containing material descriptions, units of measurement and approved rates for each project. The Material Management module will use the corresponding project-specific rates when recording material purchases, receipts, issues and consumption.",
    icon: "package",
  },
  holidays: {
    title: "Holiday policy",
    desc: "Maintain an approved organisation-wide holiday calendar, with provisions for project-specific holidays and location-based variations, subject to management authorisation.",
    icon: "calendar",
  },
  shifts: {
    title: "Shift policy",
    desc: "Establish the approved number of daily shifts, working hours, shift timings and applicable rotation schedules across projects and locations.",
    icon: "clock",
  },
  leave: {
    title: "Leave policy",
    desc: "Define applicable leave categories, eligibility, accrual, carry-forward limits and expiry provisions in accordance with company policy and applicable statutory requirements.",
    icon: "leaveCalendar",
  },
  overtime: {
    title: "Overtime policy",
    desc: "Establish guidelines governing overtime eligibility, prior authorisation, applicable compensation rates, maximum permissible working hours and overtime limits in accordance with company policy and applicable labour laws.",
    icon: "timer",
  },
};

export const POLICY_KEYS = Object.keys(POLICY_META) as PolicyKey[];

/** The two rate-sheet policies: uploaded as Excel per project, not written as a version in the editor. */
export const RATE_POLICY_KEYS: PolicyKey[] = ["equipment-rates", "material-rates"];
/** Policies set up from a standard template (the rate sheets are uploaded instead). */
export const TEMPLATE_POLICY_KEYS = POLICY_KEYS.filter((k) => !RATE_POLICY_KEYS.includes(k));
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
    case "equipment-rates":
    case "material-rates": {
      const d = data as PolicyData["equipment-rates"];
      return d?.fileName ? `${d.fileName} · ${d.rows} row${d.rows === 1 ? "" : "s"}` : "No rate sheet yet";
    }
    case "rules": {
      const d = data as PolicyData["rules"];
      return `${d.rules.length} rule${d.rules.length === 1 ? "" : "s"}`;
    }
    default:
      return "";
  }
}
