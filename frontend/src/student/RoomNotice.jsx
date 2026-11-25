import "./RoomNotice.css";

const MAX_SHOWN = 3;

/**
 * Browse Rooms: "Known problems right now" on a room card.
 * problems = [{ room_code, label, count, recurring, urgent }] from GET /api/room-notices
 */
export default function RoomNotice({ problems }) {
  if (!problems?.length) return null;

  const urgent = problems.some((p) => p.urgent);
  const avoided = problems.some((p) => p.urgent || p.recurring);
  const shown = problems.slice(0, MAX_SHOWN);
  const more = problems.length - shown.length;

  return (
    <div className={`room-notice ${urgent ? "is-urgent" : ""}`} role="note">
      <p className="room-notice-title">
        <span aria-hidden="true">⚠</span> Known problems right now
      </p>

      <ul>
        {shown.map((p) => (
          <li key={`${p.room_code}-${p.category}`}>
            <strong>{p.room_code}</strong> · {p.label}
            {p.recurring && <span className="room-notice-count"> · reported {p.count}×</span>}
            {p.urgent && <span className="room-notice-urgent"> · urgent</span>}
          </li>
        ))}
      </ul>
      {more > 0 && <small>and {more} more</small>}

      {avoided && (
        <small className="room-notice-hint">
          When you book, we'll give you a room without urgent or repeated problems if one is free.
        </small>
      )}
    </div>
  );
}