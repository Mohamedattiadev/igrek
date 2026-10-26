import { type ComponentType, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { createBrowserRouter, RouterProvider } from "react-router";
import { RootBoundary } from "./components/RootBoundary";
import { Shell } from "./components/Shell";
import "./lib/i18n";
import "./lib/install";
import { SettingsProvider, useSettings } from "./lib/settings";
import { renameStoredKeys } from "./lib/storage-rename";
import { ProjectsPage } from "./pages/Projects";
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles.css";

/**
 * Each page is loaded the first time it is opened, so the first screen downloads only the shell and
 * the projects page (plan.md 15.4). React Router waits for the module before it shows the page.
 */
function page(load: () => Promise<Record<string, unknown>>, name: string) {
  return { lazy: async () => ({ Component: (await load())[name] as ComponentType }) };
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Shell />,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: "p/:projectId", ...page(() => import("./pages/Project"), "ProjectPage") },
      { path: "p/:projectId/s/:sessionId", ...page(() => import("./pages/Session"), "SessionPage") },
      { path: "terminals", ...page(() => import("./pages/Terminals"), "TerminalsPage") },
      { path: "agent/secret/:id", ...page(() => import("./pages/AgentRequests"), "SecretRequestPage") },
      { path: "agent/form/:id", ...page(() => import("./pages/AgentRequests"), "AgentFormPage") },
      { path: "agent/report/:id", ...page(() => import("./pages/AgentRequests"), "AgentReportPage") },
      { path: "c/new", ...page(() => import("./pages/StartChat"), "StartChatPage") },
      { path: "c/:chatId", ...page(() => import("./pages/Chat"), "ChatPage") },
      { path: "files", ...page(() => import("./pages/Files"), "FilesPage") },
      { path: "ideas", ...page(() => import("./pages/Ideas"), "IdeasPage") },
      { path: "servers", ...page(() => import("./pages/Servers"), "ServersPage") },
      { path: "servers/:serverId", ...page(() => import("./pages/Servers"), "ServerPage") },
      { path: "prompts", ...page(() => import("./pages/Prompts"), "PromptsPage") },
      { path: "t/:termId", ...page(() => import("./pages/Terminals"), "TerminalPage") },
      { path: "inbox", ...page(() => import("./pages/Inbox"), "InboxPage") },
      { path: "limits", ...page(() => import("./pages/Limits"), "LimitsPage") },
      { path: "personas", ...page(() => import("./pages/Personas"), "PersonasPage") },
      { path: "library", ...page(() => import("./pages/LibraryPage"), "LibraryPage") },
      { path: "lessons", ...page(() => import("./pages/LessonsPage"), "LessonsPage") },
      { path: "knowledge", ...page(() => import("./pages/KnowledgePage"), "KnowledgePage") },
      { path: "personas/new", ...page(() => import("./pages/PersonaDetail"), "NewPersonaPage") },
      { path: "personas/:personaId", ...page(() => import("./pages/PersonaDetail"), "PersonaPage") },
      { path: "meetings/:meetingId", ...page(() => import("./pages/Meeting"), "MeetingPage") },
      { path: "test-runs/:runId", ...page(() => import("./pages/Testers"), "TestRunPage") },
      { path: "runs/:runId", ...page(() => import("./pages/FlowRun"), "FlowRunPage") },
      { path: "batch", ...page(() => import("./pages/Batch"), "BatchPage") },
      { path: "schedules", ...page(() => import("./pages/SchedulesPage"), "SchedulesPage") },
      { path: "chief", ...page(() => import("./pages/ChiefPage"), "ChiefPage") },
      { path: "tools", ...page(() => import("./pages/tools/ToolsPage"), "ToolsPage") },
      { path: "incidents/:incidentId", ...page(() => import("./pages/Incident"), "IncidentPage") },
      { path: "weekly", ...page(() => import("./pages/Weekly"), "WeeklyPage") },
      { path: "guide", ...page(() => import("./pages/Guide"), "GuidePage") },
      { path: "learn", ...page(() => import("./pages/learn/Learn"), "LearnPage") },
      { path: "learn/s/:sheetId", ...page(() => import("./pages/learn/SheetPage"), "SheetPage") },
      { path: "learn/r/:roadmapId", ...page(() => import("./pages/learn/RoadmapPage"), "RoadmapPage") },
      { path: "team", ...page(() => import("./pages/Team"), "TeamPage") },
      { path: "team/:userId", ...page(() => import("./pages/Person"), "PersonPage") },
      { path: "settings", ...page(() => import("./pages/Settings"), "SettingsPage") },
      { path: "design", ...page(() => import("./pages/Design"), "DesignPage") },
      { path: "*", element: <ProjectsPage /> },
    ],
  },
]);

const FirstRun = lazy(() => import("./pages/FirstRun").then((m) => ({ default: m.FirstRun })));

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
  if (!settings.onboarded)
    return (
      <Suspense fallback={null}>
        <FirstRun />
      </Suspense>
    );
  return <RouterProvider router={router} />;
}

renameStoredKeys();
const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");
createRoot(root).render(
  <StrictMode>
    <RootBoundary>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </RootBoundary>
  </StrictMode>,
);
