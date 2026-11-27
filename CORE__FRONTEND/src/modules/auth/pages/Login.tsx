import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, type ChangeEvent } from "react";
import { type UseFormRegisterReturn } from 'react-hook-form';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import logo from "@/shared/assets/veloxiq-logo.svg";
import { Button } from "@/shared/ui/Button";
import { FormGroup, Input } from "@/shared/ui/Field";
import { a11y } from "@/shared/lib/core";
import { notify } from "@/shared/lib/toast";
import { clearTenantId, tenantId } from "@/shared/lib/api";
import { rememberLoginRole } from "../utils/loginRole";
import { ADMIN_PRIVILEGE, useAuth, type LoginResult } from "../store/useAuth";

/**
 * The admin login takes only an administrator (holds access.manage); the user login takes everyone else. Returns the
 * message for an account on the wrong login, or null when it belongs there.
 */
function wrongLoginFor(role: "admin" | "user"): string | null {
  const isAdmin = useAuth.getState().privileges.includes(ADMIN_PRIVILEGE);
  if (role === "user" && isAdmin)
    return "This login ID does not sign in on the user login. Try a different password, or login as admin.";
  if (role === "admin" && !isAdmin)
    return "This login ID does not sign in on the admin login. Try a different password, or login as user.";
  return null;
}

/** Signs the account out again when it is on the wrong login, and returns the message to show. */
async function refuseWrongLogin(role: "admin" | "user"): Promise<string | null> {
  const message = wrongLoginFor(role);
  if (message) await useAuth.getState().logout();
  return message;
}
import { Icon } from "@/shared/ui/icons";
import { PublicNav } from "../components/PublicNav";

const schema = z.object({
  loginId: z.string().trim().min(1, "Enter your login ID."),
  password: z.string().min(1, "Enter your password."),
});

/**
 * Signs in with a passkey for the login ID typed in the form. The company comes from the login ID prefix, as it
 * does for a password. A cancelled or failed attempt shows the store's message.
 */
async function signInWithPasskey(
  loginId: string,
  signIn: (id: string) => Promise<LoginResult>,
  fail: (message: string) => void,
  done: () => void | Promise<void>,
) {
  const id = loginId.trim();
  if (!id) return fail("Enter your login ID first.");
  const before = tenantId();
  clearTenantId();
  const result = await signIn(id);
  if (result === "ok") {
    const switching = !!before && before !== tenantId();
    await done();
    // a different company's data may be in memory: reload so only this company's data loads
    if (switching) window.location.reload();
    return;
  }
  fail(useAuth.getState().lastError || "Passkey sign-in failed. Try again.");
}

/** Only send people back to a page inside this app. */
const clock = () => Date.now();

/** Login IDs are capitals: the field shows and keeps them upper-cased as they are typed. */
const capitals = (field: UseFormRegisterReturn) => ({
  ...field,
  onChange: (e: ChangeEvent<HTMLInputElement>) => {
    e.target.value = e.target.value.toUpperCase();
    return field.onChange(e);
  },
});

const safeNext = (next: string | null) =>
  next && next.startsWith("/") && !next.startsWith("//") && next !== "/login"
    ? next
    : "/dashboard";

function AdminLogin() {
  const sessionReplaced = useAuth((s) => s.sessionReplaced);
  const navigate = useNavigate();
  // an administrator always starts at the dashboard, whatever page the sign-in was for
  const next = "/dashboard";
  const { user, login, loginWithPasskey, lockedUntil } = useAuth();
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(clock);
  const locked = lockedUntil > now;
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors: e, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { loginId: "", password: "" },
  });

  // tick while locked so the countdown and the button update
  useEffect(() => {
    if (lockedUntil <= clock()) return;
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);

  useEffect(() => {
    document.title = "Admin login | VeloxIQ CORE";
  }, []);
  // a sign-out only skips ?next= once; later deep links work again
  const clearSignedOut = useAuth((s) => s.clearSignedOut);
  useEffect(() => {
    clearSignedOut();
  }, [clearSignedOut]);

  if (user && !wrongLoginFor("admin")) return <Navigate to={next} replace />;

  const submit = handleSubmit(async ({ loginId, password }) => {
    setError("");
    const before = tenantId();
    clearTenantId();
    const result = await login(loginId, password);
    const switching = !!before && before !== tenantId();
    setNow(clock());
    if (result === "ok") {
      const wrong = await refuseWrongLogin("admin");
      if (wrong) return setError(wrong);
      rememberLoginRole("admin");
      notify("Signed in");
      navigate(next, { replace: true });
      // a different company's data may be in memory: reload so only this company's data loads
      if (switching) window.location.reload();
      return;
    }
    // while locked, the banner and the button count down from the live clock
    if (result === "locked") return;
    if (result === "offline")
      return setError("Cannot reach the server. Check your connection and try again.");
    if (result === "invalid")
      return setError(
        "Invalid User ID or Password. Your account will be temporarily locked after five consecutive failed attempts. Please contact the Super Administrator for account reset. ",
      );
    setError(useAuth.getState().lastError || "Sign-in failed. Try again.");
  });

  const secondsLeft = Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <div className="login-page pub-embed">
        <div className="login-wrap">
          <section className="plan login-hero" aria-hidden>
            <span className="tag">Admin</span>
            <h2>A Centralised Platform for Organisation-Wide Governance</h2>
            <p>
              Manage and oversee master data, corporate policies, approval hierarchies and grievance procedures, all established and approved by the Tenant Administrator.
            </p>
            <ul className="login-points">
              <li>
                <Icon name="workflow" />
                Configurable Approval Hierarchy as Required <br /> (Levels 1–4)
              </li>
              <li>
                <Icon name="scroll" />
                Versioned policies
              </li>
              <li>
                <Icon name="shield" />
                Step-up checks for sensitive changes
              </li>
            </ul>
          </section>
          <section className="card login-card">
            <div className="card-b">
              <img
                src={logo}
                alt="VeloxIQ Technologies Pvt Ltd"
                width={150}
                height={56}
                className="login-logo"
              />
              <h1 className="login-title">Login</h1>
              <p className="login-sub">
                Use your administrator account credentials to login .
              </p>
              <form
                noValidate
                onSubmit={submit}
                className="stack"
                style={{ gap: 16 }}
              >
                {sessionReplaced && (
                  <div className="info-box" role="status" style={{ marginBottom: 4 }}>
                    <span>You signed in on another device, so this session has ended.</span>
                  </div>
                )}
                {locked && (
                  <div className="login-error" role="alert">
                    <span>{`Too many attempts. Try again in ${secondsLeft} seconds.`}</span>
                  </div>
                )}
                {!locked && error && (
                  <div className="login-error" role="alert">
                    <span>{error}</span>
                  </div>
                )}
                <FormGroup label="Login ID" required error={e.loginId?.message}>
                  {(id, d) => (
                    <Input
                      autoComplete="username"
                      autoFocus
                      autoCapitalize="none"
                      spellCheck={false}
                      {...a11y(id, d, e.loginId?.message)}
                      {...capitals(register("loginId"))}
                    />
                  )}
                </FormGroup>
                <FormGroup
                  label="Password"
                  required
                  error={e.password?.message}
                >
                  {(id, d) => (
                    <div className="pw-wrap">
                      <Input
                        type={show ? "text" : "password"}
                        autoComplete="current-password"
                        {...a11y(id, d, e.password?.message)}
                        {...register("password")}
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShow((s) => !s)}
                        aria-label={show ? "Hide password" : "Show password"}
                        aria-pressed={show}
                      >
                        <Icon name={show ? "eyeOff" : "eye"} />
                      </button>
                    </div>
                  )}
                </FormGroup>
                <Button
                  type="submit"
                  tone="primary"
                  icon="key"
                  disabled={isSubmitting || locked}
                  className="login-btn"
                >
                  {locked
                    ? `Locked, try in ${secondsLeft}s`
                    : isSubmitting
                      ? "Signing in…"
                      : "Login"}
                </Button>
              </form>
              <Button
                type="button"
                icon="fingerprint"
                disabled={locked}
                className="login-btn"
                onClick={() =>
                  void signInWithPasskey(getValues("loginId"), loginWithPasskey, setError, async () => {
                    const wrong = await refuseWrongLogin("admin");
                    if (wrong) return setError(wrong);
                    rememberLoginRole("admin");
                    notify("Signed in");
                    navigate(next, { replace: true });
                  })
                }
              >
                Sign in with passkey
              </Button>
              <Link
                to="/forgot?role=admin"
                className="btn secondary login-btn login-forgot"
              >
                Forgot password?
              </Link>
              <p className="login-foot">
                Module users should login as user, not as an administrator.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const userSchema = z.object({
  loginId: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9]{3,6}\d{4}$/,
      "Enter your login ID, for example ACME1234.",
    ),
  password: z.string().min(1, "Enter your password."),
});

/** Signs in through POST /auth/login, the same call as the admin login. */
function UserLogin() {
  const sessionReplaced = useAuth((s) => s.sessionReplaced);
  const user = useAuth((s) => s.user);
  const login = useAuth((s) => s.login);
  const loginWithPasskey = useAuth((s) => s.loginWithPasskey);
  const navigate = useNavigate();
  // back to the page that sent the user here (only pages inside this app), as the admin login does
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [error, setError] = useState("");
  const [show, setShow] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors: e },
  } = useForm({
    resolver: zodResolver(userSchema),
    defaultValues: { loginId: "", password: "" },
  });
  useEffect(() => {
    document.title = "User login | VeloxIQ";
  }, []);
  if (user && !wrongLoginFor("user")) return <Navigate to={next} replace />;
  const submit = handleSubmit(async ({ loginId, password }) => {
    setError("");
    const before = tenantId();
    clearTenantId();
    const result = await login(loginId, password);
    const switching = !!before && before !== tenantId();
    if (result === "ok") {
      const wrong = await refuseWrongLogin("user");
      if (wrong) return setError(wrong);
      rememberLoginRole("user");
      notify("Signed in");
      navigate(next, { replace: true });
      if (switching) window.location.reload();
      return;
    }
    if (result === "locked")
      return setError(useAuth.getState().lastError || "Too many attempts. Try again shortly.");
    if (result === "offline")
      return setError("Cannot reach the server. Check your connection and try again.");
    if (result === "invalid")
      return setError(
        "Invalid User ID or Password. Your account will be temporarily locked after five consecutive failed attempts. Please contact the Super Administrator for account reset.",
      );
    setError(useAuth.getState().lastError || "Sign-in failed. Try again.");
  });
  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <div className="login-page pub-embed">
        <div className="login-wrap">
          <section className="plan login-hero" aria-hidden>
            <span className="tag">VeloxIQ</span>
            <h2>Welcome</h2>
            <p>
              login to see your requests, projects and updates from your
              company.
            </p>
            <ul className="login-points">
              <li>
                <Icon name="approvals" />
                Track your approvals
              </li>
              <li>
                <Icon name="briefcase" />
                Follow your projects
              </li>
              <li>
                <Icon name="chatx" />
                Raise issues and get support
              </li>
            </ul>
          </section>
          <section className="card login-card">
            <div className="card-b">
              <h1 className="login-title">User login</h1>
              <p className="login-sub">
                Use the login ID you registered with, like ACME1234.
              </p>
              <form
                noValidate
                onSubmit={submit}
                className="stack"
                style={{ gap: 16 }}
              >
                {sessionReplaced && (
                  <div className="info-box" role="status" style={{ marginBottom: 4 }}>
                    <span>You signed in on another device, so this session has ended.</span>
                  </div>
                )}
                {error && (
                  <div className="login-error" role="alert">
                    <span>{error}</span>
                  </div>
                )}
                <FormGroup label="Login ID" required error={e.loginId?.message}>
                  {(id, d) => (
                    <Input
                      autoComplete="username"
                      autoFocus
                      autoCapitalize="characters"
                      spellCheck={false}
                      style={{ textTransform: "uppercase" }}
                      {...a11y(id, d, e.loginId?.message)}
                      {...capitals(register("loginId"))}
                    />
                  )}
                </FormGroup>
                <FormGroup
                  label="Password"
                  required
                  error={e.password?.message}
                >
                  {(id, d) => (
                    <div className="pw-wrap">
                      <Input
                        type={show ? "text" : "password"}
                        autoComplete="current-password"
                        {...a11y(id, d, e.password?.message)}
                        {...register("password")}
                      />
                      <button
                        type="button"
                        className="pw-toggle"
                        onClick={() => setShow((s) => !s)}
                        aria-label={show ? "Hide password" : "Show password"}
                        aria-pressed={show}
                      >
                        <Icon name={show ? "eyeOff" : "eye"} />
                      </button>
                    </div>
                  )}
                </FormGroup>
                <Button
                  type="submit"
                  tone="primary"
                  icon="key"
                  className="login-btn"
                >
                  Login
                </Button>
              </form>
              <Button
                type="button"
                icon="fingerprint"
                className="login-btn"
                onClick={() =>
                  void signInWithPasskey(getValues("loginId"), loginWithPasskey, setError, async () => {
                    const wrong = await refuseWrongLogin("user");
                    if (wrong) return setError(wrong);
                    rememberLoginRole("user");
                    notify("Signed in");
                    navigate(next, { replace: true });
                  })
                }
              >
                Sign in with passkey
              </Button>
              <Link
                to="/forgot?role=user"
                className="btn secondary login-btn login-forgot"
              >
                Forgot password?
              </Link>
              <p className="login-foot">
                New here? <Link to="/register">Register</Link>. Company
                administrators:{" "}
                <Link to="/login?role=admin">login as admin</Link>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Chooser() {
  const user = useAuth((s) => s.user);
  useEffect(() => {
    document.title = "Login | VeloxIQ";
  }, []);
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <div className="pub-page shell-classic">
      <PublicNav />
      <main className="pub-main pub-narrow">
        <h1 className="login-title">Login</h1>
        <p className="login-sub">Choose how you want to login.</p>
        <div className="pub-choice">
          <Link to="/login?role=user">
            <img
              className="pub-choice-img"
              src={`${import.meta.env.BASE_URL}user-login.jpg`}
              alt=""
              width={64}
              height={64}
            />
            <h3>Login as user</h3>
            <p>For registered company users.</p>
          </Link>
          <Link to="/login?role=admin">
            <img
              className="pub-choice-img"
              src={`${import.meta.env.BASE_URL}admin-login.png`}
              alt=""
              width={110}
              height={110}
            />
            <h3>Login as admin</h3>
            <p>For the company administrator.</p>
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const [params] = useSearchParams();
  const role = params.get("role");
  if (role === "admin") return <AdminLogin />;
  if (role === "user") return <UserLogin />;
  return <Chooser />;
}
