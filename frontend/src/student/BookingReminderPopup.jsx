
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { fetchDashboard } from "./dashboardService";
import "./BookingReminderPopup.css";

const REMINDER_TITLES = [
  "Booking Start Reminder",
  "Booking Checkout Reminder",
];

export default function BookingReminderPopup({ onViewBookings }) {
  const { user, token } = useAuth();
  const [popups, setPopups] = useState([]);
  const timers = useRef(new Map());

  // TEMPORARY TEST: remove after confirming the popup works
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const testNotification = {
      id: "test-popup",
      title: "Booking Start Reminder",
      text: "TEST: Your booking for Discussion Room 1 starts in 30 minutes. Please prepare your QR code.",
    };

    setPopups((current) => [...current, testNotification]);

    const timer = window.setTimeout(() => {
      setPopups((current) =>
        current.filter((item) => item.id !== "test-popup")
      );
    }, 12000);

    return () => window.clearTimeout(timer);
  }, []);


  useEffect(() => {
    if (!token || !user?.id) return;

    let cancelled = false;
    let checking = false;

    const storageKey = `psz-reminders-shown-${user.id}`;

    let saved = [];

    try {
      saved = JSON.parse(
        window.localStorage.getItem(storageKey) || "[]"
      );
    } catch {
      saved = [];
    }

    const shown = new Set(
      Array.isArray(saved) ? saved.map(String) : []
    );

    async function checkReminders() {
      if (cancelled || checking) return;

      checking = true;

      try {
        const data = await fetchDashboard(token);

        if (cancelled) return;

        const fresh = data.notifications.filter((item) => {
          const created = new Date(item.created_at).getTime();
          const age = Date.now() - created;

          return (
            !item.read &&
            REMINDER_TITLES.includes(item.title) &&
            !shown.has(String(item.id)) &&
            Number.isFinite(created) &&
            age >= -60000 &&
            age <= 2 * 60 * 60 * 1000
          );
        });

        if (fresh.length > 0) {
          fresh.forEach((item) => {
            shown.add(String(item.id));
          });

          try {
            window.localStorage.setItem(
              storageKey,
              JSON.stringify([...shown].slice(-100))
            );
          } catch {
            // Notifications still work without local storage.
          }

          setPopups((current) => [...current, ...fresh]);

          fresh.forEach((item) => {
            const timer = window.setTimeout(() => {
              setPopups((current) =>
                current.filter((popup) => popup.id !== item.id)
              );

              timers.current.delete(item.id);
            }, 12000);

            timers.current.set(item.id, timer);
          });
        }
      } catch {
        // Try again on the next check.
      } finally {
        checking = false;
      }
    }

    checkReminders();

    const interval = window.setInterval(
      checkReminders,
      20000
    );

    window.addEventListener("focus", checkReminders);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkReminders);

      timers.current.forEach((timer) => {
        window.clearTimeout(timer);
      });

      timers.current.clear();
    };
  }, [token, user?.id]);

  function dismissPopup(id) {
    const timer = timers.current.get(id);

    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }

    setPopups((current) =>
      current.filter((popup) => popup.id !== id)
    );
  }

  if (popups.length === 0) return null;

  return (
    <div
      className="booking-popup-container"
      aria-label="Booking reminders"
    >
      {popups.map((popup) => (
        <div
          key={popup.id}
          className="booking-popup"
          role="status"
        >
          <div className="booking-popup-icon">
            🔔
          </div>

          <div className="booking-popup-content">
            <strong>{popup.title}</strong>

            <p>{popup.text}</p>

            <button
              type="button"
              className="booking-popup-action"
              onClick={() => {
                dismissPopup(popup.id);
                onViewBookings?.();
              }}
            >
              View My Bookings
            </button>
          </div>

          <button
            type="button"
            className="booking-popup-close"
            onClick={() => dismissPopup(popup.id)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
