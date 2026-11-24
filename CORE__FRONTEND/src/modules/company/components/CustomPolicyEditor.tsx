import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { KV, VersionFields } from "@/shared/ui/Extras";
import {
  CheckRow,
  FormGroup,
  Input,
  Select,
  Textarea,
} from "@/shared/ui/Field";
import type {
  CustomField,
  CustomFieldType,
  CustomValue,
} from "@/modules/core-data";
import { versionFields } from "@/modules/core-data";
import { a11y, req, uid } from "@/shared/lib/core";
import { fmtDate, todayISO } from "@/shared/lib/format";

export const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "yesno", label: "Yes / No" },
  { value: "select", label: "Choice list" },
];

export const typeLabel = (t: CustomFieldType) =>
  FIELD_TYPES.find((x) => x.value === t)?.label ?? t;

const parseOptions = (s: string) =>
  s
    .split(/[,\n]/)
    .map((o) => o.trim())
    .filter(Boolean);

// ---------------- Step 1: define the policy ----------------
export interface CustomPolicyDraft {
  name: string;
  description: string;
  fields: CustomField[];
}

const defSchema = z
  .object({
    name: req("Policy name").max(60, "Keep the name under 60 characters."),
    description: req("Description").max(400, "Keep it under 400 characters."),
    fields: z
      .array(
        z.object({
          label: req("Field name").max(60, "Keep it under 60 characters."),
          type: z.enum([
            "text",
            "longtext",
            "number",
            "date",
            "yesno",
            "select",
          ]),
          required: z.boolean(),
          options: z.string(),
        }),
      )
      .min(1, "Add at least one field."),
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.fields.forEach((f, i) => {
      const key = f.label.trim().toLowerCase();
      if (key && seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "label"],
          message: "Field names must be different.",
        });
      seen.add(key);
      if (f.type === "select" && new Set(parseOptions(f.options)).size < 2)
        ctx.addIssue({
          code: "custom",
          path: ["fields", i, "options"],
          message: "Give at least two choices, separated by commas.",
        });
    });
  });
type DefForm = z.infer<typeof defSchema>;

export function CustomPolicyDefForm({
  initial,
  onNext,
}: {
  initial?: CustomPolicyDraft;
  onNext: (d: CustomPolicyDraft) => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<DefForm>({
    resolver: zodResolver(defSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description,
          fields: initial.fields.map((f) => ({
            label: f.label,
            type: f.type,
            required: f.required,
            options: (f.options ?? []).join(", "),
          })),
        }
      : {
          name: "",
          description: "",
          fields: [{ label: "", type: "text", required: true, options: "" }],
        },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "fields" });
  const watched = useWatch({ control, name: "fields" });

  return (
    <form
      noValidate
      onSubmit={handleSubmit((d) =>
        onNext({
          name: d.name.trim(),
          description: d.description.trim(),
          fields: d.fields.map((f, i) => ({
            id: initial?.fields[i]?.id ?? uid("f"),
            label: f.label.trim(),
            type: f.type,
            required: f.type === "yesno" ? false : f.required,
            ...(f.type === "select"
              ? { options: parseOptions(f.options) }
              : {}),
          })),
        }),
      )}
    >
      <div className="form-grid">
        <FormGroup label="Policy name" required error={errors.name?.message}>
          {(id, d) => (
            <Input
              placeholder="Enter policy name"
              {...a11y(id, d, errors.name?.message)}
              {...register("name")}
            />
          )}
        </FormGroup>
        <FormGroup
          label="What is it for?"
          required
          full
          error={errors.description?.message}
        >
          {(id, d) => (
            <Textarea
              rows={2}
              placeholder="Enter what this policy covers and who it applies to"
              {...a11y(id, d, errors.description?.message)}
              {...register("description")}
            />
          )}
        </FormGroup>

        <div className="form-group full">
          <h3 className="section-t" style={{ margin: 0 }}>
            Fields
          </h3>
          <span className="helper">
            Once a policy is created, its field structure remains fixed. Any
            changes to field values must be made through a new policy version.
          </span>
          {errors.fields?.message && (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {errors.fields.message}
            </span>
          )}
          {errors.fields?.root?.message && (
            <span
              className="helper"
              role="alert"
              style={{ color: "var(--red)" }}
            >
              {errors.fields.root.message}
            </span>
          )}
        </div>

        {fields.map((row, i) => (
          <div
            key={row.id}
            className="form-group full"
            style={{
              border: "1px solid var(--line, #e5e7eb)",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <div className="form-grid">
              <FormGroup
                label={`Field ${i + 1} name`}
                required
                error={errors.fields?.[i]?.label?.message}
              >
                {(id, d) => (
                  <Input
                    placeholder="Enter field label"
                    {...a11y(id, d, errors.fields?.[i]?.label?.message)}
                    {...register(`fields.${i}.label`)}
                  />
                )}
              </FormGroup>
              <FormGroup label="Type" required>
                {(id, d) => (
                  <Select {...a11y(id, d)} {...register(`fields.${i}.type`)}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormGroup>
              {watched?.[i]?.type === "select" && (
                <FormGroup
                  label="Choices"
                  required
                  full
                  helper="Separate with commas."
                  error={errors.fields?.[i]?.options?.message}
                >
                  {(id, d) => (
                    <Input
                      placeholder="Enter options, separated by commas"
                      {...a11y(id, d, errors.fields?.[i]?.options?.message)}
                      {...register(`fields.${i}.options`)}
                    />
                  )}
                </FormGroup>
              )}
              <div
                className="form-group full"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                {watched?.[i]?.type === "yesno" ? (
                  <span className="helper">
                    Yes / No fields are always answered.
                  </span>
                ) : (
                  <CheckRow
                    label="Required"
                    {...register(`fields.${i}.required`)}
                  />
                )}
                <Button
                  onClick={() => remove(i)}
                  disabled={fields.length === 1}
                >
                  Remove field
                </Button>
              </div>
            </div>
          </div>
        ))}

        <div className="form-group full">
          <Button
            onClick={() =>
              append({ label: "", type: "text", required: true, options: "" })
            }
            icon="plus"
          >
            Add field
          </Button>
        </div>
      </div>
      <div className="form-actions">
        <Button type="submit" tone="primary">
          Continue to values
        </Button>
      </div>
    </form>
  );
}

// ---------------- Step 2 / new version: fill in values ----------------
type RawValues = Record<string, string | boolean>;
interface ValuesForm {
  effectiveFrom: string;
  reason: string;
  values: RawValues;
}

function buildSchema(fields: CustomField[]) {
  return z
    .object({
      ...versionFields,
      values: z.record(z.string(), z.union([z.string(), z.boolean()])),
    })
    .superRefine((d, ctx) => {
      for (const f of fields) {
        const raw = d.values[f.id];
        if (f.type === "yesno") continue;
        const s = typeof raw === "string" ? raw.trim() : "";
        const bad = (message: string) =>
          ctx.addIssue({ code: "custom", path: ["values", f.id], message });
        if (!s) {
          if (f.required) bad(`${f.label} is required.`);
          continue;
        }
        if (f.type === "number" && !Number.isFinite(Number(s)))
          bad("Enter a valid number.");
        else if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s))
          bad("Pick a valid date.");
        else if (f.type === "select" && !(f.options ?? []).includes(s))
          bad("Pick one of the choices.");
      }
    });
}

export function toValues(
  fields: CustomField[],
  raw: RawValues,
): Record<string, CustomValue> {
  const out: Record<string, CustomValue> = {};
  for (const f of fields) {
    const v = raw[f.id];
    if (f.type === "yesno") {
      out[f.id] = v === true;
      continue;
    }
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    out[f.id] = f.type === "number" ? Number(s) : s;
  }
  return out;
}

const toRaw = (
  fields: CustomField[],
  vals: Record<string, CustomValue>,
): RawValues =>
  Object.fromEntries(
    fields.map((f) => {
      const v = vals[f.id];
      return [
        f.id,
        f.type === "yesno" ? v === true : v === undefined ? "" : String(v),
      ];
    }),
  );

export function CustomValuesForm({
  fields,
  initial,
  submitLabel = "Save new version",
  onSave,
  onBack,
}: {
  fields: CustomField[];
  initial?: Record<string, CustomValue>;
  submitLabel?: string;
  onSave: (
    values: Record<string, CustomValue>,
    effectiveFrom: string,
    reason: string,
  ) => void | Promise<void>;
  onBack?: () => void;
}) {
  const schema = useMemo(() => buildSchema(fields), [fields]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ValuesForm>({
    resolver: zodResolver(schema) as unknown as Resolver<ValuesForm>,
    defaultValues: {
      effectiveFrom: todayISO(),
      reason: "",
      values: toRaw(fields, initial ?? {}),
    },
  });
  const valueErrors = (errors.values ?? {}) as Record<
    string,
    { message?: string } | undefined
  >;

  return (
    <form
      noValidate
      onSubmit={handleSubmit((d) =>
        onSave(toValues(fields, d.values), d.effectiveFrom, d.reason.trim()),
      )}
    >
      <div className="form-grid">
        {fields.map((f) => {
          const name = `values.${f.id}` as const;
          const err = valueErrors[f.id]?.message;
          if (f.type === "yesno")
            return (
              <div key={f.id} className="form-group">
                <CheckRow label={f.label} {...register(name)} />
              </div>
            );
          return (
            <FormGroup
              key={f.id}
              label={f.label}
              required={f.required}
              full={f.type === "longtext"}
              error={err}
            >
              {(id, d) =>
                f.type === "longtext" ? (
                  <Textarea
                    rows={3}
                    {...a11y(id, d, err)}
                    {...register(name)}
                  />
                ) : f.type === "select" ? (
                  <Select {...a11y(id, d, err)} {...register(name)}>
                    <option value="">Select…</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={
                      f.type === "number"
                        ? "number"
                        : f.type === "date"
                          ? "date"
                          : "text"
                    }
                    step={f.type === "number" ? "any" : undefined}
                    {...a11y(id, d, err)}
                    {...register(name)}
                  />
                )
              }
            </FormGroup>
          );
        })}
        <VersionFields register={register} errors={errors} />
      </div>
      <div className="form-actions">
        {onBack && <Button onClick={onBack}>Back</Button>}
        {!onBack && <Button onClick={() => reset()}>Reset</Button>}
        <Button type="submit" tone="primary" icon="check">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------- Read-only view ----------------
export function formatCustomValue(f: CustomField, v: CustomValue | undefined) {
  if (f.type === "yesno") return v === true ? "Yes" : "No";
  if (v === undefined || v === "") return "—";
  if (f.type === "date") return fmtDate(String(v));
  return String(v);
}

export function CustomPolicyView({
  fields,
  values,
}: {
  fields: CustomField[];
  values: Record<string, CustomValue>;
}) {
  return (
    <div className="detail-grid">
      {fields.map((f) => (
        <KV key={f.id} k={f.label} full={f.type === "longtext"}>
          {formatCustomValue(f, values[f.id])}
        </KV>
      ))}
    </div>
  );
}
