import { useEffect, useState } from "react";
import SharedLayout from "./components/SharedLayout";
import MyBookings from "./student/MyBookings";
import WaitingList from "./student/WaitingList";
import StudentDashboard from "./student/StudentDashboard";
import BookingConfirmation from "./student/BookingConfirmation";
import BrowseRooms from "./student/BrowseRooms";
import BookRoom from "./student/BookRoom";
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

  // The room type picked on Browse Rooms, and the booking just made.
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [lastBooking, setLastBooking] = useState(null);

  // Profile details come from the database (users table) through the login.
  const { saveProfile } = useAuth();
  const profile = {
    fullName: user.name,
    matricNo: user.student_id ?? "",
    programme: user.programme ?? "",
    year: user.year_of_study ?? null,
    campus: user.campus ?? "",
  };

  function handleSaveProfile(cleaned) {
    return saveProfile({
      name: cleaned.fullName,
      student_id: cleaned.matricNo,
      programme: cleaned.programme,
      year_of_study: cleaned.year,
      campus: cleaned.campus,
    });
  }

  function renderPage() {
    switch (activePage) {
      case "rooms":
        return (
          <BrowseRooms
            onBook={(room) => {
              setSelectedRoom(room);
              setActivePage("book");
            }}
          />
        );

      case "book":
        return (
          <BookRoom
            room={selectedRoom}
            onBack={() => setActivePage("rooms")}
            onBooked={(booking) => {
              setLastBooking(booking);
              setActivePage("booking-confirmation");
            }}
          />
        );

      case "bookings":
        return <MyBookings />;

      case "waiting-list":
        return <WaitingList />;

      case "feedback":
        return <ReportIssue />;

      case "booking-confirmation":
        return (
          <BookingConfirmation
            booking={lastBooking}
            onViewBookings={() => setActivePage("bookings")}
            onBookAnother={() => setActivePage("rooms")}
          />
        );

      case "profile":
        return <Profile profile={profile} onSave={handleSaveProfile} onLogout={onLogout} />;

      case "dashboard":
      default:
        return (
          <StudentDashboard onNavigate={setActivePage} userName={profile.fullName} userId={user.id} />
        );
    }
  }

  // The booking form and confirmation belong to "Browse Rooms" in the sidebar
  const sidebarPage = ["book", "booking-confirmation"].includes(activePage) ? "rooms" : activePage;

  return (
    <SharedLayout
      activePage={sidebarPage}
      onNavigate={setActivePage}
      onLogout={onLogout}
      userName={profile.fullName}
      userDetail={[profile.matricNo || "Student", profile.campus && campusName(profile.campus).replace("UTM ", "")].filter(Boolean).join(" · ")}
    >
      {renderPage()}
    </SharedLayout>
  );
}