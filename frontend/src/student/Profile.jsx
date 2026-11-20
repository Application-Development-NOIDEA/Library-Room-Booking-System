import { useState } from "react";
import "./Profile.css";
import ChangePassword from "./ChangePassword";
import { USE_MOCK_AUTH } from "../auth/authService";

export const CAMPUSES = [
  { id: "jb", name: "UTM Johor Bahru", detail: "Skudai, Johor" },
  { id: "kl", name: "UTM Kuala Lumpur", detail: "Jalan Sultan Yahya Petra, KL" },
];

export const YEARS = [1, 2, 3, 4, 5];

const PROGRAMME_SUGGESTIONS = [
  "Bachelor of Computer Science (Software Engineering) with Honours",
  "Bachelor of Computer Science (Computer Networks and Security) with Honours",
  "Bachelor of Computer Science (Graphics and Multimedia Software) with Honours",
  "Bachelor of Computer Science (Data Engineering) with Honours",
  "Bachelor of Computer Science (Bioinformatics) with Honours",
];

// UTM-style matric number, e.g. A22EC0123
const MATRIC_PATTERN = /^[A-Z]\d{2}[A-Z]{2}\d{4}$/;

export function campusName(id) {
  return CAMPUSES.find((campus) => campus.id === id)?.name ?? "—";
}

function initialsOf(name) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

/** Missing values show as a prompt instead of "undefined". */
function orNotSet(value) {
  return value ? value : "Not set yet";
}

function validate(form) {
  const errors = {};
  if (form.fullName.trim().length < 3) errors.fullName = "Enter your full name.";
  if (!MATRIC_PATTERN.test(form.matricNo)) {
    errors.matricNo = "Use the format on your matric card, e.g. A22EC0123.";
  }
  if (form.programme.trim().length < 3) errors.programme = "Enter your programme.";
  if (!YEARS.includes(Number(form.year))) errors.year = "Choose your year of study.";
  if (!CAMPUSES.some((campus) => campus.id === form.campus)) errors.campus = "Choose your campus.";
  return errors;
}

export default function Profile({ profile, onSave, onLogout }) {
  const isIncomplete = !profile.programme || !profile.year || !profile.campus;
  const matricLocked = Boolean(profile.matricNo); // only staff can change it once set

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setNotice("");
  }

  function startEditing() {
    setForm(profile);
    setErrors({});
    setNotice("");
    setEditing(true);
  }

  function cancel() {
    setForm(profile);
    setErrors({});
    setEditing(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const cleaned = {
      ...form,
      fullName: form.fullName.trim().replace(/\s+/g, " "),
      matricNo: form.matricNo.trim().toUpperCase(),
      programme: form.programme.trim(),
      year: Number(form.year),
    };
    const found = validate(cleaned);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setNotice("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      await onSave?.(cleaned);
      setEditing(false);
      setNotice("Profile updated.");
    } catch (err) {
      setNotice(err.message || "Couldn't save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const details = [
    { label: "Full name", value: profile.fullName },
    { label: "Matric number", value: orNotSet(profile.matricNo) },
    { label: "Programme", value: orNotSet(profile.programme) },
    { label: "Year of study", value: profile.year ? `Year ${profile.year}` : "Not set yet" },
    { label: "Campus", value: profile.campus ? campusName(profile.campus) : "Not set yet" },
  ];

  return (
    <div className="student-profile">
      <div className="profile-heading">
        <div>
          <p className="page-eyebrow">STUDENT WORKSPACE</p>
          <h1 className="page-title">My Profile</h1>
          <p className="page-description">
            Your details are shown to library staff when you book a room or check in.
          </p>
        </div>
        {USE_MOCK_AUTH && <span className="profile-preview">Sample data</span>}
      </div>

      {/* Summary card */}
      <section className="profile-hero">
        <span className="profile-avatar" aria-hidden="true">
          {initialsOf(profile.fullName)}
        </span>
        <div className="profile-hero-text">
          <h2>{profile.fullName}</h2>
          <p>{profile.programme || "Add your programme in Edit Profile"}</p>
          <div className="profile-chips">
            {profile.matricNo && <span>{profile.matricNo}</span>}
            {profile.year && <span>Year {profile.year}</span>}
            {profile.campus && <span>{campusName(profile.campus)}</span>}
          </div>
        </div>
        {!editing && (
          <button type="button" className="profile-button light" onClick={startEditing}>
            Edit Profile
          </button>
        )}
      </section>

      <p className="profile-notice" role="status">
        {notice}
      </p>

      {isIncomplete && !editing && (
        <p className="profile-notice">
          Your profile is missing some details. Click <strong>Edit Profile</strong> to add your programme, year and
          campus.
        </p>
      )}

      {!editing ? (
        <section className="profile-card">
          <h3>Student details</h3>
          <dl className="profile-details">
            {details.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : (
        <form className="profile-card" onSubmit={handleSubmit} noValidate>
          <h3>Edit details</h3>

          <div className="profile-grid">
            <label className={errors.fullName ? "has-error" : ""}>
              Full name
              <input
                type="text"
                value={form.fullName}
                onChange={(event) => update("fullName", event.target.value)}
                autoComplete="name"
              />
              {errors.fullName && <small>{errors.fullName}</small>}
            </label>

            <label className={errors.matricNo ? "has-error" : ""}>
              Matric number
              <input
                type="text"
                value={form.matricNo}
                onChange={(event) => update("matricNo", event.target.value.toUpperCase())}
                placeholder="A22EC0123"
                maxLength={9}
                readOnly={matricLocked}
              />
              {errors.matricNo ? (
                <small>{errors.matricNo}</small>
              ) : (
                <span className="hint">
                  {matricLocked ? "Ask library staff if this is wrong" : "As shown on your matric card"}
                </span>
              )}
            </label>
            
            <label className={`span-2 ${errors.programme ? "has-error" : ""}`}>
              Programme
              <input
                type="text"
                list="programme-options"
                value={form.programme}
                onChange={(event) => update("programme", event.target.value)}
                placeholder="Start typing your programme"
              />
              <datalist id="programme-options">
                {PROGRAMME_SUGGESTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {errors.programme && <small>{errors.programme}</small>}
            </label>

            <label className={errors.year ? "has-error" : ""}>
              Year of study
              <select value={form.year ?? ""} onChange={(event) => update("year", Number(event.target.value))}>
                {!form.year && <option value="">Choose…</option>}
                {YEARS.map((year) => (
                  <option key={year} value={year}>
                    Year {year}
                  </option>
                ))}
              </select>
              {errors.year && <small>{errors.year}</small>}
            </label>
          </div>

          <fieldset className={`profile-campus ${errors.campus ? "has-error" : ""}`}>
            <legend>Campus</legend>
            <div className="profile-campus-options">
              {CAMPUSES.map((campus) => (
                <label key={campus.id} className={form.campus === campus.id ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="campus"
                    value={campus.id}
                    checked={form.campus === campus.id}
                    onChange={() => update("campus", campus.id)}
                  />
                  <span>
                    <strong>{campus.name}</strong>
                    <small>{campus.detail}</small>
                  </span>
                </label>
              ))}
            </div>
            {errors.campus && <small className="profile-error">{errors.campus}</small>}
          </fieldset>

          <div className="profile-actions">
            <button type="submit" className="profile-button primary" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" className="profile-button secondary" onClick={cancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ChangePassword />

      {/* Account: sign out */}
      {onLogout && (
        <section className="profile-card profile-account">
          <div>
            <h3>Account</h3>
            <p>Sign out of PSZ Room Booking on this device. You'll need your email and password to sign in again.</p>
          </div>
          <button type="button" className="profile-button logout" onClick={onLogout}>
            Sign out
          </button>
        </section>
      )}

      <p className="profile-footnote">
        {USE_MOCK_AUTH
          ? "Demo mode: changes last until you sign out."
          : "Your details are saved in the PSZ database."}
      </p>
    </div>
  );
}