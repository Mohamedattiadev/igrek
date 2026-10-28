import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import i18n, { loadBundled } from "../lib/i18n";
import { indexedDbStore, MemberClient } from "./client";
import { applyTheme, readTheme } from "./hooks";
import { MemberApp } from "./MemberApp";
import "@fontsource-variable/inter/wght.css";
import "../styles.css";

/**
 * The web member's page (plan.md 4.3), served by the team hub: no Igrek on this computer, so
 * the language comes from the browser and everything else from the hub, decrypted here.
 */
const language = navigator.language.toLowerCase().startsWith("tr") ? "tr" : "en";
document.documentElement.lang = language;
applyTheme(readTheme());
const client = new MemberClient(indexedDbStore());

void loadBundled(language)
  .then(() => i18n.changeLanguage(language))
  .then(() => {
    createRoot(document.getElementById("root") as HTMLElement).render(
      <StrictMode>
        <MemberApp client={client} />
      </StrictMode>,
    );
    // A guest's link has no sign-in to resume.
    return location.hash.startsWith("#/guest/") ? undefined : client.resume();
  });
