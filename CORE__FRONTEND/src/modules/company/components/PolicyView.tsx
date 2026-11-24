import { KV, MiniTable, Muted } from "@/shared/ui/Extras";
import type { PolicyData, PolicyKey } from "@/modules/core-data";
import { byId } from "@/shared/lib/core";
import { fmtDate, money } from "@/shared/lib/format";
import { useCore, weekOffText } from "@/modules/core-data";

const yes = (b: boolean) => (b ? "Yes" : "No");
/** One day shows a single date; a range shows From – To. */
const span = (h: { date: string; endDate?: string }) =>
  h.endDate && h.endDate !== h.date
    ? `${fmtDate(h.date)} – ${fmtDate(h.endDate)}`
    : fmtDate(h.date);

/** Read-only view of one policy version. `versionId` is the server version id (kept for callers; the view does not need it). */
export function PolicyView<K extends PolicyKey>({
  policy,
  data,
}: {
  policy: K;
  data: PolicyData[K];
  versionId?: string;
}) {
  const projects = useCore((s) => s.projects);
  switch (policy) {
    case "shifts": {
      const d = data as PolicyData["shifts"];
      const hrs = (s: string, e: string) => {
        const m =
          ((Number(e.slice(0, 2)) - Number(s.slice(0, 2))) * 60 +
            Number(e.slice(3)) -
            Number(s.slice(3)) +
            1440) %
            1440 || 1440;
        return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ""}`;
      };
      return (
        <>
          <div className="detail-grid" style={{ marginBottom: 12 }}>
            <KV k="Shifts per day">
              <strong>{d.shiftsPerDay}</strong>
            </KV>
            <KV k="Week off">{weekOffText(d.weekOff)}</KV>
            <KV k="Notes for HRMS" full>
              <span style={{ fontSize: 13.5 }}>{d.notes || "—"}</span>
            </KV>
          </div>
          <h3 className="section-t">Shift timings</h3>
          <MiniTable
            head={["Shift", "Starts", "Ends", "Hours"]}
            empty="Timings not defined for this version."
            rows={(d.timings ?? []).map((t) => [
              <strong key="n">{t.name}</strong>,
              t.start,
              t.end,
              hrs(t.start, t.end),
            ])}
          />
        </>
      );
    }
    case "holidays": {
      const d = data as PolicyData["holidays"];
      return (
        <>
          <div className="detail-grid" style={{ marginBottom: 12 }}>
            <KV k="Calendar year">
              <strong>{d.year}</strong>
            </KV>
            <KV k="Company holidays">
              <strong>{d.holidays.length}</strong>
            </KV>
          </div>
          <MiniTable
            head={["Holiday", "Type", "Date"]}
            rows={[...d.holidays]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((h) => [
                h.name,
                <span key="t" className="cell-pill">
                  {h.type}
                </span>,
                <strong key="d">{span(h)}</strong>,
              ])}
          />
          <h3 className="section-t">Project variants</h3>
          <MiniTable
            head={["Applies to project", "Date", "Holiday"]}
            empty="No variants."
            rows={d.variants.flatMap((v) =>
              v.holidays.map((h) => [
                <strong key="w">
                  {byId(projects, v.scopeId)?.name ?? v.scopeId}
                </strong>,
                span(h),
                h.name,
              ]),
            )}
          />
        </>
      );
    }
    case "overtime": {
      const d = data as PolicyData["overtime"];
      return (
        <div className="detail-grid">
          <KV k="Status">
            <strong>{d.enabled === false ? "Off" : "On"}</strong>
          </KV>
          <KV k="Mode">
            <strong>{d.mode}</strong>
          </KV>
          <KV k="Needs approval">
            <strong>{yes(d.requiresApproval)}</strong>
          </KV>
          <KV k="Weekday rate">
            <strong>{d.weekdayRate}×</strong>
          </KV>
          <KV k="Holiday rate">
            <strong>{d.holidayRate}×</strong>
          </KV>
          <KV k="Counted after">
            <strong>{d.minMinutes} minutes</strong>
          </KV>
          <KV k="Caps">
            <strong>
              {d.dailyCapHours} h a day · {d.monthlyCapHours} h a month
            </strong>
          </KV>
        </div>
      );
    }
    case "leave": {
      const d = data as PolicyData["leave"];
      return (
        <>
          <MiniTable
            head={[
              "Leave type",
              "Days a year",
              "Accrual",
              "Carry forward",
              "Encash",
              "Paid",
            ]}
            rows={d.leaveTypes.map((t) => [
              <span key="n">
                <strong>{t.name}</strong> <Muted>{t.code}</Muted>
              </span>,
              t.annualDays,
              t.accrual,
              t.carryForward
                ? `Up to ${t.maxCarryDays} days${t.expiryMonths ? `, lapses after ${t.expiryMonths} months` : ""}`
                : "No",
              yes(t.encashable),
              yes(t.paid),
            ])}
          />
          <p style={{ margin: "12px 0 0", fontSize: 13 }}>
            <Muted>{d.legalNote}</Muted>
          </p>
        </>
      );
    }
    case "payment-threshold": {
      const d = data as PolicyData["payment-threshold"];
      return (
        <div className="detail-grid">
          <KV k="Threshold">
            <strong className="amount">{money(d.amount)}</strong>
          </KV>
          <KV k="Routing" full>
            <span style={{ fontSize: 13.5 }}>
              Below {money(d.amount)}: PMS pays at the location. At or above: Head
              Office approves and pays the payee directly.
            </span>
          </KV>
        </div>
      );
    }
    case "rules": {
      const d = data as PolicyData["rules"];
      return (
        <div className="list-rows">
          {d.rules.map((r) => (
            <div
              className="list-row"
              key={r.title}
              style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 6 }}
            >
              <strong>{r.title}</strong>
              <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
                {r.body}
              </span>
            </div>
          ))}
        </div>
      );
    }
    default:
      return null;
  }
}
