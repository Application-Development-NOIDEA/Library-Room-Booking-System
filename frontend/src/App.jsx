import { useState } from "react";
import SharedLayout from "./components/SharedLayout";

const pages = {
  dashboard: {
    title: "Dashboard",
    description: "Find a space to focus, study and collaborate.",
    heading: "Welcome to your library workspace",
    content:
      "Use the navigation to browse rooms, manage bookings and view your waiting list.",
  },

  rooms: {
    title: "Browse Rooms",
    description: "Explore spaces for individual and group study.",
    heading: "Room directory",
    content:
      "Carrel rooms, discussion rooms and meeting rooms will appear here.",
  },

  bookings: {
    title: "My Bookings",
    description: "View and manage your room reservations.",
    heading: "Your reservations",
    content:
      "Booking details, QR codes and reservation statuses will appear here.",
  },

  "waiting-list": {
    title: "Waiting List",
    description: "Queue for a fully booked room slot on the same day.",
    heading: "Your waiting-list requests",
    content:
      "Queue positions, available-room offers and response deadlines will appear here.",
  },

  feedback: {
    title: "Report an Issue",
    description: "Help improve library rooms and facilities.",
    heading: "Facility issue report",
    content:
      "The form for reporting room facility problems will appear here.",
  },
};

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const page = pages[activePage];

  return (
    <SharedLayout
      activePage={activePage}
      onNavigate={setActivePage}
      userName="Ariana Arissa"
    >
      <p className="page-eyebrow">STUDENT WORKSPACE</p>

      <h1 className="page-title">{page.title}</h1>

      <p className="page-description">{page.description}</p>

      <section className="content-card">
        <h2>{page.heading}</h2>
        <p>{page.content}</p>
      </section>
    </SharedLayout>
  );
}