import nodemailer from "nodemailer";

/**
 * Email through your own SMTP account (plan.md 4.3b): free, e.g. a Gmail app password.
 * Without it the admin copies the invite code and sends it however they like.
 */
export interface MailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export function mailFromEnv(env: Record<string, string | undefined> = process.env): MailConfig | undefined {
  const host = env.SMTP_HOST?.trim();
  if (!host) return undefined;
  const port = Number(env.SMTP_PORT) || 587;
  const user = env.SMTP_USER?.trim() || undefined;
  return {
    host,
    port,
    // 465 is TLS from the start; 587/25 upgrade with STARTTLS.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    user,
    pass: env.SMTP_PASS || undefined,
    from: env.SMTP_FROM?.trim() || user || `igrek@${host}`,
  };
}

export type SendMail = (to: string, subject: string, text: string) => Promise<void>;

export function smtpSender(config: MailConfig): SendMail {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure && config.port !== 25,
    auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
    // Never read local files or fetch URLs while building a message.
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return async (to, subject, text) => {
    await transport.sendMail({ from: config.from, to, subject, text });
  };
}

export const EMAIL_RE = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i;

type Lang = "en" | "tr";
const TEXT: Record<Lang, Record<"invite" | "reset" | "code", { subject: string; body: string }>> = {
  en: {
    invite: {
      subject: "{from} invited you to the {team} team on Igrek",
      body: 'Hi {name},\n\n{from} added you to the team on Igrek.\n\nOpen Igrek, go to Team, choose "Join with an invite" and paste this code:\n\n{code}\n\nYou\'ll pick your own password on the first sign-in. After that, a teammate approves your device and you can see the shared projects.\n',
    },
    reset: {
      subject: "Your new Igrek sign-in",
      body: 'Hi {name},\n\n{from} reset your Igrek password. Open Igrek, go to Team, choose "Join with an invite" and paste this code:\n\n{code}\n\nYou\'ll pick a new password right away. Your other devices were signed out.\n',
    },
    code: {
      subject: "Your Igrek password reset code",
      body: "Hi {name},\n\nSomeone asked to reset your Igrek password. If it was you, enter this code within 30 minutes:\n\n{code}\n\nIf it wasn't you, ignore this email; nothing changes.\n",
    },
  },
  tr: {
    invite: {
      subject: "{from} seni Igrek'te {team} takımına davet etti",
      body: "Merhaba {name},\n\n{from} seni Igrek'teki takıma ekledi.\n\nIgrek'i aç, Takım sayfasında \"Davetle katıl\"ı seç ve şu kodu yapıştır:\n\n{code}\n\nİlk girişte kendi şifreni belirleyeceksin. Ardından bir takım arkadaşın cihazını onaylar ve paylaşılan projeleri görürsün.\n",
    },
    reset: {
      subject: "Yeni Igrek girişin",
      body: 'Merhaba {name},\n\n{from} Igrek şifreni sıfırladı. Igrek\'i aç, Takım sayfasında "Davetle katıl"ı seç ve şu kodu yapıştır:\n\n{code}\n\nHemen yeni bir şifre belirleyeceksin. Diğer cihazlarından çıkış yapıldı.\n',
    },
    code: {
      subject: "Igrek şifre sıfırlama kodun",
      body: "Merhaba {name},\n\nIgrek şifreni sıfırlamak için istek geldi. Sen istediysen bu kodu 30 dakika içinde gir:\n\n{code}\n\nSen istemediysen bu e-postayı yok say; hiçbir şey değişmez.\n",
    },
  },
};

/** The message in the reader's language (English when there's no translation for it). */
export function mailText(
  kind: "invite" | "reset" | "code",
  language: string | undefined,
  vars: Record<string, string>,
): { subject: string; text: string } {
  const lang: Lang = language?.startsWith("tr") ? "tr" : "en";
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
  return { subject: fill(TEXT[lang][kind].subject).replace(/[\r\n]/g, " "), text: fill(TEXT[lang][kind].body) };
}
