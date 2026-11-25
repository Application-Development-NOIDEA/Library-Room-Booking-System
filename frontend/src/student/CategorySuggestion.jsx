import { useEffect, useRef, useState } from "react";
import { categoryLabel, ISSUE_CATEGORIES } from "./reportService";

const MIN_LENGTH = 15; // wait until there is enough to go on
const DELAY_MS = 900; // ask only after the student stops typing

/**
 * Report an Issue: "This sounds like Lighting" while the student types.
 * Only a suggestion: nothing changes until they click "Use this".
 */
export default function CategorySuggestion({ api, token, description, category, onUse }) {
  const [suggestion, setSuggestion] = useState(null);
  const [checking, setChecking] = useState(false);

  // The page makes a new api object on every render; keep the latest one without re-running the effect.
  const apiRef = useRef(api);
  apiRef.current = api;

  useEffect(() => {
    const text = description.trim();
    if (text.length < MIN_LENGTH) {
      setSuggestion(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const result = await apiRef.current.suggestCategory(token, text);
        if (!cancelled) setSuggestion(result);
      } catch {
        if (!cancelled) setSuggestion(null); // a suggestion is optional: stay quiet on errors
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [token, description]);

  if (checking && !suggestion) {
    return <p className="report-suggestion is-checking">✦ Reading your description…</p>;
  }
  if (!suggestion) return null;

  const icon = ISSUE_CATEGORIES.find((item) => item.id === suggestion.category)?.icon;
  const label = categoryLabel(suggestion.category);
  const matches = category === suggestion.category;

  return (
    <div className={`report-suggestion ${matches ? "is-match" : ""}`} role="status">
      <span className="report-suggestion-mark" aria-hidden="true">✦</span>
      <p>
        {matches ? "Matches your choice: " : "This sounds like "}
        <strong>
          {icon} {label}
        </strong>
        {suggestion.severity === "high" && <span className="report-suggestion-urgent"> · looks urgent</span>}
      </p>
      {!matches && (
        <button type="button" onClick={() => onUse(suggestion.category)}>
          Use this
        </button>
      )}
    </div>
  );
}