import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import { UnsavedChangesGuard } from "@/shared/ui/UnsavedChangesGuard";
import { useCore } from "@/modules/core-data";
import { CIN_RE, GSTIN_RE, PAN_RE, suggestGstin, TAN_RE, taxIdErrors, taxIdWarnings } from "../utils/taxIds";

const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const schema = z.object({
  legalName: req("Company legal name"),
  tradeName: z.string().trim(),
  cin: z.string().trim().regex(CIN_RE, "CIN is 21 characters, e.g. U45200TG2019PTC134567."),
  gstin: z.string().trim().regex(GSTIN_RE, "GSTIN is 15 characters, e.g. 36AAHCV1234K1Z8."),
  pan: z.string().trim().regex(PAN_RE, "PAN is 10 characters, e.g. AAHCV1234K."),
  tan: z.string().trim().regex(TAN_RE, "TAN is 10 characters, e.g. HYDV01234B."),
  addressLine1: req("Address line 1"),
  addressLine2: z.string().trim(),
  city: req("City"),
  state: req("State"),
  pin,
  country: req("Country"),
  contactName: req("Contact name"),
  contactEmail: email,
  contactPhone: phone,
  website: z.union([
    z.literal(""),
    z.string().trim().url("Enter a full URL starting with https://"),
  ]),
}).superRefine((v, ctx) => {
  // a GSTIN for another PAN, or with a wrong check character, is wrong for certain, so it blocks the save
  for (const [path, message] of Object.entries(taxIdErrors(v))) ctx.addIssue({ code: "custom", path: [path], message });
});
type Values = z.infer<typeof schema>;

const MAX_LOGO = 512 * 1024;
const fields = (c: Profile): Values => {
  const { logo: _logo, offerLetter: _ol, id: _id, code: _code, rowVersion: _rv, ...rest } = c;
  void _logo;
  void _ol;
  void _id;
  void _code;
  void _rv;
  return rest;
};

/** 3.1 Company profile: full-width cards, the logo in the legal identity card; Edit profile opens the form. */
export default function CompanyProfile() {
  const ref = useRef<HTMLDivElement>(null);
  useEnter(ref, "company");
  const company = useCore((s) => s.company);
  const loadOrganisation = useCore((s) => s.loadOrganisation);
  useEffect(() => { void loadOrganisation(); }, [loadOrganisation]);
  const [editing, setEditing] = useState(false);

  return (
    <div ref={ref}>
      <PageHead
        crumb="Company profile"
        title="Company profile"
        desc="Legal identity used across every module."
        actions={
          !editing && (
            <Button
              tone="primary"
              icon="pencil"
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
          )
        }
      />
      {editing ? (
        <ProfileForm company={company} onDone={() => setEditing(false)} />
      ) : (
        <ProfileView company={company} />
      )}
    </div>
  );
}

function ProfileView({ company: c }: { company: Profile }) {
  return (
    <div className="stack">
      <Card title="Legal identity" subtitle="">
        <LogoField editing={false} />
        <div className="detail-grid">
          <KV k="Company legal name" full>
            <strong>{c.legalName}</strong>
          </KV>
          <KV k="Trade name">
            <strong>{c.tradeName || "—"}</strong>
          </KV>
          <KV k="PAN">
            <strong>{c.pan}</strong>
          </KV>
          <KV k="GSTIN">
            <strong>{c.gstin}</strong>
          </KV>
          <KV k="CIN">
            <strong>{c.cin}</strong>
          </KV>
          <KV k="TAN">
            <strong>{c.tan}</strong>
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
      <Card title="Primary contact">
        <div className="detail-grid">
          <KV k="Name">
            <strong>{c.contactName}</strong>
          </KV>
          <KV k="Email">
            <strong>{c.contactEmail}</strong>
          </KV>
          <KV k="Mobile">
            <strong>{c.contactPhone}</strong>
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
        </div>
      </Card>
    </div>
  );
}

function ProfileForm({
  company,
  onDone,
}: {
  company: Profile;
  onDone: () => void;
}) {
  const updateCompanyRemote = useCore((s) => s.updateCompanyRemote);
  const loadOrganisation = useCore((s) => s.loadOrganisation);
  const { run, error: saveError, saving } = useRemoteSave(() => loadOrganisation(true));
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  // a logo chosen or removed here is kept until Save profile; Cancel drops it
  const [logoChange, setLogoChange] = useState<LogoChange | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: fields(company),
  });
  const state = useWatch({ control, name: "state" });
  const [legalName, pan, gstin, cin, tan] = useWatch({ control, name: ["legalName", "pan", "gstin", "cin", "tan"] });
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
    const saved = await run(
      v,
      async (key) => { await updateCompanyRemote(v, key, logoChange ?? undefined); return true; },
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
    <UnsavedChangesGuard when={(isDirty || logoChange !== null) && !saving} what="the company profile" />
    <form onSubmit={submit} noValidate className="stack">
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
          <FormGroup label="Trade name" error={errors.tradeName?.message}>
            {(id, d) => (
              <Input
                {...field("tradeName")(id, d)}
                {...register("tradeName")}
              />
            )}
          </FormGroup>
          <FormGroup label="PAN" required error={errors.pan?.message} helper={note("pan", "The GSTIN is filled in from the PAN and the state.")}>
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
            label="GSTIN"
            required
            helper={note(
              "gstin",
              prefilled
                ? "Filled in from the PAN and the state. Check the 13th character (your registration number in this state, usually 1) against your GST certificate."
                : "Characters 3 to 12 are your PAN.",
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
          <FormGroup
            label="CIN"
            required
            helper={note("cin", "From the certificate of incorporation. It is not part of the PAN.")}
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
          <FormGroup
            label="TAN"
            required
            helper={note("tan", "From the TAN allotment letter. It is not part of the PAN.")}
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
      <Card title="Primary contact">
        <div className="form-grid">
          <FormGroup
            label="Contact name"
            required
            error={errors.contactName?.message}
          >
            {(id, d) => (
              <Input
                {...field("contactName")(id, d)}
                {...register("contactName")}
              />
            )}
          </FormGroup>
          <FormGroup
            label="Email"
            required
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
            required
            error={errors.contactPhone?.message}
          >
            {(id, d) => (
              <PhoneField
                country={country}
                onCountry={setCountry}
                placeholder="Enter mobile number"
                {...field("contactPhone")(id, d)}
                {...register("contactPhone")}
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
