import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/icons";
import { FormGroup, Input } from "@/shared/ui/Field";
import { PhoneField } from "@/shared/ui/PhoneField";
import { a11y } from "@/shared/lib/core";
import { notify } from "@/shared/lib/toast";
import { useAuth } from "../store/useAuth";
import { PublicNav } from "../components/PublicNav";
import { DEFAULT_COUNTRY, dialOf } from "../utils/countryCodes";

const EMAIL = /^\S+@\S+\.\S+$/;
const digitsOf = (s: string) => s.replace(/[\s-]/g, "");
/** Login ID = 3 to 6 letters or digits from the company name, then 4 digits (for example ACME1234). */
const LOGIN_ID = /^[A-Za-z0-9]{3,6}\d{4}$/;

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
    password: z.string().min(8, "Use at least 8 characters."),
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
const sixDigits = () => {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, "0");
};
const suggestLoginId = (company: string, suffix: string) => {
  const stem = company
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
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
}: {
  field: ReactNode;
  current: string;
  valid: () => Promise<boolean>;
  channel: string;
  label: string;
  verifiedValue: string;
  onVerified: (value: string) => void;
}) {
  const sent = useRef({ code: "", to: "" });
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const verified = !!verifiedValue && verifiedValue === current.trim();

  const send = async () => {
    if (!(await valid())) return;
    sent.current = { code: sixDigits(), to: current.trim() };
    setCode("");
    onVerified("");
    setMsg(`OTP sent to your ${channel}. Enter it below.`);
    notify(
      `Demo only, no mail or SMS service yet. ${label} OTP: ${sent.current.code}`,
      8000,
    );
  };
  const validate = () => {
    const ok =
      !!sent.current.code &&
      code === sent.current.code &&
      current.trim() === sent.current.to;
    onVerified(ok ? current.trim() : "");
    setMsg(
      ok
        ? `${label} verified.`
        : "That OTP is not correct, or the value changed after sending.",
    );
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
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
            />
          )}
        </FormGroup>
        <Button type="button" onClick={validate} disabled={verified}>
          {verified ? "Verified" : "Validate OTP"}
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

  const submit = handleSubmit(() => {
    if (!emailOk || !mobileOk) {
      setVerifyErr(
        `Verify your ${!emailOk && !mobileOk ? "email and mobile number" : !emailOk ? "email" : "mobile number"} with an OTP before registering.`,
      );
      return;
    }
    setVerifyErr(null);
    notify(
      "Registration received. Your access will be enabled after approval.",
    );
    navigate("/login?role=user", { replace: true });
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
                label="Company name"
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
                valid={() => trigger("mobile")}
                field={
                  <FormGroup
                    label="Mobile number"
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
                Generated for you from your company name (first 3 to 6 letters
                or digits) plus 4 random digits, like ACME1234. It cannot be
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
