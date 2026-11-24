import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { BulkUpload, type RowCheck } from "@/shared/ui/data/BulkUpload";
import { Button } from "@/shared/ui/Button";
import { Muted, Note, VersionFields } from "@/shared/ui/Extras";
import {
  CheckRow,
  FormGroup,
  Input,
  Select,
  Textarea,
} from "@/shared/ui/Field";
import type { Holiday, HolidayType, PolicyData } from "@/modules/core-data";
import { bulk } from "@/shared/lib/bulk";
import { a11y, num, req } from "@/shared/lib/core";
import { versionFields, WEEK_OFF_TYPES, SATURDAY_SETS } from "@/modules/core-data";
import { money, todayISO } from "@/shared/lib/format";
import { useCore } from "@/modules/core-data";

export interface EditorProps<K extends keyof PolicyData> {
  base: PolicyData[K];
  onSave: (data: PolicyData[K], effectiveFrom: string, reason: string) => void | Promise<void>;
}

const versionDefaults = () => ({ effectiveFrom: todayISO(), reason: "" });

function Actions({ onReset }: { onReset: () => void }) {
  return (
    <div className="form-actions">
      <Button onClick={onReset}>Reset</Button>
      <Button type="submit" tone="primary" icon="check">
        Save new version
      </Button>
    </div>
  );
}

function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="form-group full">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <h3 className="section-t" style={{ margin: 0 }}>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---------------- Shifts ----------------
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
/** Length of a shift in minutes; an end before the start crosses midnight. */
const shiftMinutes = (s: string, e: string) => {
  const d = toMin(e) - toMin(s);
  return d > 0 ? d : d + 1440;
};
const hoursText = (s: string, e: string) => {
  if (!TIME_RE.test(s) || !TIME_RE.test(e) || s === e) return "—";
  const m = shiftMinutes(s, e);
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ""}`;
};
/** Minute ranges a shift covers on a 24 h clock (a midnight-crossing shift is split in two). */
const segments = (s: string, e: string): [number, number][] => {
  const a = toMin(s);
  const b = toMin(e);
  return b > a
    ? [[a, b]]
    : [
        [a, 1440],
        [0, b],
      ];
};
const DEFAULT_TIMINGS: Record<number, [string, string, string][]> = {
  1: [["General", "09:00", "18:00"]],
  2: [
    ["Day", "06:00", "18:00"],
    ["Night", "18:00", "06:00"],
  ],
  3: [
    ["Day", "06:00", "14:00"],
    ["Evening", "14:00", "22:00"],
    ["Night", "22:00", "06:00"],
  ],
  4: [
    ["Early", "02:00", "08:00"],
    ["Day", "08:00", "14:00"],
    ["Evening", "14:00", "20:00"],
    ["Night", "20:00", "02:00"],
  ],
};
const defaultRow = (n: number, i: number) => {
  const [name, start, end] = DEFAULT_TIMINGS[n]?.[i] ?? [`Shift ${i + 1}`, "09:00", "17:00"];
  return { name, start, end };
};
const shiftSchema = z
  .object({
    shiftsPerDay: num("Shifts per day", 1).max(4, "At most 4 shifts per day."),
    notes: z.string().trim().max(300),
    timings: z.array(
      z.object({
        name: z.string().trim().min(1, "Name the shift.").max(40),
        start: z.string().regex(TIME_RE, "Set a start time."),
        end: z.string().regex(TIME_RE, "Set an end time."),
        // API row of the shift (absent for a new shift), kept so the save can update that row
        rowId: z.string().optional(),
        rowVersion: z.number().optional(),
      }),
    ),
    weekOff: z.object({
      type: z.enum(["Every Sunday", "Alternate Saturdays", "Rotating", "Custom days"]),
      saturdays: z.enum(["1st & 3rd", "2nd & 4th"]).optional(),
      days: z.string().trim().max(80).optional(),
    }),
    ...versionFields,
  })
  .superRefine((d, ctx) => {
    if (d.weekOff.type === "Custom days" && !d.weekOff.days?.trim())
      ctx.addIssue({ code: "custom", path: ["weekOff", "days"], message: "Enter the week-off days, e.g. Sunday, Wednesday." });
    const issue = (i: number, key: "name" | "start" | "end", message: string) =>
      ctx.addIssue({ code: "custom", path: ["timings", i, key], message });
    const names = new Set<string>();
    d.timings.forEach((t, i) => {
      const k = t.name.trim().toLowerCase();
      if (k && names.has(k)) issue(i, "name", "Shift names must be different.");
      names.add(k);
      if (t.start && t.start === t.end) issue(i, "end", "End must differ from start.");
    });
    const ok = d.timings.map((t) => TIME_RE.test(t.start) && TIME_RE.test(t.end) && t.start !== t.end);
    d.timings.forEach((a, i) =>
      d.timings.forEach((b, j) => {
        if (j <= i || !ok[i] || !ok[j]) return;
        const clash = segments(a.start, a.end).some(([s1, e1]) =>
          segments(b.start, b.end).some(([s2, e2]) => s1 < e2 && s2 < e1),
        );
        if (clash) issue(j, "start", `Overlaps ${a.name || `shift ${i + 1}`}.`);
      }),
    );
    if (d.timings.length !== d.shiftsPerDay)
      ctx.addIssue({ code: "custom", path: ["shiftsPerDay"], message: "Define timings for every shift." });
  });
export function ShiftsEditor({ base, onSave }: EditorProps<"shifts">) {
  const initial = () => ({
    ...base,
    weekOff: base.weekOff ?? ({ type: "Every Sunday" } as const),
    timings: base.timings?.length
      ? base.timings
      : Array.from({ length: base.shiftsPerDay }, (_, i) => defaultRow(base.shiftsPerDay, i)),
    ...versionDefaults(),
  });
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(shiftSchema),
    defaultValues: initial(),
  });
  const { fields, replace } = useFieldArray({ control, name: "timings" });
  const count = Number(useWatch({ control, name: "shiftsPerDay" })) || 0;
  const rows = useWatch({ control, name: "timings" }) ?? [];
  const weekOffDaysErr = (errors.weekOff as { days?: { message?: string } } | undefined)?.days?.message;
  const weekOffType = useWatch({ control, name: "weekOff.type" });
  // Keep one timing row per shift: add defaults when the count grows, drop the tail when it shrinks.
  useEffect(() => {
    if (count < 1 || count > 4 || count === fields.length) return;
    const cur = rows.slice(0, count);
    for (let i = cur.length; i < count; i++) cur.push(defaultRow(count, i));
    replace(cur);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ effectiveFrom, reason, ...d }) =>
        onSave(d, effectiveFrom, reason),
      )}
    >
      <div className="form-grid">
        <FormGroup
          label="Shifts per day"
          required
          error={errors.shiftsPerDay?.message}
        >
          {(id, d) => (
            <Select
              {...a11y(id, d, errors.shiftsPerDay?.message)}
              {...register("shiftsPerDay", { valueAsNumber: true })}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        <FormGroup label="Week-off pattern" required>
          {(id, d) => (
            <Select {...a11y(id, d)} {...register("weekOff.type")}>
              {WEEK_OFF_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )}
        </FormGroup>
        {weekOffType === "Alternate Saturdays" && (
          <FormGroup label="Saturdays off" required>
            {(id, d) => (
              <Select {...a11y(id, d)} {...register("weekOff.saturdays")}>
                {SATURDAY_SETS.map((t) => (
                  <option key={t} value={t}>
                    {t} Saturday
                  </option>
                ))}
              </Select>
            )}
          </FormGroup>
        )}
        {weekOffType === "Custom days" && (
          <FormGroup label="Week-off days" required error={weekOffDaysErr}>
            {(id, d) => (
              <Input
                {...a11y(id, d, weekOffDaysErr)}
                placeholder="e.g. Sunday, Wednesday"
                {...register("weekOff.days")}
              />
            )}
          </FormGroup>
        )}
        <Section title="Shift timings">
          <Muted>
            Working hours of each shift. An end time earlier than the start means the shift runs past midnight.
          </Muted>
          <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
            {fields.map((f, i) => {
              const e = errors.timings?.[i];
              return (
                <div
                  key={f.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px,1.4fr) minmax(110px,1fr) minmax(110px,1fr) 80px",
                    gap: 10,
                    alignItems: "start",
                  }}
                >
                  <FormGroup label={`Shift ${i + 1} name`} required error={e?.name?.message}>
                    {(id, d) => <Input {...a11y(id, d, e?.name?.message)} {...register(`timings.${i}.name`)} />}
                  </FormGroup>
                  <FormGroup label="Starts" required error={e?.start?.message}>
                    {(id, d) => (
                      <Input type="time" {...a11y(id, d, e?.start?.message)} {...register(`timings.${i}.start`)} />
                    )}
                  </FormGroup>
                  <FormGroup label="Ends" required error={e?.end?.message}>
                    {(id, d) => (
                      <Input type="time" {...a11y(id, d, e?.end?.message)} {...register(`timings.${i}.end`)} />
                    )}
                  </FormGroup>
                  <div style={{ paddingTop: 26 }}>
                    <strong>{hoursText(rows[i]?.start ?? "", rows[i]?.end ?? "")}</strong>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
        <FormGroup label="Notes for HRMS" full error={errors.notes?.message}>
          {(id, d) => (
            <Textarea rows={2} {...a11y(id, d)} {...register("notes")} />
          )}
        </FormGroup>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset(initial())} />
    </form>
  );
}

// ---------------- Holidays ----------------
const HOLIDAY_TYPES: HolidayType[] = [
  "National",
  "Festival",
  "Optional",
  "Regional",
];
const holidayRow = z.object({
  name: req("Holiday name"),
  date: z.string().min(1, "Pick a date."),
  endDate: z.string().optional(),
  type: z.enum(["National", "Festival", "Optional", "Regional"]),
  // API row of the holiday (absent for a new one), kept so the save can update that row
  rowId: z.string().optional(),
  rowVersion: z.number().optional(),
});
/** Last day of a holiday: To when set, otherwise the From date. */
const lastDay = (h: { date: string; endDate?: string }) => h.endDate || h.date;
/** Every ISO day a holiday covers (capped, so a typo cannot loop for years). */
const daysOf = (h: { date: string; endDate?: string }): string[] => {
  const start = new Date(`${h.date}T00:00:00Z`).getTime();
  if (Number.isNaN(start)) return [];
  const end = new Date(`${lastDay(h)}T00:00:00Z`).getTime();
  const out: string[] = [];
  for (let t = start; t <= end && out.length < 400; t += 864e5)
    out.push(new Date(t).toISOString().slice(0, 10));
  return out.length ? out : [h.date];
};
const holidaySchema = z
  .object({
    year: num("Year", 2020).max(2100, "Enter a valid year."),
    holidays: z.array(holidayRow).min(1, "Add at least one holiday."),
    variants: z.array(
      holidayRow.extend({
        scope: z.literal("Project"),
        scopeId: z.string().min(1, "Choose a project."),
      }),
    ),
    ...versionFields,
  })
  .superRefine((v, ctx) => {
    const checkRange = (
      list: "holidays" | "variants",
      h: { date: string; endDate?: string },
      i: number,
    ) => {
      if (h.date && !h.date.startsWith(String(v.year)))
        ctx.addIssue({
          code: "custom",
          path: [list, i, "date"],
          message: `Date must be in ${v.year}.`,
        });
      if (h.endDate && !h.endDate.startsWith(String(v.year)))
        ctx.addIssue({
          code: "custom",
          path: [list, i, "endDate"],
          message: `Date must be in ${v.year}.`,
        });
      else if (h.endDate && h.date && h.endDate < h.date)
        ctx.addIssue({
          code: "custom",
          path: [list, i, "endDate"],
          message: "To cannot be before From.",
        });
    };
    v.holidays.forEach((h, i) => checkRange("holidays", h, i));
    v.variants.forEach((h, i) => checkRange("variants", h, i));
    v.holidays.forEach((h, i) => {
      const clash = v.holidays.some(
        (o, j) =>
          j < i && o.date <= lastDay(h) && h.date <= lastDay(o) && o.date,
      );
      if (clash)
        ctx.addIssue({
          code: "custom",
          path: ["holidays", i, "date"],
          message: "Another holiday covers these dates.",
        });
    });
  });
export function HolidaysEditor({ base, onSave }: EditorProps<"holidays">) {
  const { projects } = useCore();
  const flatVariants = base.variants.flatMap((v) =>
    v.holidays.map((h) => ({
      ...h,
      endDate: h.endDate ?? h.date,
      scope: v.scope,
      scopeId: v.scopeId,
    })),
  );
  const defaults = {
    year: base.year,
    holidays: base.holidays.map((h) => ({ ...h, endDate: h.endDate ?? h.date })),
    variants: flatVariants,
    ...versionDefaults(),
  };
  const {
    register,
    control,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(holidaySchema),
    defaultValues: defaults,
  });
  const watchedHolidays = useWatch({ control, name: "holidays" });
  const watchedVariants = useWatch({ control, name: "variants" });
  const prevFrom = useRef(new Map<string, string>());
  /** One-day holidays stay one day: To follows From unless it is a real range. */
  const followFrom = (
    list: "holidays" | "variants",
    i: number,
    from: string,
  ) => {
    const key = `${list}.${i}`;
    const to = getValues(`${list}.${i}.endDate`);
    if (!to || to === prevFrom.current.get(key) || to < from)
      setValue(`${list}.${i}.endDate`, from);
    prevFrom.current.set(key, from);
  };
  const hol = useFieldArray({ control, name: "holidays" });
  const vars = useFieldArray({ control, name: "variants" });
  const [upload, setUpload] = useState(false);
  type Row = Holiday & {
    scope: "Company" | "Project";
    scopeId: string;
  };
  const validate = (records: Record<string, string>[]): RowCheck<Row>[] => {
    const year = getValues("year");
    const taken = new Set(getValues("holidays").flatMap(daysOf));
    return records.map((r) => {
      const errors: string[] = [];
      const end = (r.end_date ?? "").trim() || r.date;
      const type = bulk.pick(r.type || "Festival", HOLIDAY_TYPES);
      const where = (r.applies_to ?? "").trim();
      const project = projects.find(
        (x) => x.code.toUpperCase() === where.toUpperCase(),
      );
      const scope: Row["scope"] =
        !where || where.toLowerCase() === "company" ? "Company" : "Project";
      if (!r.name) errors.push("name is required.");
      if (!bulk.date(r.date ?? ""))
        errors.push("date must be like 2026-12-25.");
      else if (!r.date.startsWith(String(year)))
        errors.push(
          `date must be in ${year}, the calendar year of this version.`,
        );
      else if (!bulk.date(end))
        errors.push("end_date must be like 2026-12-26.");
      else if (!end.startsWith(String(year)))
        errors.push(`end_date must be in ${year}.`);
      else if (end < r.date) errors.push("end_date cannot be before date.");
      else if (
        scope === "Company" &&
        daysOf({ date: r.date, endDate: end }).some((d) => taken.has(d))
      )
        errors.push("Another company holiday already covers these dates.");
      if (!type)
        errors.push(`type must be one of: ${HOLIDAY_TYPES.join(", ")}.`);
      if (where && scope !== "Company" && !project)
        errors.push(`applies_to "${where}" is not Company or a project code.`);
      if (!errors.length && scope === "Company")
        daysOf({ date: r.date, endDate: end }).forEach((d) => taken.add(d));
      const label = `${r.date || "?"}${end && end !== r.date ? ` to ${end}` : ""} · ${r.name || "no name"}${scope === "Company" ? "" : ` · ${where.toUpperCase()}`}`;
      return errors.length
        ? { label, errors }
        : {
            label,
            value: {
              name: r.name,
              date: r.date,
              endDate: end,
              type: type!,
              scope,
              scopeId: project?.id ?? "",
            },
          };
    });
  };
  const addRows = (rows: Row[]) => {
    const company = rows
      .filter((x) => x.scope === "Company")
      .map(({ name, date, endDate, type }) => ({
        name,
        date,
        endDate: endDate ?? date,
        type,
      }));
    const local = rows
      .filter((x) => x.scope !== "Company")
      .map((x) => ({
        name: x.name,
        date: x.date,
        endDate: x.endDate ?? x.date,
        type: x.type,
        scope: "Project" as const,
        scopeId: x.scopeId,
      }));
    if (company.length) hol.append(company);
    if (local.length) vars.append(local);
  };
  const save = handleSubmit(
    ({ effectiveFrom, reason, year, holidays, variants }) => {
      const groups = new Map<
        string,
        PolicyData["holidays"]["variants"][number]
      >();
      /** Store To only for a real range; one-day holidays carry From alone. */
      const tidy = <T extends { date: string; endDate?: string }>(h: T): T => {
        const { endDate, ...rest } = h;
        return (endDate && endDate !== h.date ? h : rest) as T;
      };
      variants.forEach(({ scope, scopeId, ...h }) => {
        const k = `${scope}:${scopeId}`;
        if (!groups.has(k)) groups.set(k, { scope, scopeId, holidays: [] });
        groups.get(k)!.holidays.push(tidy(h));
      });
      onSave(
        {
          year,
          holidays: holidays
            .map(tidy)
            .sort((a, b) => a.date.localeCompare(b.date)),
          variants: [...groups.values()],
        },
        effectiveFrom,
        reason,
      );
    },
  );
  return (
    <form noValidate onSubmit={save}>
      <div className="form-grid">
        <FormGroup label="Calendar year" required error={errors.year?.message}>
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, errors.year?.message)}
              {...register("year", { valueAsNumber: true })}
            />
          )}
        </FormGroup>
        <div />
        <Section
          title="Company holidays"
          action={
            <div className="row-actions">
              <Button size="sm" icon="upload" onClick={() => setUpload(true)}>
                Upload holidays
              </Button>
              <Button
                size="sm"
                icon="plus"
                onClick={() =>
                  hol.append({
                    name: "",
                    date: "",
                    endDate: "",
                    type: "Festival",
                  })
                }
              >
                Add holiday
              </Button>
            </div>
          }
        >
          {errors.holidays?.root?.message || errors.holidays?.message ? (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {errors.holidays?.root?.message ?? errors.holidays?.message}
            </span>
          ) : null}
          <div className="list-rows">
            {hol.fields.map((f, i) => (
              <div className="list-row" key={f.id}>
                <FormGroup
                  label="Name"
                  required
                  error={errors.holidays?.[i]?.name?.message}
                >
                  {(id, d) => (
                    <Input
                      {...a11y(id, d, errors.holidays?.[i]?.name?.message)}
                      {...register(`holidays.${i}.name`)}
                    />
                  )}
                </FormGroup>
                <FormGroup
                  label="From"
                  required
                  error={errors.holidays?.[i]?.date?.message}
                >
                  {(id, d) => (
                    <Input
                      type="date"
                      {...a11y(id, d, errors.holidays?.[i]?.date?.message)}
                      {...register(`holidays.${i}.date`, {
                        onChange: (e) =>
                          followFrom("holidays", i, e.target.value),
                      })}
                      onFocus={(e) =>
                        prevFrom.current.set(`holidays.${i}`, e.target.value)
                      }
                    />
                  )}
                </FormGroup>
                <FormGroup
                  label="To"
                  error={errors.holidays?.[i]?.endDate?.message}
                >
                  {(id, d) => (
                    <Input
                      type="date"
                      min={watchedHolidays?.[i]?.date || undefined}
                      {...a11y(id, d, errors.holidays?.[i]?.endDate?.message)}
                      {...register(`holidays.${i}.endDate`)}
                    />
                  )}
                </FormGroup>
                <FormGroup label="Type">
                  {(id) => (
                    <Select id={id} {...register(`holidays.${i}.type`)}>
                      {HOLIDAY_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </Select>
                  )}
                </FormGroup>
                <Button
                  size="sm"
                  tone="danger"
                  icon="trash"
                  className="row-del"
                  onClick={() => hol.remove(i)}
                  aria-label={`Remove holiday ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Section>
        <Section
          title="Project variants"
          action={
            <Button
              size="sm"
              icon="plus"
              onClick={() =>
                vars.append({
                  name: "",
                  date: "",
                  endDate: "",
                  type: "Regional",
                  scope: "Project",
                  scopeId: "",
                })
              }
            >
              Add variant
            </Button>
          }
        >
          <Muted>Extra holidays that apply only to one project.</Muted>
          <div className="list-rows">
            {vars.fields.map((f, i) => (
                <div className="list-row" key={f.id}>
                  <FormGroup
                    label="Applies to project"
                    required
                    error={errors.variants?.[i]?.scopeId?.message}
                  >
                    {(id, d) => (
                      <Select
                        {...a11y(id, d, errors.variants?.[i]?.scopeId?.message)}
                        {...register(`variants.${i}.scopeId`)}
                      >
                        <option value="">Choose…</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </FormGroup>
                  <FormGroup
                    label="Holiday"
                    required
                    error={errors.variants?.[i]?.name?.message}
                  >
                    {(id, d) => (
                      <Input
                        {...a11y(id, d, errors.variants?.[i]?.name?.message)}
                        {...register(`variants.${i}.name`)}
                      />
                    )}
                  </FormGroup>
                  <FormGroup
                    label="From"
                    required
                    error={errors.variants?.[i]?.date?.message}
                  >
                    {(id, d) => (
                      <Input
                        type="date"
                        {...a11y(id, d, errors.variants?.[i]?.date?.message)}
                        {...register(`variants.${i}.date`, {
                          onChange: (e) =>
                            followFrom("variants", i, e.target.value),
                        })}
                        onFocus={(e) =>
                          prevFrom.current.set(`variants.${i}`, e.target.value)
                        }
                      />
                    )}
                  </FormGroup>
                  <FormGroup
                    label="To"
                    error={errors.variants?.[i]?.endDate?.message}
                  >
                    {(id, d) => (
                      <Input
                        type="date"
                        min={watchedVariants?.[i]?.date || undefined}
                        {...a11y(id, d, errors.variants?.[i]?.endDate?.message)}
                        {...register(`variants.${i}.endDate`)}
                      />
                    )}
                  </FormGroup>
                  <Button
                    size="sm"
                    tone="danger"
                    icon="trash"
                    className="row-del"
                    onClick={() => vars.remove(i)}
                    aria-label={`Remove variant ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
            ))}
          </div>
        </Section>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset(defaults)} />
      <BulkUpload
        open={upload}
        onOpenChange={setUpload}
        noun="holidays"
        templateName="core-holidays-template"
        importLabel="Add to this version"
        fields={[
          {
            key: "name",
            label: "Holiday name",
            required: true,
            example: "Sankranti",
          },
          {
            key: "date",
            label: "Date",
            required: true,
            example: `${base.year}-01-14`,
            hint: "yyyy-mm-dd, in the calendar year above",
          },
          {
            key: "end_date",
            label: "End date (optional)",
            example: `${base.year}-01-16`,
            hint: "last day; leave empty for a one-day holiday",
          },
          {
            key: "type",
            label: "Type",
            required: true,
            example: "Festival",
            hint: HOLIDAY_TYPES.join(", "),
          },
          {
            key: "applies_to",
            label: "Where it applies (optional)",
            example: "Company",
            hint: `Company, or a project code: ${projects.map((x) => x.code).join(", ")}`,
          },
        ]}
        examples={[
          [
            "Bonalu",
            `${base.year}-07-20`,
            `${base.year}-07-20`,
            "Regional",
            projects[0]?.code ?? "",
          ],
        ]}
        validate={validate}
        onImport={addRows}
        note={
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)" }}>
            Rows are added to the form below. Nothing is saved until you save
            the new version.
          </p>
        }
      />
    </form>
  );
}

// ---------------- Overtime ----------------
const otSchema = z
  .object({
    mode: z.enum(["Automatic", "Manual"]),
    weekdayRate: num("Weekday rate", 1).max(4, "At most 4×."),
    holidayRate: num("Holiday rate", 1).max(4, "At most 4×."),
    minMinutes: num("Minimum minutes", 0).max(240, "At most 240 minutes."),
    dailyCapHours: num("Daily cap", 0).max(12, "At most 12 hours."),
    monthlyCapHours: num("Monthly cap", 0).max(200, "At most 200 hours."),
    requiresApproval: z.boolean(),
    ...versionFields,
  })
  .refine((v) => v.monthlyCapHours >= v.dailyCapHours, {
    path: ["monthlyCapHours"],
    message: "Monthly cap cannot be below the daily cap.",
  });
export function OvertimeEditor({ base, onSave }: EditorProps<"overtime">) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(otSchema),
    defaultValues: { ...base, ...versionDefaults() },
  });
  const mode = useWatch({ control, name: "mode" });
  const n = { valueAsNumber: true } as const;
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ effectiveFrom, reason, ...d }) =>
        // the form has no enable switch: carry the on/off state of the base version so a new version keeps it
        onSave({ ...d, enabled: base.enabled }, effectiveFrom, reason),
      )}
    >
      <div className="form-grid">
        <FormGroup
          label="Mode"
          required
          helper={
            mode === "Automatic"
              ? "Calculated from attendance beyond shift hours."
              : "Entered by the location and approved."
          }
        >
          {(id, d) => (
            <Select {...a11y(id, d)} {...register("mode")}>
              <option>Automatic</option>
              <option>Manual</option>
            </Select>
          )}
        </FormGroup>
        <FormGroup
          label="Minimum overtime (minutes)"
          required
          error={errors.minMinutes?.message}
          helper="Shorter extra time is ignored."
        >
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, errors.minMinutes?.message)}
              {...register("minMinutes", n)}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Weekday rate (× hourly wage)"
          required
          error={errors.weekdayRate?.message}
          helper="Factories Act workers: at least 2×."
        >
          {(id, d) => (
            <Input
              type="number"
              step="0.25"
              {...a11y(id, d, errors.weekdayRate?.message)}
              {...register("weekdayRate", n)}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Holiday rate (× hourly wage)"
          required
          error={errors.holidayRate?.message}
        >
          {(id, d) => (
            <Input
              type="number"
              step="0.25"
              {...a11y(id, d, errors.holidayRate?.message)}
              {...register("holidayRate", n)}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Daily cap (hours)"
          required
          error={errors.dailyCapHours?.message}
        >
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, errors.dailyCapHours?.message)}
              {...register("dailyCapHours", n)}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Monthly cap (hours)"
          required
          error={errors.monthlyCapHours?.message}
        >
          {(id, d) => (
            <Input
              type="number"
              {...a11y(id, d, errors.monthlyCapHours?.message)}
              {...register("monthlyCapHours", n)}
            />
          )}
        </FormGroup>
        <div className="form-group full">
          <CheckRow
            label="Overtime needs approval before payroll"
            {...register("requiresApproval")}
          />
        </div>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset({ ...base, ...versionDefaults() })} />
    </form>
  );
}

// ---------------- Leave ----------------
const leaveRow = z.object({
  name: req("Name"),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z]{1,4}$/, "1–4 capital letters."),
  annualDays: num("Days", 0).max(365, "At most 365."),
  accrual: z.enum(["Yearly", "Monthly"]),
  carryForward: z.boolean(),
  maxCarryDays: num("Max carry", 0),
  expiryMonths: num("Expiry", 0).max(60, "At most 60 months."),
  encashable: z.boolean(),
  paid: z.boolean(),
});
const leaveSchema = z
  .object({
    leaveTypes: z.array(leaveRow).min(1, "Add at least one leave type."),
    legalNote: z.string().trim(),
    ...versionFields,
  })
  .superRefine((v, ctx) => {
    const seen = new Set<string>();
    v.leaveTypes.forEach((t, i) => {
      if (seen.has(t.code))
        ctx.addIssue({
          code: "custom",
          path: ["leaveTypes", i, "code"],
          message: "Code already used.",
        });
      seen.add(t.code);
      if (!t.carryForward && t.maxCarryDays > 0)
        ctx.addIssue({
          code: "custom",
          path: ["leaveTypes", i, "maxCarryDays"],
          message: "Must be 0 when carry-forward is off.",
        });
    });
  });
export function LeaveEditor({ base, onSave }: EditorProps<"leave">) {
  const defaults = { ...base, ...versionDefaults() };
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(leaveSchema), defaultValues: defaults });
  const types = useFieldArray({ control, name: "leaveTypes" });
  const n = { valueAsNumber: true } as const;
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ effectiveFrom, reason, ...d }) =>
        onSave(d, effectiveFrom, reason),
      )}
    >
      <div className="form-grid">
        <Section
          title="Leave types"
          action={
            <Button
              size="sm"
              icon="plus"
              onClick={() =>
                types.append({
                  name: "",
                  code: "",
                  annualDays: 0,
                  accrual: "Yearly",
                  carryForward: false,
                  maxCarryDays: 0,
                  expiryMonths: 0,
                  encashable: false,
                  paid: true,
                })
              }
            >
              Add leave type
            </Button>
          }
        >
          {errors.leaveTypes?.root?.message || errors.leaveTypes?.message ? (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {errors.leaveTypes?.root?.message ?? errors.leaveTypes?.message}
            </span>
          ) : null}
          <div className="list-rows">
            {types.fields.map((f, i) => {
              const e = errors.leaveTypes?.[i];
              return (
                <div className="list-row" key={f.id}>
                  <FormGroup label="Name" required error={e?.name?.message}>
                    {(id, d) => (
                      <Input
                        {...a11y(id, d, e?.name?.message)}
                        {...register(`leaveTypes.${i}.name`)}
                      />
                    )}
                  </FormGroup>
                  <FormGroup label="Code" required error={e?.code?.message}>
                    {(id, d) => (
                      <Input
                        className="uppercase"
                        maxLength={4}
                        {...a11y(id, d, e?.code?.message)}
                        {...register(`leaveTypes.${i}.code`, {
                          setValueAs: (v: string) => v.toUpperCase(),
                        })}
                      />
                    )}
                  </FormGroup>
                  <FormGroup
                    label="Days a year"
                    required
                    error={e?.annualDays?.message}
                  >
                    {(id, d) => (
                      <Input
                        type="number"
                        {...a11y(id, d, e?.annualDays?.message)}
                        {...register(`leaveTypes.${i}.annualDays`, n)}
                      />
                    )}
                  </FormGroup>
                  <FormGroup label="Accrual">
                    {(id) => (
                      <Select id={id} {...register(`leaveTypes.${i}.accrual`)}>
                        <option>Yearly</option>
                        <option>Monthly</option>
                      </Select>
                    )}
                  </FormGroup>
                  <FormGroup
                    label="Max carry-forward (days)"
                    error={e?.maxCarryDays?.message}
                  >
                    {(id, d) => (
                      <Input
                        type="number"
                        {...a11y(id, d, e?.maxCarryDays?.message)}
                        {...register(`leaveTypes.${i}.maxCarryDays`, n)}
                      />
                    )}
                  </FormGroup>
                  <FormGroup
                    label="Expires after (months)"
                    error={e?.expiryMonths?.message}
                    helper="0 = never"
                  >
                    {(id, d) => (
                      <Input
                        type="number"
                        {...a11y(id, d, e?.expiryMonths?.message)}
                        {...register(`leaveTypes.${i}.expiryMonths`, n)}
                      />
                    )}
                  </FormGroup>
                  <div className="stack" style={{ gap: 6 }}>
                    <CheckRow
                      label="Carry forward"
                      {...register(`leaveTypes.${i}.carryForward`)}
                    />
                    <CheckRow
                      label="Encashable"
                      {...register(`leaveTypes.${i}.encashable`)}
                    />
                    <CheckRow
                      label="Paid"
                      {...register(`leaveTypes.${i}.paid`)}
                    />
                  </div>
                  <Button
                    size="sm"
                    tone="danger"
                    icon="trash"
                    className="row-del"
                    onClick={() => types.remove(i)}
                    aria-label={`Remove leave type ${i + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
          </div>
        </Section>
        <FormGroup
          label="Legal basis"
          full
          helper="Statutes this policy follows."
        >
          {(id, d) => (
            <Textarea rows={2} {...a11y(id, d)} {...register("legalNote")} />
          )}
        </FormGroup>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset(defaults)} />
    </form>
  );
}

// ---------------- Payment threshold ----------------
const payThresholdSchema = z.object({
  amount: num("Threshold", 1),
  currency: z.literal("INR"),
  ...versionFields,
});
export function PaymentThresholdEditor({
  base,
  onSave,
}: EditorProps<"payment-threshold">) {
  const requests = useCore((s) => s.requests);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(payThresholdSchema),
    defaultValues: { ...base, ...versionDefaults() },
  });
  const amount = Number(useWatch({ control, name: "amount" })) || 0;
  const open = requests.filter(
    (r) =>
      r.payload.kind === "payment" &&
      (r.status === "Pending" || r.status === "In review" || r.status === "Clarification requested"),
  );
  const ho = open.filter(
    (r) => r.payload.kind === "payment" && r.payload.amount >= amount,
  ).length;
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ effectiveFrom, reason, ...d }) =>
        onSave(d, effectiveFrom, reason),
      )}
    >
      <div className="form-grid">
        <FormGroup
          label="Threshold (₹)"
          required
          error={errors.amount?.message}
          helper={
            amount
              ? `Below ${money(amount)}: PMS pays. At or above: Head Office approves and pays.`
              : undefined
          }
        >
          {(id, d) => (
            <Input
              type="number"
              inputMode="numeric"
              step="1000"
              {...a11y(id, d, errors.amount?.message)}
              {...register("amount", { valueAsNumber: true })}
            />
          )}
        </FormGroup>
        <div />
        <div className="form-group full">
          <Note title="Open payment requests" icon="rupee">
            At this amount, {ho} of {open.length} open requests would route to
            Head Office. Requests already in flight keep the rules they were raised
            under.
          </Note>
        </div>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset({ ...base, ...versionDefaults() })} />
    </form>
  );
}

// ---------------- Rules ----------------
const ruleRow = z.object({
  title: req("Title"),
  category: z.enum(["Conduct", "Safety", "Attendance", "IT", "General"]),
  body: z.string().trim().min(10, "Write at least 10 characters."),
  ackRequired: z.boolean(),
});
const rulesSchema = z.object({
  rules: z.array(ruleRow).min(1, "Add at least one rule."),
  ...versionFields,
});
export function RulesEditor({ base, onSave }: EditorProps<"rules">) {
  const defaults = { ...base, ...versionDefaults() };
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(rulesSchema), defaultValues: defaults });
  const rules = useFieldArray({ control, name: "rules" });
  return (
    <form
      noValidate
      onSubmit={handleSubmit(({ effectiveFrom, reason, ...d }) =>
        onSave(d, effectiveFrom, reason),
      )}
    >
      <div className="form-grid">
        <Section
          title="Rules"
          action={
            <Button
              size="sm"
              icon="plus"
              onClick={() =>
                rules.append({
                  title: "",
                  category: "General",
                  body: "",
                  ackRequired: false,
                })
              }
            >
              Add rule
            </Button>
          }
        >
          {errors.rules?.root?.message || errors.rules?.message ? (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {errors.rules?.root?.message ?? errors.rules?.message}
            </span>
          ) : null}
          <div className="list-rows">
            {rules.fields.map((f, i) => {
              const e = errors.rules?.[i];
              return (
                <div
                  className="list-row"
                  key={f.id}
                  style={{ gridTemplateColumns: "minmax(0,1fr)" }}
                >
                  <div className="form-grid">
                    <FormGroup label="Title" required error={e?.title?.message}>
                      {(id, d) => (
                        <Input
                          {...a11y(id, d, e?.title?.message)}
                          {...register(`rules.${i}.title`)}
                        />
                      )}
                    </FormGroup>
                    <FormGroup label="Category">
                      {(id) => (
                        <Select id={id} {...register(`rules.${i}.category`)}>
                          {[
                            "Conduct",
                            "Safety",
                            "Attendance",
                            "IT",
                            "General",
                          ].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </Select>
                      )}
                    </FormGroup>
                    <FormGroup
                      label="Rule text"
                      required
                      full
                      error={e?.body?.message}
                    >
                      {(id, d) => (
                        <Textarea
                          rows={2}
                          {...a11y(id, d, e?.body?.message)}
                          {...register(`rules.${i}.body`)}
                        />
                      )}
                    </FormGroup>
                  </div>
                  <div
                    className="row-actions"
                    style={{ justifyContent: "flex-end" }}
                  >
                    <Button
                      size="sm"
                      tone="danger"
                      icon="trash"
                      onClick={() => rules.remove(i)}
                      aria-label={`Remove rule ${i + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
        <VersionFields register={register} errors={errors} />
      </div>
      <Actions onReset={() => reset(defaults)} />
    </form>
  );
}
