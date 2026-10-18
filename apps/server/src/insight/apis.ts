import type { ApiMap, CodeRef, Endpoint, EnvKeyUse, ExternalApi } from "@igrek/core";
import { isEnvExample, type RepoFile, type Snapshot } from "./snapshot";

interface Provider {
  id: string;
  name: string;
  docs: string;
  /** Package names (npm, PyPI, Go, pub) whose import means this provider. */
  packages: RegExp;
  /** API hosts seen as URL literals. */
  hosts?: RegExp;
  /** Prefix of its environment variables. */
  env?: RegExp;
}

/** Common services; anything else still shows up by its URL host. */
const PROVIDERS: Provider[] = [
  {
    id: "stripe",
    name: "Stripe",
    docs: "https://docs.stripe.com/api",
    packages: /^(stripe|@stripe\/[\w-]+)$/,
    hosts: /api\.stripe\.com/,
    env: /^STRIPE_/,
  },
  {
    id: "iyzico",
    name: "iyzico",
    docs: "https://docs.iyzico.com",
    packages: /^iyzipay$/,
    hosts: /iyzipay\.com/,
    env: /^IYZI/,
  },
  {
    id: "paypal",
    name: "PayPal",
    docs: "https://developer.paypal.com/api/rest/",
    packages: /^(@paypal\/[\w-]+|paypal-rest-sdk)$/,
    hosts: /api(-m)?\.(sandbox\.)?paypal\.com/,
    env: /^PAYPAL_/,
  },
  {
    id: "openai",
    name: "OpenAI",
    docs: "https://platform.openai.com/docs/api-reference",
    packages: /^(openai|@ai-sdk\/openai)$/,
    hosts: /api\.openai\.com/,
    env: /^OPENAI_/,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    docs: "https://docs.anthropic.com/en/api",
    packages: /^(@anthropic-ai\/sdk|anthropic|@ai-sdk\/anthropic)$/,
    hosts: /api\.anthropic\.com/,
    env: /^ANTHROPIC_/,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    docs: "https://ai.google.dev/api",
    packages: /^(@google\/generative-ai|@google\/genai|google-generativeai|@ai-sdk\/google)$/,
    hosts: /generativelanguage\.googleapis\.com/,
    env: /^(GEMINI_|GOOGLE_AI_)/,
  },
  {
    id: "firebase",
    name: "Firebase",
    docs: "https://firebase.google.com/docs",
    packages: /^(firebase|firebase-admin|firebase_[\w]+|cloud_firestore|firebase_core)$/,
    hosts:
      /(firebaseio\.com|firestore\.googleapis\.com|fcm\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)/,
    env: /^FIREBASE_/,
  },
  {
    id: "supabase",
    name: "Supabase",
    docs: "https://supabase.com/docs",
    packages: /^(@supabase\/[\w-]+|supabase|supabase_flutter)$/,
    hosts: /\.supabase\.co/,
    env: /^(NEXT_PUBLIC_)?SUPABASE_/,
  },
  {
    id: "aws",
    name: "AWS",
    docs: "https://docs.aws.amazon.com",
    packages: /^(aws-sdk|@aws-sdk\/[\w-]+|boto3)$/,
    hosts: /\.amazonaws\.com/,
    env: /^(AWS_|S3_)/,
  },
  {
    id: "googlemaps",
    name: "Google Maps",
    docs: "https://developers.google.com/maps",
    packages: /^(@googlemaps\/[\w-]+|@react-google-maps\/api|google_maps_flutter|googlemaps)$/,
    hosts: /maps\.googleapis\.com/,
    env: /MAPS_/,
  },
  {
    id: "mapbox",
    name: "Mapbox",
    docs: "https://docs.mapbox.com/api/",
    packages: /^(mapbox-gl|@mapbox\/[\w-]+)$/,
    hosts: /api\.mapbox\.com/,
    env: /^MAPBOX_/,
  },
  {
    id: "twilio",
    name: "Twilio",
    docs: "https://www.twilio.com/docs",
    packages: /^twilio$/,
    hosts: /api\.twilio\.com/,
    env: /^TWILIO_/,
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    docs: "https://www.twilio.com/docs/sendgrid",
    packages: /^@sendgrid\/[\w-]+$/,
    hosts: /api\.sendgrid\.com/,
    env: /^SENDGRID_/,
  },
  {
    id: "resend",
    name: "Resend",
    docs: "https://resend.com/docs",
    packages: /^resend$/,
    hosts: /api\.resend\.com/,
    env: /^RESEND_/,
  },
  {
    id: "smtp",
    name: "E-mail (SMTP)",
    docs: "https://nodemailer.com",
    packages: /^(nodemailer|smtplib|aiosmtplib)$/,
    env: /^(SMTP_|MAIL_|EMAIL_)/,
  },
  {
    id: "sentry",
    name: "Sentry",
    docs: "https://docs.sentry.io",
    packages: /^(@sentry\/[\w-]+|sentry-sdk|sentry_flutter)$/,
    hosts: /\.sentry\.io/,
    env: /^(NEXT_PUBLIC_)?SENTRY_/,
  },
  {
    id: "posthog",
    name: "PostHog",
    docs: "https://posthog.com/docs",
    packages: /^(posthog-js|posthog-node|posthog)$/,
    hosts: /posthog\.com/,
    env: /POSTHOG_/,
  },
  {
    id: "auth0",
    name: "Auth0",
    docs: "https://auth0.com/docs/api",
    packages: /^(@auth0\/[\w-]+|auth0)$/,
    hosts: /\.auth0\.com/,
    env: /^AUTH0_/,
  },
  {
    id: "clerk",
    name: "Clerk",
    docs: "https://clerk.com/docs",
    packages: /^@clerk\/[\w-]+$/,
    hosts: /api\.clerk\.(com|dev)/,
    env: /CLERK_/,
  },
  {
    id: "zitadel",
    name: "ZITADEL",
    docs: "https://zitadel.com/docs/apis/introduction",
    packages: /^(@zitadel\/[\w-]+)$/,
    hosts: /zitadel\.(cloud|ch)/,
    env: /^ZITADEL_/,
  },
  {
    id: "github",
    name: "GitHub API",
    docs: "https://docs.github.com/rest",
    packages: /^(@octokit\/[\w-]+|octokit|PyGithub)$/,
    hosts: /api\.github\.com/,
    env: /^(GITHUB_|GH_)/,
  },
  {
    id: "slack",
    name: "Slack",
    docs: "https://api.slack.com",
    packages: /^(@slack\/[\w-]+|slack_sdk|slack-sdk)$/,
    hosts: /(slack\.com\/api|hooks\.slack\.com)/,
    env: /^SLACK_/,
  },
  {
    id: "telegram",
    name: "Telegram Bot API",
    docs: "https://core.telegram.org/bots/api",
    packages: /^(telegraf|node-telegram-bot-api|grammy|python-telegram-bot|aiogram)$/,
    hosts: /api\.telegram\.org/,
    env: /^TELEGRAM_/,
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    docs: "https://cloudinary.com/documentation",
    packages: /^(cloudinary|next-cloudinary)$/,
    hosts: /api\.cloudinary\.com/,
    env: /^CLOUDINARY_/,
  },
  {
    id: "algolia",
    name: "Algolia",
    docs: "https://www.algolia.com/doc/",
    packages: /^(algoliasearch|@algolia\/[\w-]+)$/,
    hosts: /algolia\.net/,
    env: /^ALGOLIA_/,
  },
  {
    id: "pusher",
    name: "Pusher",
    docs: "https://pusher.com/docs",
    packages: /^(pusher|pusher-js)$/,
    hosts: /pusher\.com/,
    env: /^PUSHER_/,
  },
  {
    id: "onesignal",
    name: "OneSignal",
    docs: "https://documentation.onesignal.com",
    packages: /^(onesignal-node|react-onesignal|onesignal_flutter|@onesignal\/[\w-]+)$/,
    hosts: /onesignal\.com/,
    env: /^ONESIGNAL_/,
  },
  {
    id: "expo",
    name: "Expo Push",
    docs: "https://docs.expo.dev/push-notifications/overview/",
    packages: /^(expo-server-sdk|expo-notifications)$/,
    hosts: /exp\.host/,
    env: /^EXPO_/,
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    docs: "https://huggingface.co/docs/api-inference",
    packages: /^(@huggingface\/[\w-]+|huggingface_hub|transformers)$/,
    hosts: /(api-inference\.)?huggingface\.co/,
    env: /^(HF_|HUGGINGFACE_)/,
  },
  {
    id: "replicate",
    name: "Replicate",
    docs: "https://replicate.com/docs",
    packages: /^replicate$/,
    hosts: /api\.replicate\.com/,
    env: /^REPLICATE_/,
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    docs: "https://elevenlabs.io/docs",
    packages: /^(elevenlabs|@elevenlabs\/[\w-]+)$/,
    hosts: /api\.elevenlabs\.io/,
    env: /^ELEVEN/,
  },
];

const SYSTEM_VARS = new Set([
  "NODE_ENV",
  "CI",
  "HOME",
  "PATH",
  "SHELL",
  "USER",
  "PWD",
  "TERM",
  "HOSTNAME",
  "TMPDIR",
  "LANG",
  "TZ",
  "GITHUB_ACTIONS",
  "VERCEL",
  "DEBUG",
]);
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|astro|py|go|dart|rb|php)$/;
const TEST = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[a-z]+$/;
/** Hosts that are never "an API this project uses". */
const IGNORED_HOSTS =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|example\.(com|org)|www\.w3\.org|schemas\.|json-schema\.org|github\.com|[\w.-]*\.githubusercontent\.com|fonts\.(googleapis|gstatic)\.com|cdn\.|cdnjs\.|unpkg\.com|registry\.npmjs\.org|npmjs\.com|developer\.mozilla\.org|docs?\.|[\w.-]+\.(png|jpg|svg)$|purl\.org|xmlns\.)/;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function pushRef(list: CodeRef[], ref: CodeRef, max = 15): void {
  if (list.length < max && !list.some((r) => r.path === ref.path && r.line === ref.line)) list.push(ref);
}

const IMPORT =
  /(?:import\s+[^'"]*?from\s+|import\s*\(\s*|require\s*\(\s*|^\s*import\s+|^\s*from\s+)["']?([@\w][\w@/.:-]*)["']?/gm;
const PY_IMPORT = /^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm;
const URL_LITERAL = /["'`](https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?::\d+)?[^"'`\s]*)["'`]/gi;
const ENV_USE =
  /(?:process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[["']([A-Z][A-Z0-9_]+)["']\]|import\.meta\.env\.([A-Z][A-Z0-9_]+)|Bun\.env\.([A-Z][A-Z0-9_]+)|os\.environ(?:\.get)?\(?\[?["']([A-Z][A-Z0-9_]+)["']|os\.getenv\(["']([A-Z][A-Z0-9_]+)["']|Deno\.env\.get\(["']([A-Z][A-Z0-9_]+)["']|ENV\[["']([A-Z][A-Z0-9_]+)["']\]|String\.fromEnvironment\(["']([A-Z][A-Z0-9_]+)["'])/g;
const ROUTE_JS =
  /\b(app|router|server|api|routes|r|fastify|hono)\.(get|post|put|patch|delete|all|options)\(\s*["'`](\/[^"'`]*)["'`]/g;
const ROUTE_NEST = /@(Get|Post|Put|Patch|Delete|All)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g;
const NEST_CONTROLLER = /@Controller\(\s*(?:["'`]([^"'`]*)["'`]|\{[^}]*path:\s*["'`]([^"'`]*)["'`])?/;
const ROUTE_PY = /@(?:app|router|bp|blueprint|api)\.(get|post|put|patch|delete|route)\(\s*["']([^"']+)["']/g;
const NEXT_HANDLER = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function packageProvider(spec: string): Provider | undefined {
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : (spec.split(/[/:]/)[0] ?? spec);
  // Dart: package:firebase_core/firebase_core.dart
  const dart = spec.startsWith("package:") ? spec.slice(8).split("/")[0] : undefined;
  return PROVIDERS.find((p) => p.packages.test(dart ?? name));
}

function nextRoutePath(path: string): string | undefined {
  // app/api/users/[id]/route.ts → /api/users/:id ; pages/api/users.ts → /api/users
  const app = path.match(/(?:^|\/)app\/(.+)\/route\.(ts|js|tsx|jsx)$/);
  if (app?.[1])
    return `/${app[1]
      .replace(/\([^)]+\)\//g, "")
      .replace(/\[\.{3}(\w+)\]/g, "*")
      .replace(/\[(\w+)\]/g, ":$1")}`;
  const pages = path.match(/(?:^|\/)pages\/(api\/.+)\.(ts|js)$/);
  if (pages?.[1]) return `/${pages[1].replace(/\/index$/, "").replace(/\[(\w+)\]/g, ":$1")}`;
  return undefined;
}

const nodeId = (s: string) => `n_${s.replace(/[^A-Za-z0-9]/g, "_")}`;
const nodeLabel = (s: string) => s.replace(/"/g, "'");

export function apiMap(snap: Snapshot): ApiMap {
  const external = new Map<string, ExternalApi>();
  const fileProviders = new Map<string, Set<string>>();
  const env = new Map<string, EnvKeyUse>();
  const endpoints: Endpoint[] = [];
  const clientCalls: { from: string; path: string }[] = [];
  const sources = snap.files.filter(
    (f): f is RepoFile & { text: string } => !!f.text && SOURCE.test(f.path) && !TEST.test(f.path),
  );

  const useProvider = (p: Provider, ref: CodeRef) => {
    let api = external.get(p.id);
    if (!api) {
      api = { id: p.id, name: p.name, docs: p.docs, refs: [], envKeys: [] };
      external.set(p.id, api);
    }
    pushRef(api.refs, ref);
    if (!fileProviders.has(ref.path)) fileProviders.set(ref.path, new Set());
    fileProviders.get(ref.path)?.add(p.id);
  };

  for (const f of sources) {
    const text = f.text;
    for (const pattern of [IMPORT, PY_IMPORT]) {
      for (const m of text.matchAll(pattern)) {
        const spec = m[1] ?? m[2] ?? "";
        const provider = packageProvider(spec) ?? packageProvider(spec.split(".")[0] ?? "");
        if (provider) useProvider(provider, { path: f.path, line: lineOf(text, m.index ?? 0) });
      }
    }
    for (const m of text.matchAll(URL_LITERAL)) {
      const host = (m[2] ?? "").toLowerCase();
      if (IGNORED_HOSTS.test(host)) continue;
      // Links to documentation aren't calls to the API.
      const urlPath = (m[1] ?? "").replace(/^https?:\/\/[^/]+/, "");
      if (
        /^(developer|developers|documentation|dashboard|console|status|blog|help|support|www)\./.test(host) ||
        /\/(docs?|documentation|reference|guides?|pricing)(\/|$)/.test(urlPath)
      )
        continue;
      const ref = { path: f.path, line: lineOf(text, m.index ?? 0) };
      const provider = PROVIDERS.find((p) => p.hosts?.test(host));
      if (provider) useProvider(provider, ref);
      else if (/^api\.|\/api\/|\/v\d+\//.test(`${host}${m[1]?.slice(8 + host.length) ?? ""}`)) {
        // An API we don't know by name: keep it by host.
        const id = `url:${host}`;
        if (!external.has(id)) external.set(id, { id, name: host, refs: [], envKeys: [] });
        pushRef(external.get(id)?.refs ?? [], ref);
      }
    }
    for (const m of text.matchAll(ENV_USE)) {
      const name = m.slice(1).find(Boolean);
      // Set by the system or tooling, not by the project; a name ending in "_" is built at runtime.
      if (!name || SYSTEM_VARS.has(name) || name.endsWith("_")) continue;
      if (!env.has(name)) env.set(name, { name, refs: [], documented: false });
      pushRef(env.get(name)?.refs ?? [], { path: f.path, line: lineOf(text, m.index ?? 0) }, 8);
    }
    // Own endpoints.
    const calls = () => [...(fileProviders.get(f.path) ?? [])];
    for (const m of text.matchAll(ROUTE_JS))
      endpoints.push({
        method: (m[2] ?? "").toUpperCase(),
        path: m[3] ?? "/",
        ref: { path: f.path, line: lineOf(text, m.index ?? 0) },
        framework: "js",
        calls: [],
      });
    if (/@Controller\(/.test(text)) {
      const prefix = text.match(NEST_CONTROLLER);
      const base = (prefix?.[1] ?? prefix?.[2] ?? "").replace(/^\/?/, "/").replace(/\/$/, "");
      for (const m of text.matchAll(ROUTE_NEST))
        endpoints.push({
          method: (m[1] ?? "").toUpperCase(),
          path: `${base}${m[2] ? `/${m[2].replace(/^\//, "")}` : ""}` || "/",
          ref: { path: f.path, line: lineOf(text, m.index ?? 0) },
          framework: "nestjs",
          calls: [],
        });
    }
    for (const m of text.matchAll(ROUTE_PY))
      endpoints.push({
        method: m[1] === "route" ? "ANY" : (m[1] ?? "").toUpperCase(),
        path: m[2] ?? "/",
        ref: { path: f.path, line: lineOf(text, m.index ?? 0) },
        framework: "python",
        calls: [],
      });
    const nextPath = nextRoutePath(f.path);
    if (nextPath) {
      const handlers = [...text.matchAll(NEXT_HANDLER)];
      for (const m of handlers.length ? handlers : [{ 1: "ANY", index: 0 } as unknown as RegExpMatchArray])
        endpoints.push({
          method: m[1] ?? "ANY",
          path: nextPath,
          ref: { path: f.path, line: lineOf(text, m.index ?? 0) },
          framework: "next",
          calls: [],
        });
    }
    for (const e of endpoints) if (e.ref.path === f.path) e.calls = calls();
    // Front-end calls to own API paths: fetch("/api/x"), axios.get(`/api/x/${id}`), request("/api/x")
    for (const m of text.matchAll(
      /(?:fetch|axios(?:\.\w+)?|request|ky(?:\.\w+)?|\$fetch|useFetch)\s*(?:<[^>]*>)?\(\s*["'`](\/[^"'`$?]*)/g,
    ))
      clientCalls.push({ from: f.path, path: m[1] ?? "" });
  }

  // Infra files mention settings too (${POSTGRES_PASSWORD} in compose), but also shell-local variables
  // and CI secrets. So these only count as "used"; they become settings only if an example file lists them.
  const infra = new Map<string, CodeRef[]>();
  for (const f of snap.files) {
    if (
      !f.text ||
      !/(\.(ya?ml|sh|bash|toml|conf|tf|hcl)|(^|\/)(Dockerfile[^/]*|Caddyfile|Makefile|Procfile))$/i.test(f.path) ||
      TEST.test(f.path)
    )
      continue;
    for (const m of f.text.matchAll(/\$\{?([A-Z][A-Z0-9_]{2,})(?=[}:\-?\s"'/]|$)/gm)) {
      const name = m[1];
      if (!name) continue;
      if (!infra.has(name)) infra.set(name, []);
      pushRef(infra.get(name) ?? [], { path: f.path, line: lineOf(f.text, m.index ?? 0) }, 8);
    }
  }

  // Names from example files only — never values, and never the real .env files.
  const documented = new Set<string>();
  for (const f of snap.files)
    if (isEnvExample(f.path) && f.text)
      for (const m of f.text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]+)\s*=/gm)) if (m[1]) documented.add(m[1]);
  for (const name of documented) {
    const refs = infra.get(name);
    if (!refs) continue;
    if (!env.has(name)) env.set(name, { name, refs: [], documented: true });
    for (const r of refs) pushRef(env.get(name)?.refs ?? [], r, 8);
  }
  for (const [name, use] of env) {
    use.documented = documented.has(name);
    // Public build-time prefixes don't change which service a key is for.
    const bare = name.replace(/^(NEXT_PUBLIC_|VITE_|EXPO_PUBLIC_|REACT_APP_|NUXT_PUBLIC_|PUBLIC_)/, "");
    const provider = PROVIDERS.find((p) => p.env?.test(bare));
    if (provider) {
      use.provider = provider.id;
      // A service only configured through its keys still counts as used.
      if (!external.has(provider.id))
        external.set(provider.id, {
          id: provider.id,
          name: provider.name,
          docs: provider.docs,
          refs: [...use.refs],
          envKeys: [],
        });
      const api = external.get(provider.id);
      if (api && !api.envKeys.includes(name)) api.envKeys.push(name);
    }
  }
  const unusedEnv = [...documented].filter((name) => !env.has(name) && !SYSTEM_VARS.has(name)).sort();

  return {
    external: [...external.values()].sort((a, b) => b.refs.length - a.refs.length).slice(0, 40),
    endpoints: endpoints.slice(0, 400),
    env: [...env.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unusedEnv,
    flow: flowDiagram(endpoints, clientCalls, external),
  };
}

/** Endpoints grouped by prefix: /api/team/users and /api/team/invite → "/api/team". */
function endpointGroup(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const keep = parts[0] === "api" || parts[0] === "v1" || parts[0] === "v2" ? 2 : 1;
  const group = parts.slice(0, keep).filter((p) => !p.startsWith(":") && p !== "*");
  return `/${group.join("/")}`;
}

/** Front-end files → own endpoint groups → outside services, from what the code actually calls. */
function flowDiagram(
  endpoints: Endpoint[],
  calls: { from: string; path: string }[],
  external: Map<string, ExternalApi>,
): string | undefined {
  const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const patterns = endpoints.map((e) => ({
    e,
    re: new RegExp(`^${escapeRe(e.path.replace(/\/$/, "")).replace(/:\w+/g, "[^/]+").replace(/\\\*/g, ".*")}$`),
  }));
  const match = (path: string) => patterns.find((p) => p.re.test(path.replace(/\/$/, "")))?.e;
  const group = (path: string) =>
    path
      .split("/")
      .slice(0, path.startsWith("apps/") || path.startsWith("packages/") ? 2 : 1)
      .join("/");
  const edges = new Map<string, number>();
  for (const call of calls) {
    const endpoint = match(call.path);
    if (endpoint) {
      const key = `${group(call.from)}\0${endpointGroup(endpoint.path)}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const e of endpoints)
    for (const id of e.calls) {
      const key = `${endpointGroup(e.path)}\0${external.get(id)?.name ?? id}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  if (edges.size === 0) return undefined;
  const lines = ["flowchart LR"];
  for (const [key, count] of [...edges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    const [from, to] = key.split("\0") as [string, string];
    lines.push(`  ${nodeId(from)}["${nodeLabel(from)}"] -->|${count}| ${nodeId(to)}["${nodeLabel(to)}"]`);
  }
  return lines.join("\n");
}
