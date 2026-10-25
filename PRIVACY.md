# Privacy policy

Last changed: 25 October 2026. Türkçesi: <https://mohamedattiadev.github.io/igrek/tr/privacy/>

Igrek runs on your computer. This policy says what that means for your data.

## What we receive

Nothing. Igrek has no account, no telemetry, no analytics and no server of ours. We do not see your
projects, chats, files, settings or how you use Igrek.

## Where your data goes

- **Your computer.** Everything Igrek keeps (projects, chats' history, memory, settings, private details)
  is in its data folder on your computer (`~/.igrek`). Private details and secrets are stored sealed.
- **The AI you use.** Chats go to Claude (Anthropic) or Codex (OpenAI) through your own accounts, the way
  Claude Code and Codex send them, under those companies' terms. Before a message leaves, Igrek replaces
  your saved private details and your projects' `.env` secrets with placeholders, and recognises money
  figures, IBANs, card and identity numbers by their shape.
- **Services you turn on.** Only if you set them up: Telegram, Discord or e-mail notifications, a team hub
  you run yourself, your own servers. Each is listed in Settings, Network, with every internet address
  Igrek has opened.
- **Downloads.** Updates and the first-start runtime (Bun) come from GitHub, which sees the request like
  any download. Dependency checks ask the public OSV database about package names and versions.

## Reporting a problem

"Report a problem" shows you the report (version, system, log lines with private details taken out)
and opens it on GitHub only when you choose to. A GitHub issue is public.

## Your rights

Your data never reaches us, so there is nothing for us to give back or delete: removing Igrek's data
folder removes it. For a question about this policy, use
[Discussions](https://github.com/Mohamedattiadev/igrek/discussions) or the contact in SECURITY.md.
This applies under the GDPR and Turkey's KVKK alike: Igrek's maker is not a controller of your data.
