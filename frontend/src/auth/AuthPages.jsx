import { useState } from "react";
import "./Auth.css";
import { useAuth } from "./AuthContext";
import { USE_MOCK_AUTH, authApi } from "./authService";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Password rules for the reset form */
const PASSWORD_RULES = [
  { id: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { id: "letter", label: "At least one letter", test: (value) => /[A-Za-z]/.test(value) },
  { id: "number", label: "At least one number", test: (value) => /\d/.test(value) },
];

/* ---------- Shared pieces ---------- */

function PszLogo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 9.5C13.2 7.6 9.6 7 5.5 7.4v15.4c4.1-.4 7.7.2 10.5 2.1 2.8-1.9 6.4-2.5 10.5-2.1V7.4C22.4 7 18.8 7.6 16 9.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M16 9.5v15.4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M20 8.4v6.4l1.8-1.3 1.8 1.3V8" fill="currentColor" />
    </svg>
  );
}

function AuthShell({ children }) {
  return (
    <div className="auth-page">
      <aside className="auth-panel" aria-hidden="true">
        <div className="auth-brand">
          <span className="auth-logo">
            <PszLogo />
          </span>
          <div>
            <strong>PSZ</strong>
            <span>Perpustakaan Sultanah Zanariah</span>
          </div>
        </div>

        <div className="auth-panel-copy">
          <h2>Find your space.</h2>
          <p>Book carrel, discussion and meeting rooms, join the same-day waiting list, and check in with your QR code.</p>
        </div>

        <span className="auth-panel-foot">PSZ Room Booking · Universiti Teknologi Malaysia</span>
      </aside>

      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}

function PasswordInput({ id, value, onChange, autoComplete, invalid }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`auth-password ${invalid ? "is-invalid" : ""}`}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

function DemoBanner() {
  if (!USE_MOCK_AUTH) return null;
  return (
    <div className="auth-demo">
      <strong>Demo mode</strong>: no backend needed. Student: <code>ariana@graduate.utm.my</code> · Staff:{" "}
      <code>staff@utm.my</code> · Password: <code>Password123</code>
    </div>
  );
}

/* ---------- Login ---------- */

export function LoginPage({ onForgotPassword, notice }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const found = {};
    if (!EMAIL_PATTERN.test(email.trim())) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    setFieldErrors(found);
    setError("");
    if (Object.keys(found).length) return;

    setSubmitting(true);
    try {
      await login(email, password, remember);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <p className="auth-eyebrow">WELCOME BACK</p>
      <h1>Sign in</h1>
      <p className="auth-lead">Use your UTM email to manage your room bookings.</p>

      <DemoBanner />
      {notice && <p className="auth-success" role="status">{notice}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          placeholder="name@graduate.utm.my"
          className={fieldErrors.email ? "is-invalid" : ""}
          aria-invalid={Boolean(fieldErrors.email) || undefined}
        />
        {fieldErrors.email && <small className="auth-field-error">{fieldErrors.email}</small>}

        <div className="auth-label-row">
          <label htmlFor="login-password">Password</label>
          <button type="button" className="auth-link" onClick={onForgotPassword}>
            Forgot password?
          </button>
        </div>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          invalid={Boolean(fieldErrors.password)}
        />
        {fieldErrors.password && <small className="auth-field-error">{fieldErrors.password}</small>}

        <label className="auth-check">
          <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
          Keep me signed in on this device
        </label>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}

/* ---------- Forgot password ---------- */

export function ForgotPasswordPage({ onBack, onOpenResetLink }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [demoLink, setDemoLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await authApi.forgotPassword(email.trim().toLowerCase());
      setDemoLink(data?.demoResetLink ?? "");
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <button type="button" className="auth-back" onClick={onBack}>
        ← Back to sign in
      </button>

      {!sent ? (
        <>
          <p className="auth-eyebrow">ACCOUNT HELP</p>
          <h1>Forgot your password?</h1>
          <p className="auth-lead">Enter the email you use for PSZ Room Booking and we'll send you a link to reset it.</p>

          {error && <p className="auth-error" role="alert">{error}</p>}

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="name@graduate.utm.my"
            />
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="auth-eyebrow">CHECK YOUR EMAIL</p>
          <h1>Reset link sent</h1>
          <p className="auth-lead">
            If an account exists for <strong>{email.trim()}</strong>, you'll receive an email with a link to reset your
            password. The link expires in 30 minutes.
          </p>
          <p className="auth-hint">Didn't get it? Check your spam folder, or try again in a few minutes.</p>

          {demoLink && (
            <div className="auth-demo">
              <strong>Demo mode</strong>: there's no email server, so here is the link the email would contain.
              <button type="button" className="auth-link block" onClick={() => onOpenResetLink(demoLink)}>
                Open reset link →
              </button>
            </div>
          )}

          <button type="button" className="auth-submit secondary" onClick={onBack}>
            Back to sign in
          </button>
        </>
      )}
    </AuthShell>
  );
}

/* ---------- Reset password (opened from the email link) ---------- */

export function ResetPasswordPage({ token, onDone, onBack }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const results = PASSWORD_RULES.map((rule) => ({ ...rule, ok: rule.test(password) }));
  const allRulesOk = results.every((rule) => rule.ok);
  const matches = password.length > 0 && password === confirm;

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    if (!allRulesOk || !matches) return;

    setSubmitting(true);
    try {
      await authApi.resetPassword(token, password);
      onDone("Your password has been reset. Sign in with your new password.");
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <p className="auth-eyebrow">RESET PASSWORD</p>
        <h1>Link not valid</h1>
        <p className="auth-lead">This reset link is missing its code. Please request a new link.</p>
        <button type="button" className="auth-submit" onClick={onBack}>
          Request a new link
        </button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <p className="auth-eyebrow">RESET PASSWORD</p>
      <h1>Choose a new password</h1>
      <p className="auth-lead">Pick something you haven't used before.</p>

      {error && (
        <p className="auth-error" role="alert">
          {error}{" "}
          <button type="button" className="auth-link" onClick={onBack}>
            Request a new link
          </button>
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="reset-password">New password</label>
        <PasswordInput
          id="reset-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          invalid={submitted && !allRulesOk}
        />

        <ul className="auth-rules" aria-label="Password requirements">
          {results.map((rule) => (
            <li key={rule.id} className={rule.ok ? "ok" : ""}>
              <span aria-hidden="true">{rule.ok ? "✓" : "•"}</span> {rule.label}
            </li>
          ))}
        </ul>

        <label htmlFor="reset-confirm">Confirm new password</label>
        <PasswordInput
          id="reset-confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          invalid={submitted && !matches}
        />
        {submitted && !matches && <small className="auth-field-error">Passwords don't match.</small>}

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? "Saving…" : "Reset password"}
        </button>
      </form>
    </AuthShell>
  );
}

/* ---------- Loading screen while a saved session is checked ---------- */

export function AuthLoading() {
  return (
    <div className="auth-loading">
      <span className="auth-spinner" aria-hidden="true" />
      Signing you in…
    </div>
  );
}

/* ---------- Staff accounts use the staff interface ---------- */

export function StaffSignedIn({ user, onLogout }) {
  return (
    <AuthShell>
      <p className="auth-eyebrow">SIGNED IN AS STAFF</p>
      <h1>Hello, {user.name.split(/\s+/)[0]}</h1>
      <p className="auth-lead">This account belongs to library staff. Open the staff dashboard to manage reservations and check-ins.</p>
      <a className="auth-submit auth-submit-link" href="/staff.html">
        Open Staff Dashboard
      </a>
      <button type="button" className="auth-submit secondary" onClick={onLogout}>
        Sign out
      </button>
    </AuthShell>
  );
}