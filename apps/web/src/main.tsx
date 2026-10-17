import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { createBrowserRouter, RouterProvider } from "react-router";
import { Shell } from "./components/Shell";
import "./lib/i18n";
import { SettingsProvider, useSettings } from "./lib/settings";
import { ChatPage } from "./pages/Chat";
import { DesignPage } from "./pages/Design";
import { FilesPage } from "./pages/Files";
import { FlowRunPage } from "./pages/FlowRun";
import { IdeasPage } from "./pages/Ideas";
import { InboxPage } from "./pages/Inbox";
import { IncidentPage } from "./pages/Incident";
import { KnowledgePage } from "./pages/KnowledgePage";
import { LessonsPage } from "./pages/LessonsPage";
import { LibraryPage } from "./pages/LibraryPage";
import { LimitsPage } from "./pages/Limits";
import { MeetingPage } from "./pages/Meeting";
import { Onboarding } from "./pages/Onboarding";
import { PersonPage } from "./pages/Person";
import { NewPersonaPage, PersonaPage } from "./pages/PersonaDetail";
import { PersonasPage } from "./pages/Personas";
import { ProjectPage } from "./pages/Project";
import { ProjectsPage } from "./pages/Projects";
import { PromptsPage } from "./pages/Prompts";
import { SchedulesPage } from "./pages/SchedulesPage";
import { ServerPage, ServersPage } from "./pages/Servers";
import { SessionPage } from "./pages/Session";
import { SettingsPage } from "./pages/Settings";
import { TeamPage } from "./pages/Team";
import { TerminalPage, TerminalsPage } from "./pages/Terminals";
import { TestRunPage } from "./pages/Testers";
import { ToolsPage } from "./pages/tools/ToolsPage";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: "p/:projectId", element: <ProjectPage /> },
      { path: "p/:projectId/s/:sessionId", element: <SessionPage /> },
      { path: "terminals", element: <TerminalsPage /> },
      { path: "c/:chatId", element: <ChatPage /> },
      { path: "files", element: <FilesPage /> },
      { path: "ideas", element: <IdeasPage /> },
      { path: "servers", element: <ServersPage /> },
      { path: "servers/:serverId", element: <ServerPage /> },
      { path: "prompts", element: <PromptsPage /> },
      { path: "t/:termId", element: <TerminalPage /> },
      { path: "inbox", element: <InboxPage /> },
      { path: "limits", element: <LimitsPage /> },
      { path: "personas", element: <PersonasPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "lessons", element: <LessonsPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "personas/new", element: <NewPersonaPage /> },
      { path: "personas/:personaId", element: <PersonaPage /> },
      { path: "meetings/:meetingId", element: <MeetingPage /> },
      { path: "test-runs/:runId", element: <TestRunPage /> },
      { path: "runs/:runId", element: <FlowRunPage /> },
      { path: "schedules", element: <SchedulesPage /> },
      { path: "tools", element: <ToolsPage /> },
      { path: "incidents/:incidentId", element: <IncidentPage /> },
      { path: "team", element: <TeamPage /> },
      { path: "team/:userId", element: <PersonPage /> },
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
