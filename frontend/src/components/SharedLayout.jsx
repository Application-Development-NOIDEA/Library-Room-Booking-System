import { useState } from "react";
import "./SharedLayout.css";

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: "◫" },
  { id: "rooms", label: "Browse Rooms", icon: "▦" },
  { id: "bookings", label: "My Bookings", icon: "▤" },
  { id: "waiting-list", label: "Waiting List", icon: "◷" },
  { id: "feedback", label: "Report an Issue", icon: "✎" },
  { id: "profile", label: "My Profile", icon: "◉" },
];

/* Original PSZ mark: an open book with a bookmark ribbon */
function PszLogo() {
  return (
    <svg viewBox="0 0 32 32" className="psz-logo" aria-hidden="true">
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

export default function SharedLayout({
  children,
  activePage = "dashboard",
  onNavigate,
  userName = "Student",
  userDetail = "Student",
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const currentPage =
    navigation.find((item) => item.id === activePage)?.label ?? "Dashboard";

  const initials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();

  // Header shows a shorter name: first two words, e.g. "Ariana Arissa"
  const shortName = userName.trim().split(/\s+/).slice(0, 2).join(" ");

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
          <span className="brand-mark psz-mark" aria-hidden="true">
            <PszLogo />
          </span>

          <div>
            <span className="brand-name">PSZ</span>
            <span className="brand-subtitle">Perpustakaan Sultanah Zanariah</span>
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
          <span>Focus, study and collaborate at PSZ.</span>
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

            <div className="header-title">
              <span className="header-system">PSZ Room Booking</span>
              <span className="header-crumb">
                <span aria-hidden="true">›</span> {currentPage}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="account-profile account-button"
            onClick={() => navigate("profile")}
            aria-label="Open my profile"
          >
            <span className="account-avatar" aria-hidden="true">
              {initials || "S"}
            </span>

            <div className="account-details">
              <strong>{shortName}</strong>
              <span>{userDetail}</span>
            </div>
          </button>
        </header>

        <main id="main-content" className="library-main" tabIndex={-1}>
          {children}
        </main>

        <footer className="library-footer">
          <span>PSZ Room Booking System · Perpustakaan Sultanah Zanariah</span>
          <span>NOIDEA · Universiti Teknologi Malaysia</span>
        </footer>
      </div>
    </div>
  );
}