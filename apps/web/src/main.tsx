import { Gauge, Users } from "lucide-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Shell } from "./components/Shell";
import "./lib/i18n";
import { SettingsProvider, useSettings } from "./lib/settings";
import { DesignPage } from "./pages/Design";
import { InboxPage } from "./pages/Inbox";
import { Onboarding } from "./pages/Onboarding";
import { PlaceholderPage } from "./pages/Placeholder";
import { ProjectsPage } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "limits", element: <PlaceholderPage title="nav.limits" icon={Gauge} /> },
      { path: "team", element: <PlaceholderPage title="nav.team" icon={Users} /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "design", element: <DesignPage /> },
      { path: "*", element: <ProjectsPage /> },
    ],
  },
]);

function App() {
  const { loaded, error, settings } = useSettings();
  const { t } = useTranslation();
  if (error && !loaded) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[13px] text-fg-muted">
        {t("status.offline")} — {error}
      </div>
    );
  }
  if (!loaded) return null;
  if (!settings.onboarded) return <Onboarding />;
  return <RouterProvider router={router} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
