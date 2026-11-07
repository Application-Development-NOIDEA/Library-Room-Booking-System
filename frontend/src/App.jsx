import { useEffect, useState } from "react";
import SharedLayout from "./components/SharedLayout";
import MyBookings from "./student/MyBookings";
import WaitingList from "./student/WaitingList";
import StudentDashboard from "./student/StudentDashboard";
import Profile, { campusName } from "./student/Profile";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import {
  AuthLoading,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  StaffSignedIn,
} from "./auth/AuthPages";

/* Placeholder text for pages that aren't built yet */
const pages = {
  rooms: {
    title: "Browse Rooms",
    description: "Explore spaces for individual and group study.",
    heading: "Room directory",
    content:
      "Carrel rooms, discussion rooms and meeting rooms will appear here.",
  },

  feedback: {
    title: "Report an Issue",
    description: "Help improve library rooms and facilities.",
    heading: "Facility issue report",
    content:
      "The form for reporting room facility problems will appear here.",
  },
};

/* Reset links in the email look like: /reset-password?token=abc123 */
function readResetToken() {
  if (!window.location.pathname.startsWith("/reset-password")) return null;
  return new URLSearchParams(window.location.search).get("token") ?? "";
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, checking, logout } = useAuth();
  const [authView, setAuthView] = useState(() => (readResetToken() !== null ? "reset" : "login"));
  const [resetToken, setResetToken] = useState(() => readResetToken() ?? "");
  const [notice, setNotice] = useState("");

  function goToLogin(message = "") {
    window.history.replaceState(null, "", "/");
    setResetToken("");
    setNotice(message);
    setAuthView("login");
  }

  function openResetLink(link) {
    window.history.pushState(null, "", link);
    setResetToken(new URLSearchParams(link.split("?")[1] ?? "").get("token") ?? "");
    setAuthView("reset");
  }

  async function handleLogout() {
    await logout();
    goToLogin("You have been signed out.");
  }

  // The reset page works whether or not someone is signed in
  if (authView === "reset") {
    return (
      <ResetPasswordPage
        token={resetToken}
        onDone={goToLogin}
        onBack={() => {
          window.history.replaceState(null, "", "/");
          setAuthView("forgot");
        }}
      />
    );
  }

  if (checking) return <AuthLoading />;

  if (!user) {
    return authView === "forgot" ? (
      <ForgotPasswordPage onBack={() => goToLogin()} onOpenResetLink={openResetLink} />
    ) : (
      <LoginPage
        notice={notice}
        onForgotPassword={() => {
          setNotice("");
          setAuthView("forgot");
        }}
      />
    );
  }

  if (user.role !== "student") {
    return <StaffSignedIn user={user} onLogout={handleLogout} />;
  }

  return <StudentApp user={user} onLogout={handleLogout} />;
}

/* ---------- The student side (only shown after login) ---------- */

function StudentApp({ user, onLogout }) {
  const [activePage, setActivePage] = useState("dashboard");
  const page = pages[activePage] ?? pages.rooms;

  // Profile extras (programme, year, campus) are saved per user in this browser
  // until the database has columns for them.
  const profileKey = `psz-profile-${user.id}`;
  const [profile, setProfile] = useState(() => {
    const base = {
      fullName: user.name,
      matricNo: user.student_id ?? "",
      programme: "Bachelor of Computer Science (Software Engineering)",
      year: 1,
      campus: "jb",
    };
    try {
      const saved = window.localStorage.getItem(profileKey);
      return saved ? { ...base, ...JSON.parse(saved) } : base;
    } catch {
      return base;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(profileKey, JSON.stringify(profile));
    } catch {
      /* storage unavailable: ignore */
    }
  }, [profile, profileKey]);

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        return (
          <StudentDashboard onNavigate={setActivePage} userName={profile.fullName} userId={user.id} />
        );

      case "bookings":
        return <MyBookings />;

      case "waiting-list":
        return <WaitingList />;

      case "profile":
                return <Profile profile={profile} onSave={setProfile} onLogout={onLogout} />;

      default:
        return (
          <>
            <p className="page-eyebrow">STUDENT WORKSPACE</p>

            <h1 className="page-title">{page.title}</h1>

            <p className="page-description">{page.description}</p>

            <section className="content-card">
              <h2>{page.heading}</h2>
              <p>{page.content}</p>
            </section>
          </>
        );
    }
  }

  return (
    <SharedLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={onLogout}
      userName={profile.fullName}
      userDetail={`${profile.matricNo || "Student"} · ${campusName(profile.campus).replace("UTM ", "")}`}
    >
      {renderPage()}
    </SharedLayout>
  );
}