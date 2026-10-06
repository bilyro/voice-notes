import { createBrowserRouter, Navigate } from "react-router";
import { HomeRoute, RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { RecordingsPage } from "./pages/RecordingsPage";
import { RecordPage } from "./pages/RecordPage";
import { RecordingDetailPage } from "./pages/RecordingDetailPage";
import { LandingPage } from "./pages/LandingPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignUpPage /> },
  // the landing page for everyone (the sidebar logo links here); it adapts its buttons to the session
  { path: "/about", element: <LandingPage /> },
  // signed out: landing page; signed in: the app shell with the recordings list as its outlet
  { path: "/", element: <HomeRoute />, children: [{ index: true, element: <RecordingsPage /> }] },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/record", element: <RecordPage /> },
          { path: "/recordings/:id", element: <RecordingDetailPage /> },
        ],
      },
    ],
  },
  // unknown addresses go home instead of React Router's developer error page
  { path: "*", element: <Navigate to="/" replace /> },
]);
