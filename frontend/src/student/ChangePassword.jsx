import { useState } from "react";
import "./ChangePassword.css";
import { useAuth } from "../auth/AuthContext";
import { authApi } from "../auth/authService";

const RULES = [
  { id: "length", label: "At least 8 characters", test: (value) => value.length >= 8 },
  { id: "letter", label: "At least one letter", test: (value) => /[A-Za-z]/.test(value) },
  { id: "number", label: "At least one number", test: (value) => /[0-9]/.test(value) },
];

const empty = { current: "", next: "", confirm: "" };

/** "Change password" card for My Profile. */
export default function ChangePassword() {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const rulesOk = RULES.every((rule) => rule.test(form.next));
  const matches = form.confirm.length > 0 && form.next === form.confirm;
  const canSubmit = form.current.length > 0 && rulesOk && matches && !saving;

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function close() {
    setOpen(false);
    setForm(empty);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const data = await authApi.changePassword(token, {
        current_password: form.current,
        password: form.next,
        password_confirmation: form.confirm,
      });
      setDone(data?.message || "Password changed.");
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <section className="profile-card change-password">
      <div className="change-password-head">
        <div>
          <h3>Password</h3>
          <p>{done || "Change the password you use to sign in."}</p>
        </div>
        {!open && (
          <button
            type="button"
            className="profile-button secondary"
            onClick={() => {
              setDone("");
              setOpen(true);
            }}
          >
            Change password
          </button>
        )}
      </div>

      {open && (
        <form className="change-password-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <p className="change-password-error" role="alert">
              {error}
            </p>
          )}

          <label>
            Current password
            <input
              type={type}
              value={form.current}
              onChange={(event) => update("current", event.target.value)}
              autoComplete="current-password"
            />
          </label>

          <label>
            New password
            <input
              type={type}
              value={form.next}
              onChange={(event) => update("next", event.target.value)}
              autoComplete="new-password"
            />
          </label>

          <ul className="change-password-rules">
            {RULES.map((rule) => (
              <li key={rule.id} className={rule.test(form.next) ? "ok" : ""}>
                <span aria-hidden="true">{rule.test(form.next) ? "✓" : "•"}</span> {rule.label}
              </li>
            ))}
          </ul>

          <label>
            Confirm new password
            <input
              type={type}
              value={form.confirm}
              onChange={(event) => update("confirm", event.target.value)}
              autoComplete="new-password"
            />
          </label>
          {form.confirm && !matches && <small className="change-password-mismatch">The passwords don't match yet.</small>}

          <label className="change-password-show">
            <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
            Show passwords
          </label>

          <div className="profile-actions">
            <button type="submit" className="profile-button primary" disabled={!canSubmit}>
              {saving ? "Saving..." : "Save new password"}
            </button>
            <button type="button" className="profile-button secondary" onClick={close} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}