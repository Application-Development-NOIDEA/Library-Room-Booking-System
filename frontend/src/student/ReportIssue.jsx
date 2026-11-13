import { useCallback, useEffect, useRef, useState } from "react";
import "./ReportIssue.css";
import { useAuth } from "../auth/AuthContext";
import { ISSUE_CATEGORIES, USE_MOCK_REPORTS, categoryLabel, reportApi } from "./reportService";

const MAX_DESCRIPTION = 500;
const MIN_DESCRIPTION = 10;
const MAX_IMAGE_MB = 5;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const STATUS_LABELS = {
  submitted: "Submitted",
  in_progress: "In progress",
  resolved: "Resolved",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fileSize(bytes = 0) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function bookingLabel(booking) {
  return `${booking.room_name} · ${formatDate(booking.start_at)}, ${formatTime(booking.start_at)} – ${formatTime(booking.end_at)}`;
}

const emptyForm = { bookingId: "", category: "", description: "", image: null };

export default function ReportIssue() {
  const { user, token } = useAuth();
  const api = reportApi(user?.id);

  const [bookings, setBookings] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState("");
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const fileInput = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [bookingList, reportList] = await Promise.all([api.listBookings(token), api.listReports(token)]);
      // Only bookings that have already started can have a facility problem
      setBookings(bookingList.filter((booking) => new Date(booking.start_at) <= new Date()));
      setReports(reportList);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Free the photo preview when it changes or the page closes
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, image: "Use a JPG, PNG or WEBP photo." }));
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setErrors((current) => ({ ...current, image: `Photo must be smaller than ${MAX_IMAGE_MB} MB.` }));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    update("image", file);
  }

  function removePhoto() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview("");
    update("image", null);
  }

  function validate() {
    const found = {};
    if (!form.bookingId) found.bookingId = "Choose the booking where the problem happened.";
    if (!form.category) found.category = "Choose what kind of problem it is.";
    const length = form.description.trim().length;
    if (length < MIN_DESCRIPTION) found.description = `Describe the problem in at least ${MIN_DESCRIPTION} characters.`;
    if (length > MAX_DESCRIPTION) found.description = `Keep it under ${MAX_DESCRIPTION} characters.`;
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setSubmitError("");
    try {
      const report = await api.createReport(token, {
        bookingId: form.bookingId,
        category: form.category,
        description: form.description.trim(),
        image: form.image,
      });
      setReports((current) => [report, ...current]);
      setSubmitted(report);
      setForm(emptyForm);
      removePhoto();
      setErrors({});
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const descriptionLength = form.description.trim().length;

  return (
    <div className="report-issue">
      <div className="report-heading">
        <div>
          <p className="page-eyebrow">STUDENT WORKSPACE</p>
          <h1 className="page-title">Report an Issue</h1>
          <p className="page-description">
            Tell the library team about a problem in a room you booked, like broken lights, aircon or furniture.
          </p>
        </div>
        {USE_MOCK_REPORTS && <span className="report-preview">Sample data</span>}
      </div>

      {loading ? (
        <div className="report-state">Loading your bookings…</div>
      ) : loadError ? (
        <div className="report-state is-error" role="alert">
          <strong>Couldn't load this page.</strong>
          <p>{loadError}</p>
          <button type="button" className="report-button primary" onClick={load}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* ---------- Success message ---------- */}
          {submitted && (
            <section className="report-success" role="status">
              <span aria-hidden="true">✓</span>
              <div>
                <strong>Report sent: RPT-{String(submitted.id).padStart(4, "0")}</strong>
                <p>
                  Thanks! Library staff will look at the {categoryLabel(submitted.issue_category).toLowerCase()} problem
                  in {submitted.room_name}. You can follow its status below.
                </p>
              </div>
              <button type="button" className="report-link" onClick={() => setSubmitted(null)}>
                Report another
              </button>
            </section>
          )}

          {/* ---------- Form ---------- */}
          {!submitted &&
            (bookings.length === 0 ? (
              <section className="report-card report-empty">
                <h2>No bookings to report on yet</h2>
                <p>You can report a problem once you've used a room. Your past and current bookings will appear here.</p>
              </section>
            ) : (
              <form className="report-card" onSubmit={handleSubmit} noValidate>
                <h2>New report</h2>

                {submitError && (
                  <p className="report-alert" role="alert">
                    {submitError}
                  </p>
                )}

                {/* 1. Booking */}
                <div className={`report-field ${errors.bookingId ? "has-error" : ""}`}>
                  <label htmlFor="report-booking">
                    <span className="report-step">1</span> Which booking?
                  </label>
                  <select
                    id="report-booking"
                    value={form.bookingId}
                    onChange={(event) => update("bookingId", event.target.value)}
                  >
                    <option value="">Choose a room you booked…</option>
                    {bookings.map((booking) => (
                      <option key={booking.id} value={booking.id}>
                        {bookingLabel(booking)}
                      </option>
                    ))}
                  </select>
                  {errors.bookingId && <small className="report-error">{errors.bookingId}</small>}
                </div>

                {/* 2. Category */}
                <fieldset className={`report-field ${errors.category ? "has-error" : ""}`}>
                  <legend>
                    <span className="report-step">2</span> What's the problem?
                  </legend>
                  <div className="report-categories">
                    {ISSUE_CATEGORIES.map((category) => (
                      <label key={category.id} className={form.category === category.id ? "is-selected" : ""}>
                        <input
                          type="radio"
                          name="issue-category"
                          value={category.id}
                          checked={form.category === category.id}
                          onChange={() => update("category", category.id)}
                        />
                        <span className="report-category-icon" aria-hidden="true">
                          {category.icon}
                        </span>
                        {category.label}
                      </label>
                    ))}
                  </div>
                  {errors.category && <small className="report-error">{errors.category}</small>}
                </fieldset>

                {/* 3. Description */}
                <div className={`report-field ${errors.description ? "has-error" : ""}`}>
                  <label htmlFor="report-description">
                    <span className="report-step">3</span> Describe it
                  </label>
                  <textarea
                    id="report-description"
                    rows={5}
                    maxLength={MAX_DESCRIPTION}
                    value={form.description}
                    onChange={(event) => update("description", event.target.value)}
                    placeholder="e.g. The ceiling light near the whiteboard keeps flickering and the room is too dark to read."
                  />
                  <div className="report-field-foot">
                    {errors.description ? (
                      <small className="report-error">{errors.description}</small>
                    ) : (
                      <small className="report-hint">Where in the room, what happens, and since when.</small>
                    )}
                    <small className="report-count">
                      {descriptionLength}/{MAX_DESCRIPTION}
                    </small>
                  </div>
                </div>

                {/* 4. Photo */}
                <div className={`report-field ${errors.image ? "has-error" : ""}`}>
                  <span className="report-label">
                    <span className="report-step">4</span> Add a photo <em>(optional)</em>
                  </span>

                  {preview ? (
                    <div className="report-photo">
                      <img src={preview} alt="Selected photo of the problem" />
                      <div>
                        <strong>{form.image?.name}</strong>
                        <small>{fileSize(form.image?.size)}</small>
                        <button type="button" className="report-link" onClick={removePhoto}>
                          Remove photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="report-upload" onClick={() => fileInput.current?.click()}>
                      <span aria-hidden="true">📷</span>
                      <strong>Choose a photo</strong>
                      <small>JPG, PNG or WEBP, up to {MAX_IMAGE_MB} MB</small>
                    </button>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    onChange={choosePhoto}
                    hidden
                  />
                  {errors.image && <small className="report-error">{errors.image}</small>}
                </div>

                <div className="report-actions">
                  <button type="submit" className="report-button primary" disabled={submitting}>
                    {submitting ? "Sending…" : "Submit report"}
                  </button>
                  <button
                    type="button"
                    className="report-button secondary"
                    onClick={() => {
                      setForm(emptyForm);
                      removePhoto();
                      setErrors({});
                    }}
                    disabled={submitting}
                  >
                    Clear
                  </button>
                </div>
              </form>
            ))}

          {/* ---------- My reports ---------- */}
          <div className="report-section-heading">
            <h2>My reports</h2>
            <span>
              {reports.length} {reports.length === 1 ? "report" : "reports"}
            </span>
          </div>

          {reports.length === 0 ? (
            <section className="report-card report-empty">
              <p>You haven't reported any problems yet.</p>
            </section>
          ) : (
            <ul className="report-list">
              {reports.map((report) => (
                <li key={report.id} className="report-item">
                  <div className="report-item-top">
                    <span className="report-category-tag">{categoryLabel(report.issue_category)}</span>
                    <span className={`report-status ${report.status}`}>{STATUS_LABELS[report.status] ?? report.status}</span>
                  </div>
                  <h3>{report.room_name}</h3>
                  <p className="report-item-text">{report.description}</p>
                  <div className="report-item-meta">
                    <span>RPT-{String(report.id).padStart(4, "0")}</span>
                    <span>Reported {formatDate(report.created_at)}</span>
                    {(report.image_url || report.image_name) && <span>📷 Photo attached</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}