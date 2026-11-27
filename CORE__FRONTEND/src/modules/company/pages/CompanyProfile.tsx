import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWatch, type Resolver } from 'react-hook-form';
import { useGuardedForm as useForm } from '@/shared/lib/useGuardedForm';
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { KV, Muted } from "@/shared/ui/Extras";
import { PhoneField } from "@/shared/ui/PhoneField";
import { DEFAULT_COUNTRY } from "@/shared/lib/countryCodes";
import { FormGroup, Input } from "@/shared/ui/Field";
import { SearchSelect } from "@/shared/ui/SearchSelect";
import { PageHead } from "@/modules/shell";
import type { CompanyProfile as Profile, LogoChange } from "@/modules/core-data";
import { useEnter } from "@/shared/hooks/useMotion";
import { useRemoteSave } from "@/shared/hooks/useRemoteSave";
import { a11y, email, phone, pin, req } from "@/shared/lib/core";
import { notify } from "@/shared/lib/toast";
import { Icon } from "@/shared/ui/icons";
import { Modal } from "@/shared/ui/Modal";
import { useUnsavedGuard } from "@/shared/lib/unsaved";
import { useCore } from "@/modules/core-data";
import { api } from "@/shared/lib/api";
import { useAuth } from "@/modules/auth";
import { CIN_RE, GSTIN_RE, PAN_RE, suggestGstin, TAN_RE, taxIdErrors, taxIdWarnings } from "../utils/taxIds";
import { INDIAN_STATES } from "@/shared/lib/indianStates";

const STATES = INDIAN_STATES;

const COMPANY_TYPES = [
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership Firm" },
  { value: "pvt_ltd", label: "Pvt. Ltd. Company" },
] as const;
const COMPANY_TYPE_LABEL = Object.fromEntries(COMPANY_TYPES.map((t) => [t.value, t.label])) as Record<string, string>;

const schema = z.object({
  legalName: req("Company legal name"),
  tradeName: z.string().trim(),
  // '' is the value of a profile saved before the type existed; the form must pick one before it saves
  companyType: z
    .enum(["", "proprietorship", "partnership", "pvt_ltd"])
    .refine((v) => v !== "", { message: "Select the company type." }),
  // CIN is only asked for a Pvt. Ltd. company (see the superRefine below); GSTIN and TAN are conditional, so blank is allowed
  cin: z.string().trim().refine((v) => v === "" || CIN_RE.test(v), "CIN is 21 characters, e.g. U45200TG2019PTC134567."),
  gstin: z.string().trim().refine((v) => v === "" || GSTIN_RE.test(v), "GSTIN is 15 characters, e.g. 36AAHCV1234K1Z8."),
  pan: z.string().trim().regex(PAN_RE, "PAN is 10 characters, e.g. AAHCV1234K."),
  tan: z.string().trim().refine((v) => v === "" || TAN_RE.test(v), "TAN is 10 characters, e.g. HYDV01234B."),
  addressLine1: req("Address line 1"),
  addressLine2: z.string().trim(),
  city: req("City"),
  state: req("State"),
  pin,
  country: req("Country"),
  // the owner or director details are optional, but once any one of them is filled in all three are needed (see below)
  contactName: z.string().trim(),
  contactEmail: z.string().trim().refine((v) => v === "" || email.safeParse(v).success, "Enter a valid email address."),
  contactPhone: z.string().trim().refine((v) => v === "" || phone.safeParse(v).success, "Enter a 10-digit mobile number."),
  // the six-digit code sent to a changed owner or director mobile number; blank when the number is unchanged
  mobileCode: z.string().trim().refine((v) => v === "" || /^\d{6}$/.test(v), "Enter the 6-digit code."),
  adminName: req("Admin name"),
  adminEmail: email,
  adminPhone: z.string().trim().regex(/^\d{10}$/, "Enter the 10-digit mobile number."),
  website: z.union([
    z.literal(""),
    z.string().trim().url("Enter a full URL starting with https://"),
  ]),
}).superRefine((v, ctx) => {
  // a GSTIN for another PAN, or with a wrong check character, is wrong for certain, so it blocks the save
  for (const [path, message] of Object.entries(taxIdErrors(v))) ctx.addIssue({ code: "custom", path: [path], message });
  // a Pvt. Ltd. company has a certificate of incorporation, so its CIN is mandatory
  if (v.companyType === "pvt_ltd" && v.cin === "") {
    ctx.addIssue({ code: "custom", path: ["cin"], message: "Enter the CIN from the certificate of incorporation." });
  }
  // the owner or director: nothing is needed, but a partly filled owner is not saved; all three are needed once one is
  if (v.contactName !== "" || v.contactEmail !== "" || v.contactPhone !== "") {
    if (v.contactName === "") ctx.addIssue({ code: "custom", path: ["contactName"], message: "Enter the owner or director name, or clear the owner details." });
    if (v.contactEmail === "") ctx.addIssue({ code: "custom", path: ["contactEmail"], message: "Enter the owner or director email, or clear the owner details." });
    if (v.contactPhone === "") ctx.addIssue({ code: "custom", path: ["contactPhone"], message: "Enter the owner or director mobile, or clear the owner details." });
  }
  // a partnership firm must give its GSTIN; for the other types it is only filled in if registered
  if (v.companyType === "partnership" && v.gstin === "") {
    ctx.addIssue({ code: "custom", path: ["gstin"], message: "Enter the GSTIN of the partnership firm." });
  }
});
type Values = z.infer<typeof schema>;

const MAX_LOGO = 512 * 1024;
const fields = (c: Profile): Omit<Values, "mobileCode" | "adminName" | "adminEmail" | "adminPhone"> => {
  const { logo: _logo, offerLetter: _ol, id: _id, code: _code, rowVersion: _rv, ...rest } = c;
  void _logo;
  void _ol;
  void _id;
  void _code;
  void _rv;
  // a saved profile may still have an empty company type; the form's schema makes the user pick one before saving
  return rest as Omit<Values, "mobileCode" | "adminName" | "adminEmail" | "adminPhone">;
};

/** 3.1 Company profile: full-width cards, the logo in the legal identity card; Edit profile opens the form. */
export default function CompanyProfile() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "company");
  const company = useCore((s) => s.company);
  const loadOrganisation = useCore((s) => s.loadOrganisation);
  useEffect(() => { void loadOrganisation(); }, [loadOrganisation]);
  const [editing, setEditing] = useState(false);
  // the signed-in administrator's own details; read again each time the page switches between view and edit
  const [admin, setAdmin] = useState<AdminDetails>(EMPTY_ADMIN);
  const [adminLoaded, setAdminLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    api<{ user: { name: string | null; email: string | null; phone: string | null } }>("GET", "/auth/me")
      .then((r) => {
        if (alive) setAdmin({ name: r.user.name ?? "", email: r.user.email ?? "", phone: r.user.phone ?? "" });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setAdminLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [editing]);

  return (
    <div ref={ref}>
      <PageHead
        crumb="Company profile"
        title="Company profile"
        desc="Legal identity used across every module."
        actions={
          editing ? (
            // Back is only offered while editing: it cancels the unsaved edits and shows the profile again
            <Button icon="chevL" onClick={() => setEditing(false)}>
              Back
            </Button>
          ) : (
            <Button tone="primary" icon="pencil" onClick={() => setEditing(true)}>
              Edit profile
            </Button>
          )
        }
      />
      {editing ? (
        adminLoaded ? (
          <ProfileForm company={company} admin={admin} onDone={() => setEditing(false)} />
        ) : (
          <Muted>Loading…</Muted>
        )
      ) : (
        <ProfileView company={company} admin={admin} />
      )}
    </div>
  );
}

/** The signed-in administrator's own name, email and mobile number. */
interface AdminDetails {
  name: string;
  email: string;
  phone: string;
}
const EMPTY_ADMIN: AdminDetails = { name: "", email: "", phone: "" };

function ProfileView({ company: c, admin }: { company: Profile; admin: AdminDetails }) {
  const adminLoginId = useAuth((s) => s.user);
  return (
    // profile-selects gives the logo placeholder the same light blue as the fields in both view and edit
    <div className="stack profile-selects">
      <Card title="Legal identity" subtitle="">
        <LogoField editing={false} />
        <div className="detail-grid">
          <KV k="Company legal name" full>
            <strong>{c.legalName}</strong>
          </KV>
          <KV k="Company type">
            <strong>{COMPANY_TYPE_LABEL[c.companyType] ?? "—"}</strong>
          </KV>
          <KV k="PAN">
            <strong>{c.pan}</strong>
          </KV>
          <KV k="GSTIN">
            <strong>{c.gstin || "—"}</strong>
          </KV>
          {c.companyType === "pvt_ltd" && (
            <KV k="CIN">
              <strong>{c.cin}</strong>
            </KV>
          )}
          <KV k="TAN">
            <strong>{c.tan || "—"}</strong>
          </KV>
        </div>
      </Card>
      <Card title="Registered address">
        <div className="detail-grid">
          <KV k="Address" full>
            <strong>
              {c.addressLine1}
              {c.addressLine2 ? `, ${c.addressLine2}` : ""}
            </strong>
          </KV>
          <KV k="City">
            <strong>{c.city}</strong>
          </KV>
          <KV k="State">
            <strong>{c.state}</strong>
          </KV>
          <KV k="PIN code">
            <strong>{c.pin}</strong>
          </KV>
          <KV k="Country">
            <strong>{c.country}</strong>
          </KV>
        </div>
      </Card>
      <Card title="Owner or director">
        <div className="detail-grid">
          <KV k="Owner or director name">
            <strong>{c.contactName}</strong>
          </KV>
          <KV k="Website">
            {c.website ? (
              <a
                className="id-link"
                href={c.website}
                target="_blank"
                rel="noreferrer"
              >
                {c.website}
              </a>
            ) : (
              <Muted>—</Muted>
            )}
          </KV>
          <KV k="Email">
            <strong>{c.contactEmail}</strong>
          </KV>
          <KV k="Mobile">
            <strong>{c.contactPhone}</strong>
          </KV>
        </div>
      </Card>
      <Card title="Admin details" subtitle="The authorised administrator responsible for managing and overseeing the organisation's account">
        <div className="detail-grid">
          <KV k="Admin login ID">
            <strong>{adminLoginId ?? "—"}</strong>
          </KV>
          <KV k="Name">
            <strong>{admin.name || "—"}</strong>
          </KV>
          <KV k="Email">
            <strong>{admin.email || "—"}</strong>
          </KV>
          <KV k="Mobile">
            <strong>{admin.phone || "—"}</strong>
          </KV>
        </div>
      </Card>
    </div>
  );
}

function ProfileForm({
  company,
  admin,
  onDone,
}: {
  company: Profile;
  admin: AdminDetails;
  onDone: () => void;
}) {
  const updateCompanyRemote = useCore((s) => s.updateCompanyRemote);
  const adminLoginId = useAuth((s) => s.user);
  const loadOrganisation = useCore((s) => s.loadOrganisation);
  const { run, error: saveError, saving } = useRemoteSave(() => loadOrganisation(true));
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  // a logo chosen or removed here is kept until Save profile; Cancel drops it
  const [logoChange, setLogoChange] = useState<LogoChange | null>(null);
  // a staged logo is unsaved too (the form's own fields are registered by useGuardedForm)
  useUnsavedGuard(logoChange !== null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Values>({
    // the schema's input allows an empty company type until the user picks one, so the resolver is typed to the form
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      ...fields(company),
      mobileCode: "",
      adminName: admin.name,
      adminEmail: admin.email,
      adminPhone: admin.phone,
    },
  });
  const state = useWatch({ control, name: "state" });
  const [contactName, contactEmail, contactPhone] = useWatch({ control, name: ["contactName", "contactEmail", "contactPhone"] });
  // a change to the owner or director (name, email or mobile) is proved with a code sent to the mobile number.
  // Other changes, and an owner left as it was, need no code.
  const ownerChanged =
    (contactName ?? "") !== (company.contactName ?? "") ||
    (contactEmail ?? "") !== (company.contactEmail ?? "") ||
    (contactPhone ?? "") !== (company.contactPhone ?? "");
  const needsCode = ownerChanged && !!contactPhone;
  const [sending, setSending] = useState(false);
  const [codeNote, setCodeNote] = useState("");
  const sendCode = async () => {
    const digits = (contactPhone ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) {
      setError("contactPhone", { message: "Enter the 10-digit mobile number first." });
      return;
    }
    setSending(true);
    setCodeNote("");
    try {
      const sent = await api<{ expiresAt: string; developmentCode?: string }>("POST", "/auth/register/otp", {
        body: { channel: "mobile", target: `+91${digits}` },
        auth: false,
      });
      // development only: the server returns the code, so it is shown here; production returns none
      setCodeNote(sent.developmentCode ? `Development code: ${sent.developmentCode}` : "A code was sent to the new mobile number.");
    } catch (err) {
      setCodeNote(err instanceof Error ? err.message : "The code could not be sent. Try again.");
    } finally {
      setSending(false);
    }
  };
  const [legalName, pan, gstin, cin, tan] = useWatch({ control, name: ["legalName", "pan", "gstin", "cin", "tan"] });
  const companyType = useWatch({ control, name: "companyType" });
  const field = (k: keyof Values) => (id: string, d?: string) =>
    a11y(id, d, errors[k]?.message);
  // Pre-fill the GSTIN from the PAN and the state while the field is empty or still holds the last pre-fill, so a
  // GSTIN the user typed is never replaced. The registration number in it (usually 1) is for the user to confirm.
  const suggested = suggestGstin(pan ?? "", state ?? "");
  const lastFill = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!suggested) return;
    const current = gstin ?? "";
    if (current !== "" && current !== lastFill.current) return;
    if (current === suggested) return;
    lastFill.current = suggested;
    setValue("gstin", suggested, { shouldDirty: true, shouldValidate: true });
  }, [suggested, gstin, setValue]);
  // the GSTIN still matches the pattern built from the PAN and state, so its registration number is unconfirmed
  const prefilled = !!gstin && gstin === suggested;
  const warnings = taxIdWarnings({ legalName: legalName ?? "", pan: pan ?? "", gstin: gstin ?? "", cin: cin ?? "", tan: tan ?? "", state: state ?? "" });
  /** A field's note: a warning (the user may still save) or the usual hint. Errors show instead of both. */
  const note = (k: keyof typeof warnings, hint?: ReactNode): ReactNode =>
    warnings[k] ? <span className="warn-text">{warnings[k]}</span> : hint;
  const submit = handleSubmit(async (v) => {
    const names = Object.keys(v);
    if (needsCode && !v.mobileCode) {
      setError("mobileCode", { message: "Send a code to the new mobile number and enter it." });
      return;
    }
    const adminChanged = v.adminName !== admin.name || v.adminEmail !== admin.email || v.adminPhone !== admin.phone;
    const saved = await run(
      v,
      async (key) => {
        await updateCompanyRemote(v as Parameters<typeof updateCompanyRemote>[0], key, logoChange ?? undefined);
        if (adminChanged) {
          await api("PUT", "/auth/me/details", { body: { name: v.adminName, email: v.adminEmail, phone: v.adminPhone } });
        }
        return true;
      },
      (f, m) => {
        if (!names.includes(f)) return false;
        setError(f as keyof Values, { message: m });
        return true;
      },
    );
    if (!saved) return;
    notify("Company profile saved");
    onDone();
  });
  return (
    <>
    <form onSubmit={submit} noValidate className="stack profile-selects">
      <Card
        title="Legal identity"
        subtitle="As registered with the Ministry of Corporate Affairs"
      >
        <LogoField editing staged={logoChange} onStage={setLogoChange} />
        <div className="form-grid">
          <FormGroup
            label="Company legal name"
            required
            error={errors.legalName?.message}
          >
            {(id, d) => (
              <Input
                {...field("legalName")(id, d)}
                {...register("legalName")}
              />
            )}
          </FormGroup>
          <FormGroup label="Company type" required error={errors.companyType?.message}>
            {(id) => (
              <SearchSelect
                id={id}
                ariaLabel="Company type"
                placeholder="Select company type"
                searchPlaceholder="Search company types…"
                value={companyType}
                popupClassName="profile-pop"
                options={COMPANY_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                onSelect={(v) => {
                  setValue("companyType", v as Values["companyType"], {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  // a CIN typed for a Pvt. Ltd. company does not carry over to a type that has none
                  if (v !== "pvt_ltd") setValue("cin", "", { shouldDirty: true, shouldValidate: true });
                }}
              />
            )}
          </FormGroup>
          <FormGroup label="PAN" required error={errors.pan?.message}>
            {(id, d) => (
              <Input
                {...field("pan")(id, d)}
                className="uppercase"
                {...register("pan", {
                  setValueAs: (v: string) => v.toUpperCase(),
                })}
              />
            )}
          </FormGroup>
          <FormGroup
            label={companyType === "partnership" ? "GSTIN" : "GSTIN (if registered)"}
            required={companyType === "partnership"}
            helper={note(
              "gstin",
              prefilled
                ? ""
                : "",
            )}
            error={errors.gstin?.message}
          >
            {(id, d) => (
              <Input
                {...field("gstin")(id, d)}
                className="uppercase"
                maxLength={15}
                {...register("gstin", {
                  setValueAs: (v: string) => v.toUpperCase(),
                })}
              />
            )}
          </FormGroup>
          {/* the certificate of incorporation exists only for a Pvt. Ltd. company, so CIN is asked for that type alone */}
          {companyType === "pvt_ltd" && (
            <FormGroup
              label="CIN"
              required
              helper={note("cin", "")}
              error={errors.cin?.message}
            >
              {(id, d) => (
                <Input
                  {...field("cin")(id, d)}
                  className="uppercase"
                  maxLength={21}
                  {...register("cin", {
                    setValueAs: (v: string) => v.toUpperCase(),
                  })}
                />
              )}
            </FormGroup>
          )}
          <FormGroup
            label="TAN (if applicable)"
            helper={note("tan", "")}
            error={errors.tan?.message}
          >
            {(id, d) => (
              <Input
                {...field("tan")(id, d)}
                className="uppercase"
                maxLength={10}
                {...register("tan", {
                  setValueAs: (v: string) => v.toUpperCase(),
                })}
              />
            )}
          </FormGroup>
        </div>
      </Card>
      <Card title="Registered address">
        <div className="form-grid">
          <FormGroup
            label="Address line 1"
            required
            full
            error={errors.addressLine1?.message}
          >
            {(id, d) => (
              <Input
                {...field("addressLine1")(id, d)}
                {...register("addressLine1")}
              />
            )}
          </FormGroup>
          <FormGroup label="Address line 2" full>
            {(id, d) => (
              <Input
                {...field("addressLine2")(id, d)}
                {...register("addressLine2")}
              />
            )}
          </FormGroup>
          <FormGroup label="City" required error={errors.city?.message}>
            {(id, d) => (
              <Input {...field("city")(id, d)} {...register("city")} />
            )}
          </FormGroup>
          <FormGroup label="State" required error={errors.state?.message}>
            {(id) => (
              <SearchSelect
                id={id}
                ariaLabel="State"
                placeholder="Select state"
                searchPlaceholder="Search states…"
                value={state}
                popupClassName="profile-pop"
                options={STATES.map((s) => ({ value: s, label: s }))}
                onSelect={(v) =>
                  setValue("state", v, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
              />
            )}
          </FormGroup>
          <FormGroup label="PIN code" required error={errors.pin?.message}>
            {(id, d) => (
              <Input
                inputMode="numeric"
                maxLength={6}
                {...field("pin")(id, d)}
                {...register("pin")}
              />
            )}
          </FormGroup>
          <FormGroup label="Country" required error={errors.country?.message}>
            {(id, d) => (
              <Input {...field("country")(id, d)} {...register("country")} />
            )}
          </FormGroup>
        </div>
      </Card>
      <Card title="Admin details" subtitle="The administrator who signs in to this company">
        <div className="form-grid">
          {/* the admin login ID comes from the signed-in account and cannot be edited here */}
          <FormGroup label="Admin login ID">
            {(id, d) => (
              <Input id={id} aria-describedby={d} value={adminLoginId ?? ""} readOnly disabled />
            )}
          </FormGroup>
          <FormGroup label="Admin name" required error={errors.adminName?.message}>
            {(id, d) => (
              <Input {...field("adminName")(id, d)} {...register("adminName")} />
            )}
          </FormGroup>
          <FormGroup label="Admin email" required error={errors.adminEmail?.message}>
            {(id, d) => (
              <Input type="email" {...field("adminEmail")(id, d)} {...register("adminEmail")} />
            )}
          </FormGroup>
          <FormGroup label="Admin mobile" required error={errors.adminPhone?.message}>
            {(id, d) => (
              <Input
                type="tel"
                inputMode="tel"
                placeholder="10-digit mobile number"
                {...field("adminPhone")(id, d)}
                {...register("adminPhone")}
              />
            )}
          </FormGroup>
        </div>
      </Card>
      <Card title="Owner or director">
        <div className="form-grid">
          <FormGroup
            label="Owner or director name"
            error={errors.contactName?.message}
          >
            {(id, d) => (
              <Input
                {...field("contactName")(id, d)}
                {...register("contactName")}
              />
            )}
          </FormGroup>
          <FormGroup label="Website" error={errors.website?.message}>
            {(id, d) => (
              <Input
                type="url"
                placeholder="Enter website address"
                {...field("website")(id, d)}
                {...register("website")}
              />
            )}
          </FormGroup>
          <FormGroup
            label="Email"
            error={errors.contactEmail?.message}
          >
            {(id, d) => (
              <Input
                type="email"
                {...field("contactEmail")(id, d)}
                {...register("contactEmail")}
              />
            )}
          </FormGroup>
          <FormGroup
            label="Mobile"
            error={errors.contactPhone?.message}
          >
            {(id, d) => (
              <PhoneField
                country={country}
                onCountry={setCountry}
                popupClassName="profile-pop"
                placeholder="Enter mobile number"
                {...field("contactPhone")(id, d)}
                {...register("contactPhone")}
              />
            )}
          </FormGroup>
          {needsCode && (
            <FormGroup
              label="Mobile code"
              required
              error={errors.mobileCode?.message}
              helper={codeNote || "Send a code to the mobile number and enter it here to save the profile."}
            >
              {(id, d) => (
                <div className="file-actions">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    {...field("mobileCode")(id, d)}
                    {...register("mobileCode")}
                  />
                  <Button type="button" onClick={sendCode} disabled={sending}>
                    {sending ? "Sending…" : "Send code"}
                  </Button>
                </div>
              )}
            </FormGroup>
          )}
        </div>
        {saveError && (
          <p className="login-error" role="alert" style={{ margin: 0 }}>
            <Icon name="alert" />
            {saveError}
          </p>
        )}
        <div className="form-actions">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" tone="primary" icon="check" disabled={saving}>
            Save profile
          </Button>
        </div>
      </Card>
    </form>
    </>
  );
}

/**
 * The company logo, shown at the top of the legal identity card. While the profile is edited, a chosen file or a
 * removal is only staged (`staged`, held by the form): nothing is sent until Save profile is clicked.
 */
function LogoField({
  editing,
  staged = null,
  onStage,
}: {
  editing: boolean;
  staged?: LogoChange | null;
  onStage?: (change: LogoChange | null) => void;
}) {
  const savedLogo = useCore((s) => s.company.logo);
  const logo = staged === "remove" ? "" : staged ? staged.dataUrl : savedLogo;
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const onLogo = (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type))
      return setError("Use a PNG or JPG file.");
    if (file.size > MAX_LOGO)
      return setError("Logo must be 512 KB or smaller.");
    const reader = new FileReader();
    reader.onload = () => onStage?.({ file, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };
  return (
    <div className="logo-row" style={{ marginBottom: 18 }}>
        {logo ? (
          <button
            type="button"
            className="logo-prev logo-prev-btn"
            aria-label="Preview company logo"
            onClick={() => setPreview(true)}
          >
            <img src={logo} alt="" />
          </button>
        ) : (
          <div className="logo-prev">
            <Icon name="company" size={32} />
          </div>
        )}
        {logo && (
          <Modal open={preview} onOpenChange={setPreview} title="Company logo">
            <img className="logo-full" src={logo} alt="Company logo" />
          </Modal>
        )}
        <div className="stack" style={{ gap: 8, minWidth: 0, flex: 1 }}>
          {editing ? (
            <>
              <FormGroup
                label={logo ? "Change logo" : "Upload logo"}
                error={error || undefined}
                helper={staged ? "The logo changes when you click Save profile." : "PNG or JPG, up to 512 KB."}
              >
                {(id, d) => (
                  <div>
                    <input
                      type="file"
                      className="sr-only file-pick-input"
                      accept="image/png,image/jpeg"
                      {...a11y(id, d, error)}
                      onChange={(e) => {
                        onLogo(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <div className="file-actions">
                      <label htmlFor={id} className="file-pick">
                        <Icon name="upload" size={18} />
                        <span>
                          {staged && staged !== "remove" ? staged.file.name : "Choose file"}
                        </span>
                      </label>
                      {logo && (
                        <Button
                          icon="trash"
                          onClick={() => {
                            setError("");
                            // a logo already saved is removed on Save; one only chosen here is simply dropped
                            onStage?.(savedLogo ? "remove" : null);
                          }}
                        >
                          Remove logo
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </FormGroup>
            </>
          ) : (
            <Muted>Company logo. Click “Edit profile” to upload or change it.</Muted>
          )}
        </div>
    </div>
  );
}
