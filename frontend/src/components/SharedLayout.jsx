import { useState } from "react";
import "./SharedLayout.css";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: "◫" },
  { id: "rooms", label: "Browse Rooms", icon: "▦" },
  { id: "bookings", label: "My Bookings", icon: "▤" },
  { id: "waiting-list", label: "Waiting List", icon: "◷" },
  { id: "feedback", label: "Report an Issue", icon: "✎" },
];

export default function SharedLayout({
  children,
  activePage = "dashboard",
  onNavigate,
  userName = "Student",
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();

  function navigate(page) {
    onNavigate?.(page);
    setMenuOpen(false);
  }

  return (
    <div className="library-app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside
        id="library-sidebar"
        className={`library-sidebar ${menuOpen ? "is-open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="library-brand">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>

          <div>
            <span className="brand-name">Library Rooms</span>
            <span className="brand-subtitle">UTM Booking System</span>
          </div>
        </div>

        <p className="navigation-label">STUDENT WORKSPACE</p>

        <nav className="library-navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`navigation-item ${
                activePage === item.id ? "is-active" : ""
              }`}
              aria-current={activePage === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <span className="navigation-icon" aria-hidden="true">
                {item.icon}
              </span>

              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <p>Find your space.</p>
          <span>Focus, study and collaborate.</span>
        </div>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <div className="library-workspace">
        <header className="library-header">
          <div className="header-start">
            <button
              type="button"
              className="mobile-menu-button"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              aria-controls="library-sidebar"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span aria-hidden="true">☰</span>
            </button>

            <span className="header-caption">
              Library Room Booking System
            </span>
          </div>

          <div className="account-profile">
            <span className="account-avatar" aria-hidden="true">
              {initials || "S"}
            </span>

            <div className="account-details">
              <strong>{userName}</strong>
              <span>Student</span>
            </div>
          </div>
        </header>

        <main id="main-content" className="library-main" tabIndex={-1}>
          {children}
        </main>

        <footer className="library-footer">
          <span>Library Room Booking System</span>
          <span>NOIDEA · Universiti Teknologi Malaysia</span>
        </footer>
      </div>
    </div>
  );
}