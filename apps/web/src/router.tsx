import { createBrowserRouter } from "react-router";
import { RequireAuth } from "./components/RequireAuth";
import { AppShell } from "./components/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { RecordingsPage } from "./pages/RecordingsPage";
import { RecordPage } from "./pages/RecordPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignUpPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <RecordingsPage /> },
          { path: "/record", element: <RecordPage /> },
        ],
      },
    ],
  },
]);
