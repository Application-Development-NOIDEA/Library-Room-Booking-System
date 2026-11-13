import { useEffect, useState } from "react";
import SharedLayout from "./components/SharedLayout";
import MyBookings from "./student/MyBookings";
import WaitingList from "./student/WaitingList";
import StudentDashboard from "./student/StudentDashboard";
import BookingConfirmation from "./student/BookingConfirmation";
import BrowseRooms from "./student/BrowseRooms";
import ReportIssue from "./student/ReportIssue";
import Profile, { campusName } from "./student/Profile";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import {
  AuthLoading,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  StaffSignedIn,
} from "./auth/AuthPages";

/* The page students see first after login.
   To preview a page while building it, change this to that page's name
   (for example "rooms" or "booking-confirmation"), then change it back to "dashboard". */
const START_PAGE = "dashboard";

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
  const [activePage, setActivePage] = useState(START_PAGE);

  // The booking shown on the confirmation page.
  // Later: call setLastBooking(newBooking) and setActivePage("booking-confirmation")
  // right after a booking is made. While it is null, sample data is shown.
  // eslint-disable-next-line no-unused-vars
  const [lastBooking, setLastBooking] = useState(null);

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
      case "rooms":
        return <BrowseRooms />;

      case "bookings":
        return <MyBookings />;

      case "waiting-list":
        return <WaitingList />;

      case "feedback":
        return <ReportIssue />;

      case "booking-confirmation":
        return (
          <BookingConfirmation
            booking={lastBooking ?? undefined}
            userName={profile.fullName}
            onViewBookings={() => setActivePage("bookings")}
            onBookAnother={() => setActivePage("rooms")}
          />
        );

      case "profile":
        return <Profile profile={profile} onSave={setProfile} onLogout={onLogout} />;

      case "dashboard":
      default:
        return (
          <StudentDashboard onNavigate={setActivePage} userName={profile.fullName} userId={user.id} />
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