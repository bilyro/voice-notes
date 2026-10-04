import { createBrowserRouter } from "react-router";
import { RequireAuth } from "./components/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { RecordingsPage } from "./pages/RecordingsPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/signup", element: <SignUpPage /> },
  {
    element: <RequireAuth />,
    children: [{ path: "/", element: <RecordingsPage /> }],
  },
]);
