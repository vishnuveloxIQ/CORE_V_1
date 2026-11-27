import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useWatch } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/icons";
import { FormGroup, Input } from "@/shared/ui/Field";
import { PhoneField } from "@/shared/ui/PhoneField";
import { a11y } from "@/shared/lib/core";
import { api, errorText, setTenantId } from "@/shared/lib/api";
import { notify } from "@/shared/lib/toast";
import { useAuth } from "../store/useAuth";
import { PublicNav } from "../components/PublicNav";
import { DEFAULT_COUNTRY, dialOf } from "../utils/countryCodes";

const EMAIL = /^\S+@\S+\.\S+$/;
const digitsOf = (s: string) => s.replace(/[\s-]/g, "");
/** Login ID = 3 to 6 letters or digits from the company name, then 4 digits (for example ACME1234). */
const LOGIN_ID = /^[A-Za-z]{3,6}\d{4}$/;

const schema = z
  .object({
    company: z.string().trim().min(1, "Enter your company name."),
    email: z.string().trim().regex(EMAIL, "Enter a valid email address."),
    // The national number only: the country code is chosen separately.
    mobile: z
      .string()
      .trim()
      .refine(
        (v) => /^\d{6,15}$/.test(digitsOf(v)),
        "Enter a valid mobile number (6 to 15 digits, without the country code).",
      ),
    loginId: z
      .string()
      .trim()
      .regex(
        LOGIN_ID,
        "Enter a company name with at least 3 letters or digits to generate your login ID.",
      ),
    password: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string().min(1, "Confirm your password."),
    terms: z.literal(true, { message: "Accept the terms to continue." }),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match.",
  });

type Form = z.input<typeof schema>;

const randomDigits = (n: number) => {
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  return Array.from(r, (x) => String(x % 10)).join("");
};
const suggestLoginId = (company: string, suffix: string) => {
  const stem = company
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 6);
  return stem.length >= 3 ? (stem + suffix).toUpperCase() : "";
};

/** A password box with its own Show/Hide toggle. */
function PasswordInput({
  id,
  d,
  error,
  show,
  onToggle,
  ...rest
}: {
  id: string;
  d: string | undefined;
  error?: string;
  show: boolean;
  onToggle: () => void;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="reg-pw">
      <Input
        type={show ? "text" : "password"}
        autoComplete="new-password"
        {...a11y(id, d, error)}
        {...rest}
      />
      <button
        type="button"
        className="reg-eye"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        onClick={onToggle}
      >
        <Icon name={show ? "eyeOff" : "eye"} size={18} />
      </button>
    </div>
  );
}

/** Field + Send OTP, then an OTP box + Validate. Reports the value it verified; editing the value un-verifies it. */
function VerifyRow({
  field,
  current,
  valid,
  channel,
  label,
  verifiedValue,
  onVerified,
  code,
  onCode,
}: {
  field: ReactNode;
  current: string;
  valid: () => Promise<boolean>;
  channel: string;
  label: string;
  verifiedValue: string;
  onVerified: (value: string) => void;
  code: string;
  onCode: (value: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const verified = !!verifiedValue && verifiedValue === current.trim();

  // The server sends the code (and, in development, writes it to its log). The check happens when the form is submitted.
  const send = async () => {
    if (!(await valid())) return;
    onVerified("");
    onCode("");
    try {
      const sent = await api<{ expiresAt: string; developmentCode?: string }>("POST", "/auth/register/otp", {
        body: { channel, target: current.trim() },
        auth: false,
      });
      // Development only: the server returns the code, so it is shown here. Production returns no code.
      setMsg(
        sent.developmentCode
          ? `Development code: ${sent.developmentCode}. Enter it below.`
          : `A code was sent to your ${channel}. Enter it below.`,
      );
    } catch (err) {
      setMsg(errorText(err));
    }
  };
  const validate = () => {
    if (!/^\d{6}$/.test(code)) {
      setMsg("Enter the six-digit code.");
      return;
    }
    onVerified(current.trim());
    setMsg(`${label} code entered. It is checked when you register.`);
  };

  return (
    <>
      <div className="reg-row">
        {field}
        <Button type="button" onClick={send}>
          {verified ? "Resend OTP" : "Send OTP"}
        </Button>
      </div>
      <div className="reg-row">
        <FormGroup
          label={`${label} OTP`}
          required
          error={verified ? undefined : (msg ?? undefined)}
        >
          {(id, d) => (
            <Input
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              disabled={verified}
              {...a11y(id, d, verified ? undefined : (msg ?? undefined))}
              onChange={(ev) => onCode(ev.target.value.replace(/\D/g, ""))}
            />
          )}
        </FormGroup>
        <Button type="button" onClick={validate} disabled={verified}>
          {verified ? "Verified" : "Confirm OTP"}
        </Button>
      </div>
    </>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [okEmail, setOkEmail] = useState("");
  const [okMobile, setOkMobile] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [mobileCode, setMobileCode] = useState("");
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const suffix = useRef(randomDigits(4));
  const {
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    formState: { errors: e, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      company: "",
      email: "",
      mobile: "",
      loginId: "",
      password: "",
      confirm: "",
      terms: false as unknown as true,
    },
  });
  const [company, email, mobile] = useWatch({
    control,
    name: ["company", "email", "mobile"],
  });
  useEffect(() => {
    document.title = "Register | VeloxIQ";
  }, []);
  // The login ID is generated only: it follows the company name and is never typed by the user.
  useEffect(() => {
    setValue("loginId", suggestLoginId(company, suffix.current), {
      shouldValidate: false,
    });
  }, [company, setValue]);
  if (user) return <Navigate to="/dashboard" replace />;

  const emailOk = !!okEmail && okEmail === email.trim();
  // Full number with the country code, for example +919876543210. Changing either part un-verifies it.
  const mobileFull = dialOf(country) + digitsOf(mobile.trim());
  const mobileOk = !!okMobile && okMobile === mobileFull;

  const submit = handleSubmit(async (v) => {
    if (!emailOk || !mobileOk) {
      setVerifyErr(
        `Confirm the code sent to your ${!emailOk && !mobileOk ? "email and mobile number" : !emailOk ? "email" : "mobile number"} before registering.`,
      );
      return;
    }
    setVerifyErr(null);
    try {
      const created = await api<{ tenantId: string; loginId: string }>("POST", "/auth/register", {
        body: {
          company: v.company.trim(),
          email: v.email.trim(),
          mobile: mobileFull,
          emailCode,
          mobileCode,
          loginId: v.loginId.trim(),
          password: v.password,
        },
        auth: false,
      });
      setTenantId(created.tenantId);
      notify(`Company registered. Sign in with login ID ${created.loginId}.`, 8000);
      navigate("/login", { replace: true });
    } catch (err) {
      setVerifyErr(errorText(err));
    }
  });

  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <main className="pub-main reg-wrap">
        <section className="card">
          <div className="card-b">
            <div className="reg-pill">
              <span className="reg-dot" />
              SECURITY POLICY ACTIVE
            </div>
            <h1 className="reg-title">Registration!</h1>
            <p className="reg-sub">Register for Admin</p>
            <form
              noValidate
              onSubmit={submit}
              className="stack"
              style={{ gap: 16 }}
            >
              <FormGroup
                label="Company Name"
                required
                error={e.company?.message}
              >
                {(id, d) => (
                  <Input
                    placeholder="Enter company name"
                    autoComplete="organization"
                    {...a11y(id, d, e.company?.message)}
                    {...register("company")}
                  />
                )}
              </FormGroup>
              <VerifyRow
                label="Email"
                channel="email"
                current={email}
                verifiedValue={okEmail}
                onVerified={setOkEmail}
                code={emailCode}
                onCode={setEmailCode}
                valid={() => trigger("email")}
                field={
                  <FormGroup label="Email" required error={e.email?.message}>
                    {(id, d) => (
                      <Input
                        type="email"
                        placeholder="Enter email address"
                        autoComplete="email"
                        {...a11y(id, d, e.email?.message)}
                        {...register("email")}
                      />
                    )}
                  </FormGroup>
                }
              />
              <VerifyRow
                label="Mobile"
                channel="mobile"
                current={mobileFull}
                verifiedValue={okMobile}
                onVerified={setOkMobile}
                code={mobileCode}
                onCode={setMobileCode}
                valid={() => trigger("mobile")}
                field={
                  <FormGroup
                    label="Mobile Number"
                    required
                    error={e.mobile?.message}
                  >
                    {(id, d) => (
                      <PhoneField
                        country={country}
                        onCountry={setCountry}
                        placeholder="Enter mobile number"
                        autoComplete="tel-national"
                        {...a11y(id, d, e.mobile?.message)}
                        {...register("mobile")}
                      />
                    )}
                  </FormGroup>
                }
              />
              {verifyErr && (
                <p className="reg-err" role="alert">
                  {verifyErr}
                </p>
              )}
              <div className="reg-row">
                <FormGroup label="Login ID" error={e.loginId?.message}>
                  {(id, d) => (
                    <Input
                      readOnly
                      placeholder="Generated from your company name"
                      autoComplete="off"
                      spellCheck={false}
                      {...a11y(id, d, e.loginId?.message)}
                      {...register("loginId")}
                    />
                  )}
                </FormGroup>
              </div>
              <p className="reg-hint">
                Generated for you from your company name (first 3 to 6 letters) plus 4 random digits, like ACME1234. <br /> It cannot be
                edited.
              </p>
              <div className="reg-pair">
                <FormGroup
                  label="Password"
                  required
                  error={e.password?.message}
                >
                  {(id, d) => (
                    <PasswordInput
                      id={id}
                      d={d}
                      error={e.password?.message}
                      show={showPw}
                      onToggle={() => setShowPw((v) => !v)}
                      {...register("password")}
                    />
                  )}
                </FormGroup>
                <FormGroup
                  label="Confirm password"
                  required
                  error={e.confirm?.message}
                >
                  {(id, d) => (
                    <PasswordInput
                      id={id}
                      d={d}
                      error={e.confirm?.message}
                      show={showConfirm}
                      onToggle={() => setShowConfirm((v) => !v)}
                      {...register("confirm")}
                    />
                  )}
                </FormGroup>
              </div>
              <label className="reg-terms">
                <input type="checkbox" {...register("terms")} />{" "}
                <span>Terms &amp; Conditions</span>
              </label>
              {e.terms && (
                <p className="reg-err" role="alert">
                  {e.terms.message}
                </p>
              )}
              <Button
                type="submit"
                tone="primary"
                disabled={isSubmitting}
                className="login-btn"
              >
                Register
              </Button>
            </form>
            <p className="login-foot">
              Already registered? <Link to="/login">Login</Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
