import nodemailer from "nodemailer";

type ResetMailInput = {
  to: string;
  resetToken: string;
  expiresAt: Date;
};

type VerificationMailInput = {
  to: string;
  verificationToken: string;
  expiresAt: Date;
};

type LinkPreview = {
  token: string;
  url: string;
};

type MailDeliveryResult =
  | {
      mode: "smtp";
      preview: null;
    }
  | {
      mode: "local_fallback";
      preview: LinkPreview;
    };

let transporterPromise: Promise<nodemailer.Transporter> | null = null;

export async function sendPasswordResetEmail(input: ResetMailInput): Promise<MailDeliveryResult> {
  const resetUrl = buildResetUrl(input.resetToken);

  if (!isSmtpConfigured()) {
    console.log(`[mail:fallback] Password reset for ${input.to}: ${resetUrl}`);
    return {
      mode: "local_fallback",
      preview: {
        token: input.resetToken,
        url: resetUrl
      }
    };
  }

  const transporter = await getTransporter();
  const from = process.env.MAIL_FROM ?? "Kebab AI <no-reply@example.com>";
  const expiresText = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(input.expiresAt);

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "Passwort zuruecksetzen",
    text: [
      "Du hast einen Passwort-Reset fuer deinen Kebab-AI Account angefordert.",
      "",
      `Reset-Link: ${resetUrl}`,
      `Gueltig bis: ${expiresText}`,
      "",
      "Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren."
    ].join("\n"),
    html: `
      <p>Du hast einen Passwort-Reset fuer deinen Kebab-AI Account angefordert.</p>
      <p><a href="${resetUrl}">Passwort zuruecksetzen</a></p>
      <p>Gueltig bis: ${expiresText}</p>
      <p>Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren.</p>
    `
  });

  return {
    mode: "smtp",
    preview: null
  };
}

export async function sendEmailVerificationEmail(input: VerificationMailInput): Promise<MailDeliveryResult> {
  const verificationUrl = buildVerificationUrl(input.verificationToken);

  if (!isSmtpConfigured()) {
    console.log(`[mail:fallback] Email verification for ${input.to}: ${verificationUrl}`);
    return {
      mode: "local_fallback",
      preview: {
        token: input.verificationToken,
        url: verificationUrl
      }
    };
  }

  const transporter = await getTransporter();
  const from = process.env.MAIL_FROM ?? "Kebab AI <no-reply@example.com>";
  const expiresText = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(input.expiresAt);

  await transporter.sendMail({
    from,
    to: input.to,
    subject: "E-Mail Adresse bestaetigen",
    text: [
      "Bitte bestaetige die E-Mail Adresse fuer deinen Kebab-AI Account.",
      "",
      `Bestaetigungs-Link: ${verificationUrl}`,
      `Gueltig bis: ${expiresText}`,
      "",
      "Wenn du diese Registrierung nicht gestartet hast, kannst du diese E-Mail ignorieren."
    ].join("\n"),
    html: `
      <p>Bitte bestaetige die E-Mail Adresse fuer deinen Kebab-AI Account.</p>
      <p><a href="${verificationUrl}">E-Mail bestaetigen</a></p>
      <p>Gueltig bis: ${expiresText}</p>
      <p>Wenn du diese Registrierung nicht gestartet hast, kannst du diese E-Mail ignorieren.</p>
    `
  });

  return {
    mode: "smtp",
    preview: null
  };
}

function buildResetUrl(token: string) {
  const webBaseUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
  const url = new URL("/login", webBaseUrl);
  url.searchParams.set("resetToken", token);
  return url.toString();
}

function buildVerificationUrl(token: string) {
  const webBaseUrl = process.env.WEB_APP_URL ?? "http://localhost:3000";
  const url = new URL("/login", webBaseUrl);
  url.searchParams.set("verifyToken", token);
  return url.toString();
}

function isSmtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    );
  }

  return transporterPromise;
}
