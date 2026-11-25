import { useCallback, useEffect, useState } from 'react';
import { staffApi } from './staffService';
import './ReportAnalyzer.css';

/* Dates are Malaysian calendar days, sent as YYYY-MM-DD. */
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());

function daysBefore(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { id: '7', label: 'Last 7 days', range: () => [daysBefore(TODAY, 6), TODAY] },
  { id: '30', label: 'Last 30 days', range: () => [daysBefore(TODAY, 29), TODAY] },
  { id: 'month', label: 'This month', range: () => [`${TODAY.slice(0, 8)}01`, TODAY] },
  { id: 'custom', label: 'Custom' },
];

const SEVERITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

function niceDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function niceDateTime(iso) {
  return new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

/** Staff "AI Report Analyzer": summarise every issue report in a period and suggest what to do. */
export default function ReportAnalyzer({ token }) {
  const [preset, setPreset] = useState('7');
  const [from, setFrom] = useState(daysBefore(TODAY, 6));
  const [to, setTo] = useState(TODAY);
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      const data = await staffApi.reportSummaries(token);
      setHistory(data.summaries);
      setCurrent((shown) => shown ?? data.summaries[0] ?? null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  function choosePreset(id) {
    setPreset(id);
    const option = PRESETS.find((p) => p.id === id);
    if (option.range) {
      const [start, end] = option.range();
      setFrom(start);
      setTo(end);
    }
  }

  async function generate() {
    setWorking(true);
    setError('');
    try {
      const data = await staffApi.generateReportSummary(token, from, to);
      setCurrent(data.summary);
      setHistory((old) => [data.summary, ...old.filter((s) => s.id !== data.summary.id)].slice(0, 10));
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  }

  const maxCategory = Math.max(1, ...(current?.by_category ?? []).map((c) => c.count));

  return (
    <section className="staff-panel staff-panel-spaced report-analyzer">
      <div className="staff-panel-heading">
        <div>
          <h2>AI Report Analyzer</h2>
          <p className="staff-muted">
            Summarises every issue report in a period, finds problems that keep coming back, and suggests what to do.
          </p>
        </div>
      </div>

      <div className="ra-controls">
        <div className="ra-presets" role="group" aria-label="Period">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`ra-chip ${preset === p.id ? 'is-active' : ''}`}
              onClick={() => choosePreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="ra-dates">
            <label>
              From
              <input className="staff-input" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To
              <input className="staff-input" type="date" value={to} min={from} max={TODAY} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        )}

        <button className="staff-primary" type="button" onClick={generate} disabled={working || !from || !to}>
          {working ? 'Analyzing…' : 'Generate Summary'}
        </button>
      </div>

      {error && <p className="ra-error" role="alert">{error}</p>}

      {current ? (
        <div className="ra-result">
          <div className="ra-result-head">
            <h3>
              {niceDate(current.period_start)} – {niceDate(current.period_end)}
            </h3>
            <span className={`ra-badge ${current.source === 'ai' ? 'is-ai' : ''}`}>
              {current.source === 'ai' ? '✦ AI summary' : 'Rule-based summary (AI unavailable)'}
            </span>
          </div>

          <p className="ra-summary">{current.summary}</p>

          <div className="ra-stats">
            <div><strong>{current.total}</strong><span>Reports</span></div>
            <div><strong>{current.open}</strong><span>Still open</span></div>
            <div><strong>{current.recurring.length}</strong><span>Recurring problems</span></div>
            <div><strong>{current.unreviewed}</strong><span>No confirmed severity</span></div>
          </div>

          {current.total > 0 && (
            <div className="staff-grid-two ra-grid">
              <div className="staff-detail-card">
                <h3>Suggested actions</h3>
                <ol className="ra-actions">
                  {current.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ol>

                <h3>Recurring room problems</h3>
                {current.recurring.length ? (
                  <ul className="ra-recurring">
                    {current.recurring.map((r) => (
                      <li key={`${r.room}-${r.category}`}>
                        <span>{r.room}{r.room_name ? ` · ${r.room_name}` : ''}</span>
                        <strong>{r.label} × {r.count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="staff-muted">No room had the same problem twice.</p>
                )}
              </div>

              <div className="staff-detail-card">
                <h3>By category</h3>
                {current.by_category.map((c) => (
                  <div className="ra-bar" key={c.category}>
                    <span>{c.label}</span>
                    <div className="ra-bar-track">
                      <div className="ra-bar-fill" style={{ width: `${(c.count / maxCategory) * 100}%` }} />
                    </div>
                    <strong>{c.count}</strong>
                  </div>
                ))}

                <h3>By severity</h3>
                <div className="ra-severity">
                  {current.by_severity.map((s) => (
                    <span key={s.severity} className={`ra-sev ra-sev-${s.severity}`}>
                      {SEVERITY_LABELS[s.severity] ?? s.severity}: <strong>{s.count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <p className="staff-muted ra-generated">Generated {niceDateTime(current.generated_at)}</p>
        </div>
      ) : (
        <div className="staff-empty">Choose a period and click Generate Summary.</div>
      )}

      {history.length > 1 && (
        <div className="ra-history">
          <h3>Earlier summaries</h3>
          {history.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ra-history-item ${current?.id === s.id ? 'is-active' : ''}`}
              onClick={() => setCurrent(s)}
            >
              <span>{niceDate(s.period_start)} – {niceDate(s.period_end)}</span>
              <small>{s.total} reports · {s.source === 'ai' ? 'AI' : 'Rule-based'}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}