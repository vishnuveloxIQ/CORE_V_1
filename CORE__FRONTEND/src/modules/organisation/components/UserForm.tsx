import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { ApiError } from "@/shared/lib/api";
import { useWatch } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { PhoneField } from "@/shared/ui/PhoneField";
import { DEFAULT_COUNTRY } from "@/shared/lib/countryCodes";
import { Button } from "@/shared/ui/Button";
import { Muted, Note } from "@/shared/ui/Extras";
import { CheckRow, FormGroup, Input, Select } from "@/shared/ui/Field";
import { MODULES, type CoreUser, type ModuleName } from "@/modules/core-data";
import { a11y, email, phone, req } from "@/shared/lib/core";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { LOGIN_ID_RE, useCore } from "@/modules/core-data";
import { loginPrefixFor, matchesCompanyPrefix } from "@/modules/auth";
import { tenantId } from "@/shared/lib/api";
import type { TempPassword } from "./TempPasswordDialog";

const schema = z
  .object({
    name: req("Full name").max(80, "Keep it under 80 characters."),
    email,
    phone,
    designation: req("Designation"),
    loginId: req("Login ID").regex(
      LOGIN_ID_RE,
      "Enter exactly 4 digits after the company prefix, for example .",
    ),
    roles: z
      .array(z.enum(["Module head", "Approver"]))
      .min(1, "Choose at least one role."),
    modules: z.array(z.enum(["HRMS", "PMS", "Stores", "P&M"])),
    scopeType: z.enum(["Company", "Project"]),
    scopeIds: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (v.scopeType !== "Company" && v.scopeIds.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["scopeIds"],
        message: `Choose at least one ${v.scopeType.toLowerCase()}.`,
      });
    if (v.roles.includes("Module head") && v.modules.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["modules"],
        message: "Choose at least one module this person heads.",
      });
  });

const ROLE_INFO = {
  "Module head":
    "Manages assigned modules, including request submission and approval activities. Each module is assigned a single active head.",
  Approver:
    "High-level approver. Can be placed at any level L1–L4 of the approval matrix.",
} as const;

/**
 * Create (POST /users) or edit (PATCH /users/{id}) a CORE user: module head or high-level approver. Privileges are
 * granted on the user's page (step-up), and deactivation uses the Deactivate button, so neither is on this form.
 * A create hands the one-time temporary password to `onSaved`; it is never stored.
 */
export function UserForm({
  user,
  onSaved,
  onCancel,
}: {
  user?: CoreUser;
  onSaved: (id: string, created?: TempPassword) => void;
  onCancel: () => void;
}) {
  const { users, projects, createUserRemote, updateUserRemote, loadUsers } = useCore();
  const { run, error: saveError, saving } = useRemoteSave(loadUsers);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  // the fixed login ID prefix of the signed-in company, e.g. DELTA; undefined for a company without one
  const prefix = loginPrefixFor(tenantId());
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          name: user.name,
          email: user.email,
          phone: user.phone,
          designation: user.designation,
          loginId: user.loginId,
          roles: user.roles ?? [user.role],
          modules: user.modules,
          scopeType: user.scopeType,
          scopeIds: user.scopeIds,
        }
      : {
          name: "",
          email: "",
          phone: "",
          designation: "",
          loginId: "",
          roles: ["Module head"] as ("Module head" | "Approver")[],
          modules: [] as ModuleName[],
          scopeType: "Company" as const,
          scopeIds: [] as string[],
        },
  });
  const [roles, scopeType] = useWatch({
    control,
    name: ["roles", "scopeType"],
  });
  const headSelected = (roles ?? []).includes("Module head");
  /** module → its active head, other than this user */
  const headOf = (m: ModuleName) =>
    users.find(
      (u) =>
        u.id !== user?.id &&
        (u.roles ?? [u.role]).includes("Module head") &&
        u.status === "Active" &&
        u.modules.includes(m),
    );
  const scopeOptions =
    scopeType === "Project"
      ? projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))
      : [];

  const submit = handleSubmit(async (v) => {
    const others = users.filter((u) => u.id !== user?.id);
    if (others.some((u) => u.email.toLowerCase() === v.email.toLowerCase()))
      return setError("email", {
        message: "Another user has this email.",
      });
    // new login IDs are the company prefix and 4 digits (owner decision, 2026-11-22); existing ones are kept
    if (!user && prefix && !matchesCompanyPrefix(v.loginId, prefix))
      return setError("loginId", {
        message: `Login IDs in this company are ${prefix} followed by 4 digits, e.g. ${prefix}1024.`,
      });
    if (
      others.some((u) => u.loginId.toUpperCase() === v.loginId.toUpperCase())
    )
      return setError("loginId", {
        message: "Another user has this login ID.",
      });
    const isHead = v.roles.includes("Module head");
    if (isHead && user?.status !== "Inactive") {
      const clashes = v.modules
        .map((m) => [m, headOf(m)] as const)
        .filter(([, h]) => h);
      if (clashes.length)
        return setError("modules", {
          message: `${clashes.map(([m, h]) => `${m} already has an active head (${h!.name})`).join("; ")}. Deactivate them first or untick ${clashes.length === 1 ? "that module" : "those modules"}; each module has one head.`,
        });
    }
    const draft = {
      name: v.name,
      email: v.email,
      phone: v.phone,
      designation: v.designation,
      roles: v.roles as ("Module head" | "Approver")[],
      modules: isHead ? MODULES.filter((m) => v.modules.includes(m)) : [],
      scopeType: v.scopeType,
      scopeIds: v.scopeType === "Project" ? v.scopeIds : [],
    };
    const fields = ["name", "email", "phone", "designation", "loginId", "roles", "modules", "scopeType", "scopeIds"] as const;
    const onField = (f: string, message: string) => {
      const name = fields.find((x) => x === f);
      if (!name) return false;
      setError(name, { message });
      return true;
    };
    if (user) {
      const done = await run({ id: user.id, ...draft }, (key) => updateUserRemote(user.id, draft, key).then(() => true), onField);
      if (done) onSaved(user.id);
      return;
    }
    const loginId = v.loginId.trim().toUpperCase();
    const created = await run({ loginId, ...draft }, async (key) => {
      try {
        return await createUserRemote(loginId, draft, key);
      } catch (err) {
        if (err instanceof ApiError && err.code === "USER_DUPLICATE_LOGIN") {
          setError("loginId", { message: "Another user has this login ID." });
          return undefined;
        }
        throw err;
      }
    }, onField);
    if (created) onSaved(created.id, { loginId: created.loginId, name: v.name, temporaryPassword: created.temporaryPassword });
  });

  return (
    <form noValidate onSubmit={submit}>
      <h3 className="section-t">Person</h3>
      <div className="form-grid">
        <FormGroup label="Full name" required error={e.name?.message}>
          {(id, d) => (
            <Input
              placeholder="Enter full name"
              autoComplete="off"
              {...a11y(id, d, e.name?.message)}
              {...register("name")}
            />
          )}
        </FormGroup>
        <FormGroup label="Designation" required error={e.designation?.message}>
          {(id, d) => (
            <Input
              placeholder="Enter designation"
              {...a11y(id, d, e.designation?.message)}
              {...register("designation")}
            />
          )}
        </FormGroup>
        <FormGroup label="Email" required error={e.email?.message}>
          {(id, d) => (
            <Input
              type="email"
              placeholder="Enter email address"
              autoComplete="off"
              {...a11y(id, d, e.email?.message)}
              {...register("email")}
            />
          )}
        </FormGroup>
        <FormGroup label="Mobile" required error={e.phone?.message}>
          {(id, d) => (
            <PhoneField
              country={country}
              onCountry={setCountry}
              placeholder="Enter mobile number"
              {...a11y(id, d, e.phone?.message)}
              {...register("phone")}
            />
          )}
        </FormGroup>
        <FormGroup
          label="Login ID"
          required
          error={e.loginId?.message}
          helper={user ? "A login ID cannot change." : prefix ? "Type exactly 4 digits. The company prefix is added for you." : undefined}
        >
          {(id, d) => {
            const reg = register("loginId", {
              // a new login ID is the company prefix and the 4 digits typed; an existing one is kept as it is
              setValueAs: (v: string) => {
                const t = v.trim().toUpperCase();
                return user || !prefix ? t : /^\d{4}$/.test(t) ? `${prefix}${t}` : t;
              },
            });
            const digitsOnly = (raw: string) => raw.replace(/\D/g, "").slice(0, 4);
            if (user || !prefix) {
              return (
                <Input
                  placeholder="e.g. VELOX1234"
                  autoComplete="off"
                  readOnly={!!user}
                  style={{ textTransform: "uppercase" }}
                  {...a11y(id, d, e.loginId?.message)}
                  {...reg}
                />
              );
            }
            return (
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    border: "1px solid var(--line)",
                    borderRight: 0,
                    borderRadius: "10px 0 0 10px",
                    background: "var(--slate-bg)",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {prefix}
                </span>
                <Input
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={4}
                  style={{ borderRadius: "0 10px 10px 0" }}
                  {...a11y(id, d, e.loginId?.message)}
                  {...reg}
                  onChange={(ev) => {
                    ev.target.value = digitsOnly(ev.target.value);
                    return reg.onChange(ev);
                  }}
                />
              </div>
            );
          }}
        </FormGroup>
      </div>

      <h3 className="section-t">Role</h3>
      <div className="radio-cards" role="group" aria-label="Roles">
        {(["Module head", "Approver"] as const).map((r) => (
          <label className="radio-card" key={r}>
            <input type="checkbox" value={r} {...register("roles")} />
            <div>
              <strong>{r === "Approver" ? "High-level approver" : r}</strong>
              <span>{ROLE_INFO[r]}</span>
            </div>
          </label>
        ))}
      </div>
      {e.roles?.message && (
        <p role="alert" style={{ color: "var(--red)", margin: "6px 0 0" }}>
          {e.roles.message}
        </p>
      )}

      <h3 className="section-t">
        {headSelected
          ? "Modules and scope"
          : "Approval scope"}
      </h3>
      <div className="form-grid">
        {headSelected && (
          <fieldset
            className="form-group full"
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <div className="check-grid">
              {MODULES.map((m) => {
                const h = headOf(m);
                return (
                  <CheckRow
                    key={m}
                    value={m}
                    label={
                      <span>
                        {m}{" "}
                        {h ? (
                          <Muted>· current head: {h.name}</Muted>
                        ) : (
                          <Muted>· vacant</Muted>
                        )}
                      </span>
                    }
                    {...register("modules")}
                  />
                );
              })}
            </div>
            {e.modules?.message && (
              <span
                className="helper"
                role="alert"
                style={{ color: "var(--red)" }}
              >
                {e.modules.message}
              </span>
            )}
          </fieldset>
        )}
        <FormGroup label="Scope" required helper="">
          {(id, d) => (
            <Select {...a11y(id, d)} {...register("scopeType")}>
              <option>Company</option>
              <option>Project</option>
            </Select>
          )}
        </FormGroup>
        <div />
        {scopeType !== "Company" && (
          <fieldset
            className="form-group full"
            style={{ border: 0, padding: 0, margin: 0 }}
          >
            <legend style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>
              Projects{" "}
              <span className="required">*</span>
            </legend>
            <div className="check-grid">
              {scopeOptions.map((o) => (
                <CheckRow
                  key={o.id}
                  label={o.label}
                  value={o.id}
                  {...register("scopeIds")}
                />
              ))}
            </div>
            {e.scopeIds?.message && (
              <span
                className="helper"
                role="alert"
                style={{ color: "var(--red)" }}
              >
                {e.scopeIds.message}
              </span>
            )}
          </fieldset>
        )}
      </div>

      {/* {role === "Module head" ? (
        <Note title="What a module head cannot do" icon="lock">
          Edit master data or approval chains, or approve a request they raised.
          Privilege catalogues are placeholders until each module publishes its
          list.
        </Note>
      ) : (
        <Note title="Where approvers are used" icon="workflow">
          Pick this person at any level in the approval matrix. They can never
          approve a request they raised.
        </Note>
      )} */}
      {/* {role === "Module head" && (
        <Note title="Privileges" icon="shield">
          Module privileges are granted one by one on the user’s page after the user is saved; that needs step-up verification.
        </Note>
      )} */}
      {!user && (
        <Note title="Sign-in" icon="key">
          A temporary password is shown once after the user is created. They must change it at the first sign-in.
        </Note>
      )}
      {saveError && (
        <p role="alert" style={{ color: "var(--red)" }}>
          {saveError}
        </p>
      )}
      <div className="form-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="submit"
          tone="primary"
          icon={headSelected ? "shield" : "check"}
          disabled={saving}
        >
          {saving ? "Saving…" : user ? "Save changes" : "Create user"}
        </Button>
      </div>
    </form>
  );
}
