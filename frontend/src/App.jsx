import { useEffect, useState } from "react";
import SharedLayout from "./components/SharedLayout";
import MyBookings from "./student/MyBookings";
import WaitingList from "./student/WaitingList";
import StudentDashboard from "./student/StudentDashboard";
import Profile, { campusName } from "./student/Profile";

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

/* Sample student profile (will come from the Supabase "profiles" table later) */
const defaultProfile = {
  fullName: "Ariana Arissa Binti Azri",
  matricNo: "A23CS0001",
  programme: "Bachelor of Computer Science (Software Engineering)",
  year: 3,
  campus: "jb",
};

const PROFILE_KEY = "psz-profile";

function loadProfile() {
  try {
    const saved = window.localStorage.getItem(PROFILE_KEY);
    return saved ? { ...defaultProfile, ...JSON.parse(saved) } : defaultProfile;
  } catch {
    return defaultProfile;
  }
}

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [profile, setProfile] = useState(loadProfile);
  const page = pages[activePage] ?? pages.rooms;

  // Keep the demo profile after a refresh
  useEffect(() => {
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
      /* storage unavailable: ignore */
    }
  }, [profile]);

  function renderPage() {
    switch (activePage) {
      case "dashboard":
        return <StudentDashboard onNavigate={setActivePage} userName={profile.fullName} />;

      case "bookings":
        return <MyBookings />;

      case "waiting-list":
        return <WaitingList />;

      case "profile":
        return <Profile profile={profile} onSave={setProfile} />;

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
      userName={profile.fullName}
      userDetail={`${profile.matricNo} · ${campusName(profile.campus).replace("UTM ", "")}`}
    >
      {renderPage()}
    </SharedLayout>
  );
}