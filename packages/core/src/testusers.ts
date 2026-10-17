/**
 * Test users panel (plan.md 6.1b): ordinary people who use the app in a real browser and
 * think aloud. Descriptions are English (the model follows them best); names and short labels
 * are translated in the UI (testers.<id>.name / .who). Each profile names the research it is
 * based on, so the behaviour is grounded rather than a cliché.
 */

export type TesterDevice = "desktop" | "phone" | "tablet";
export type TesterVision = "normal" | "low" | "screen-reader" | "color-blind";
export type TesterSkill = "none" | "basic" | "good" | "expert";

export interface TesterProfile {
  id: string;
  builtin: boolean;
  /** Own profiles keep their name; built-ins are translated. */
  name?: string;
  who?: string;
  icon: string;
  /** Who they are and how they behave, in English. */
  persona: string;
  age?: number;
  device: TesterDevice;
  vision: TesterVision;
  /** Slow 3G-like network and an old, slow phone. */
  slow: boolean;
  patience: "low" | "normal" | "high";
  skill: TesterSkill;
  /** Language they read best (code); differs from the app's when testing language and culture. */
  language: string;
  /** Tries to break things on purpose (only ever on your own app). */
  hostile?: boolean;
  /** Research the behaviour is based on. */
  basis: string[];
}

export interface TesterStep {
  at: number;
  /** What they think, in the report language. */
  thought?: string;
  /** What they did: "click: Save button", "type: e-mail field". */
  action?: string;
}

export interface TesterIssue {
  title: string;
  where: string;
  severity: "critical" | "major" | "minor";
  /** Who should fix it. */
  owner: "uiux" | "frontend";
}

export interface TesterSession {
  profileId: string;
  /** Several copies of one profile can run; this tells them apart. */
  copy: number;
  status: "waiting" | "running" | "done" | "failed";
  outcome?: "success" | "struggled" | "gave-up";
  /** How easy it felt, 0–10. */
  ease?: number;
  seconds?: number;
  steps: TesterStep[];
  stuckAt?: string[];
  complaints?: string[];
  issues?: TesterIssue[];
  /** One sentence in their own voice. */
  quote?: string;
  screenshots: string[];
  error?: string;
}

export interface TesterRun {
  id: string;
  projectId: string | null;
  url: string;
  /** What they try to do, in plain words. */
  task: string;
  profiles: string[];
  copies: number;
  status: "running" | "done" | "failed" | "stopped";
  sessions: TesterSession[];
  summary?: TesterSummary;
  /** The run this one repeats (regression check). */
  previousId?: string;
  /** Run again by itself after each new commit in the project (plan.md 6.1b regression). */
  autoRepeat?: boolean;
  /** The project's commit when this run started. */
  commit?: string;
  /** Started by itself because the project got this new commit. */
  autoFrom?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TesterSummary {
  /** "Teyze puanı": how easy it was for people with little tech experience, 0–100. */
  aunt?: number;
  /** Share of sessions that reached the goal, 0–1. */
  success: number;
  averageSeconds?: number;
  complaints: { text: string; count: number }[];
  issues: (TesterIssue & { count: number })[];
}

function profile(id: string, icon: string, p: Omit<TesterProfile, "id" | "builtin" | "icon">): TesterProfile {
  return { id, builtin: true, icon, ...p };
}

const NNG_SENIORS = "Nielsen Norman Group, Usability for Seniors (research report, several editions since 2002)";
const WEBAIM_SR = "WebAIM Screen Reader User Survey (repeated since 2009)";
const WCAG = "W3C Web Content Accessibility Guidelines (WCAG) 2.2";

export const BUILTIN_TESTERS: TesterProfile[] = [
  profile("aunt", "Heart", {
    persona:
      "A 70-year-old retired woman who has used a smartphone for two years, mostly for messaging her grandchildren. She reads every word slowly, is afraid of breaking something or losing money, avoids buttons she does not understand, does not know words like 'dashboard', 'sync' or 'deploy', and gives up when she feels stupid. She never right-clicks and does not know keyboard shortcuts.",
    age: 70,
    device: "phone",
    vision: "normal",
    slow: false,
    patience: "normal",
    skill: "none",
    language: "tr",
    basis: [NNG_SENIORS],
  }),
  profile("uncle", "Glasses", {
    persona:
      "A 75-year-old retired man with weak eyesight who sets his phone to the largest text size. Small text, low contrast and tiny tap targets make him miss things; he often taps the wrong item. He is patient but tires quickly, and he distrusts anything that looks like an advertisement.",
    age: 75,
    device: "phone",
    vision: "low",
    slow: false,
    patience: "high",
    skill: "basic",
    language: "tr",
    basis: [NNG_SENIORS, `${WCAG}: text resize, contrast and target size`],
  }),
  profile("child", "Rocket", {
    persona:
      "A 10-year-old child. Impatient, does not read instructions, clicks anything colourful or moving, tries random things to see what happens, and leaves the moment something is boring or slow. Reads simple words only.",
    age: 10,
    device: "tablet",
    vision: "normal",
    slow: false,
    patience: "low",
    skill: "basic",
    language: "tr",
    basis: ["Nielsen Norman Group, Children's Websites: Usability Issues in Designing for Kids (research report)"],
  }),
  profile("first-phone", "Smartphone", {
    persona:
      "A 45-year-old farmer who got his first smartphone last month. He does not know what icons like a hamburger menu, a gear or a share symbol mean, does not scroll unless told, and expects things to work like a paper form. Typing is slow for him.",
    age: 45,
    device: "phone",
    vision: "normal",
    slow: false,
    patience: "normal",
    skill: "none",
    language: "tr",
    basis: ["Pew Research Center, mobile technology and digital divide surveys"],
  }),
  profile("busy-exec", "Briefcase", {
    persona:
      "A 42-year-old manager doing this between two meetings on her phone. She scans instead of reading, wants the result in under a minute, skips onboarding and long texts, and gets annoyed by every extra step or confirmation.",
    age: 42,
    device: "phone",
    vision: "normal",
    slow: false,
    patience: "low",
    skill: "good",
    language: "tr",
    basis: ["Nielsen Norman Group, How Users Read on the Web (F-shaped scanning studies, 2006 and later)"],
  }),
  profile("newcomer", "Globe", {
    persona:
      "A 30-year-old who moved to Türkiye from Syria three years ago. Speaks everyday Turkish but reads it slowly; idioms, abbreviations and long sentences confuse him. He reads Arabic best and checks whether names, dates, addresses and phone numbers can be written his way.",
    age: 30,
    device: "phone",
    vision: "normal",
    slow: false,
    patience: "normal",
    skill: "good",
    language: "ar",
    basis: ["W3C Internationalization (i18n) best practices", "Plain language guidelines (plainlanguage.gov)"],
  }),
  profile("screen-reader", "Ear", {
    persona:
      "A 35-year-old blind software tester who uses a screen reader and only the keyboard. She moves by headings, landmarks and form labels. Unlabelled buttons ('button'), images without text, focus that jumps away and things that only appear on hover block her completely.",
    age: 35,
    device: "desktop",
    vision: "screen-reader",
    slow: false,
    patience: "normal",
    skill: "expert",
    language: "tr",
    basis: [WEBAIM_SR, WCAG],
  }),
  profile("color-blind", "Palette", {
    persona:
      "A 28-year-old man with red-green colour blindness (deuteranopia). He cannot tell red from green states, misses errors shown only in red, and struggles with charts that use colour alone.",
    age: 28,
    device: "desktop",
    vision: "color-blind",
    slow: false,
    patience: "normal",
    skill: "good",
    language: "tr",
    basis: [
      "About 8% of men and 0.4% of women of Northern European descent have red-green colour vision deficiency (Birch, 2012, J. Opt. Soc. Am. A)",
      `${WCAG}: use of colour`,
    ],
  }),
  profile("slow-phone", "Signal", {
    persona:
      "A 55-year-old who uses a five-year-old budget Android phone on a weak mobile connection in a small town. Pages load slowly, she taps again when nothing happens, and she leaves if a page stays blank for more than a few seconds.",
    age: 55,
    device: "phone",
    vision: "normal",
    slow: true,
    patience: "normal",
    skill: "basic",
    language: "tr",
    basis: [
      "Google/SOASTA research (2017): the chance of a bounce rises by about a third as load time grows from 1 to 3 seconds",
    ],
  }),
  profile("angry", "Flame", {
    persona:
      "A 38-year-old who is already annoyed because of an earlier problem. Has no patience at all, clicks fast and repeatedly, reads nothing, and complains loudly about anything slow, unclear or that asks him to repeat himself.",
    age: 38,
    device: "desktop",
    vision: "normal",
    slow: false,
    patience: "low",
    skill: "good",
    language: "tr",
    basis: ["Nielsen Norman Group, Response Times: The 3 Important Limits (Nielsen, 1993)"],
  }),
  profile("hostile", "Skull", {
    persona:
      "A 25-year-old who tries to break the app on purpose: very long text, emoji, HTML and script tags, SQL-looking input, negative numbers, empty forms, double submits, the back button in the middle of a flow. He reports what broke and what showed an ugly error. He never attacks anything outside this app.",
    age: 25,
    device: "desktop",
    vision: "normal",
    slow: false,
    patience: "high",
    skill: "expert",
    language: "tr",
    hostile: true,
    basis: ["OWASP Web Security Testing Guide: input validation testing"],
  }),
  profile("power-user", "Zap", {
    persona:
      "A 33-year-old developer who uses the app every day. Looks for keyboard shortcuts, bulk actions and the fastest path; is annoyed by extra clicks, slow animations and anything that cannot be done with the keyboard.",
    age: 33,
    device: "desktop",
    vision: "normal",
    slow: false,
    patience: "low",
    skill: "expert",
    language: "tr",
    basis: ["Nielsen Norman Group, Flexibility and efficiency of use (usability heuristic #7, 1994)"],
  }),
];

/** People with little tech experience: their ease makes the "teyze puanı". */
export function countsForAunt(p: Pick<TesterProfile, "skill" | "age">): boolean {
  return p.skill === "none" || p.skill === "basic" || (p.age ?? 0) >= 65;
}

/** Puts the sessions of a run together: success, the aunt score, the most common complaints. */
export function summarizeRun(sessions: TesterSession[], profiles: TesterProfile[]): TesterSummary {
  const done = sessions.filter((s) => s.status === "done");
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const aunt = done.filter((s) => {
    const p = byId.get(s.profileId);
    return p && countsForAunt(p) && typeof s.ease === "number";
  });
  const count = <T>(items: T[], key: (item: T) => string) => {
    const map = new Map<string, { item: T; count: number }>();
    for (const item of items) {
      const k = key(item).toLowerCase().trim();
      if (!k) continue;
      const entry = map.get(k);
      if (entry) entry.count++;
      else map.set(k, { item, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };
  const seconds = done.map((s) => s.seconds).filter((n): n is number => typeof n === "number");
  return {
    ...(aunt.length ? { aunt: Math.round((aunt.reduce((sum, s) => sum + (s.ease ?? 0), 0) / aunt.length) * 10) } : {}),
    success: done.length ? done.filter((s) => s.outcome === "success").length / done.length : 0,
    ...(seconds.length ? { averageSeconds: Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length) } : {}),
    complaints: count(
      done.flatMap((s) => s.complaints ?? []),
      (c) => c,
    )
      .slice(0, 10)
      .map(({ item, count }) => ({ text: item, count })),
    issues: count(
      done.flatMap((s) => s.issues ?? []),
      (i) => i.title,
    )
      .slice(0, 15)
      .map(({ item, count }) => ({ ...item, count })),
  };
}
