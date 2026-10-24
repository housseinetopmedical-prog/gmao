import nodemailer from "nodemailer";

export type MailAttachmentInput = {
  filename: string;
  content: string | Buffer;
  contentType?: string;
};

export type GenericMailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachmentInput[];
};

function getTransporter() {
  const user = process.env.GMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Configuration Gmail manquante (GMAIL_USER / GMAIL_APP_PASSWORD).");
  }

  const host = process.env.GMAIL_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.GMAIL_SMTP_PORT || process.env.SMTP_PORT || 465);
  const secure = String(process.env.GMAIL_SMTP_SECURE || process.env.SMTP_SECURE || "true").toLowerCase() !== "false";

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

function getFromEmail() {
  return process.env.GMAIL_FROM || process.env.GMAIL_USER || "no-reply@topmedical.ma";
}

function getAuthenticatedEmail() {
  return process.env.GMAIL_USER || process.env.SMTP_USER || getFromEmail();
}

function getClientTransactionalSender() {
  const authenticatedEmail = getAuthenticatedEmail();
  return {
    from: `"Top Médical SAV" <${authenticatedEmail}>`,
    envelope: {
      from: authenticatedEmail
    },
    replyTo: process.env.GMAIL_REPLY_TO || process.env.SMTP_REPLY_TO || authenticatedEmail
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlWithLineBreaks(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

function safeHref(value: unknown) {
  const raw = String(value || "").trim();
  try {
    const parsed = new URL(raw, "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return escapeHtml(raw);
    }
  } catch {
    // Keep the fallback below for malformed URLs.
  }
  return "#";
}

export async function sendGenericEmail(params: GenericMailParams) {
  const transporter = getTransporter();
  const fromEmail = getFromEmail();

  return transporter.sendMail({
    from: `"Top Médical SAV" <${fromEmail}>`,
    to: params.to,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.text,
    html: params.html,
    inReplyTo: params.inReplyTo,
    references: params.references,
    attachments: params.attachments
  });
}

export async function sendSupplierEmail(params: {
  to: string;
  supplierName: string;
  orderRef: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: MailAttachmentInput[];
}) {
  const normalizedBody = params.body.trim();
  const normalizedText = [normalizedBody, "", "Top Medical SAV"].join("\n");
  const safeBody = escapeHtmlWithLineBreaks(normalizedBody);

  return sendGenericEmail({
    to: params.to,
    subject: params.subject,
    text: normalizedText,
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
        <p>${safeBody}</p>
        <p style="margin-top:16px;font-weight:600;">Top Medical SAV</p>
      </div>
    `,
    inReplyTo: params.inReplyTo,
    references: params.references,
    attachments: params.attachments
  });
}

export async function sendResetCodeEmail(params: { to: string; code: string; expiresInMinutes: number }) {
  const transporter = getTransporter();
  const fromEmail = getFromEmail();
  const safeCode = escapeHtml(params.code);
  const safeExpiresInMinutes = Number.isFinite(Number(params.expiresInMinutes)) ? Number(params.expiresInMinutes) : 0;

  await transporter.sendMail({
    from: `"Top Médical SAV Support" <${fromEmail}>`,
    to: params.to,
    subject: "Code de réinitialisation - Top Médical SAV",
    text: [
      "Bonjour,",
      "",
      `Votre code de réinitialisation est : ${params.code}`,
      `Ce code expire dans ${safeExpiresInMinutes} minutes.`,
      "",
      "Si vous n'avez pas demandé ce code, ignorez cet e-mail.",
      "",
      "Top Médical SAV"
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
        <h2 style="margin-bottom:12px;">Code de réinitialisation</h2>
        <p>Bonjour,</p>
        <p>Votre code de réinitialisation est :</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:3px;color:#991b1b;margin:10px 0;">${safeCode}</p>
        <p>Ce code expire dans ${safeExpiresInMinutes} minutes.</p>
        <p>Si vous n'avez pas demandé ce code, ignorez cet e-mail.</p>
        <p style="margin-top:16px;">Top Médical SAV</p>
      </div>
    `
  });
}

export async function sendClientAccountCreatedEmail(params: { to: string; name: string; email: string; password: string; loginUrl: string }) {
  const transporter = getTransporter();
  const sender = getClientTransactionalSender();
  const safeName = escapeHtml(params.name);
  const safeEmail = escapeHtml(params.email);
  const safePassword = escapeHtml(params.password);
  const safeLoginUrl = safeHref(params.loginUrl);

  await transporter.sendMail({
    ...sender,
    to: params.to,
    subject: "Création de votre compte client - Top Médical SAV",
    text: [
      `Bonjour ${params.name},`,
      "",
      "Votre compte client Top Médical SAV a été créé.",
      `Lien de connexion: ${params.loginUrl}`,
      `E-mail: ${params.email}`,
      `Mot de passe: ${params.password}`,
      "",
      "Top Médical SAV"
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
        <h2>Votre compte client est prêt</h2>
        <p>Bonjour ${safeName},</p>
        <p>Votre compte client Top Médical SAV a été créé.</p>
        <p><a href="${safeLoginUrl}" style="display:inline-block;background:#991b1b;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;">Accéder à mon interface</a></p>
        <p><strong>E-mail:</strong> ${safeEmail}<br/><strong>Mot de passe:</strong> ${safePassword}</p>
        <p>Top Médical SAV</p>
      </div>
    `
  });
}

export async function sendSatisfactionRequestEmail(params: { to: string; name: string; reclamationId: number; loginUrl: string; trackingUrl: string }) {
  const transporter = getTransporter();
  const sender = getClientTransactionalSender();
  const safeName = escapeHtml(params.name);
  const safeReclamationId = Number.isFinite(Number(params.reclamationId)) ? Number(params.reclamationId) : 0;
  const safeLoginUrl = safeHref(params.loginUrl);

  await transporter.sendMail({
    ...sender,
    to: params.to,
    subject: `Top Medical, votre avis sur l'intervention SAV #${safeReclamationId}`,
    text: [
      `Bonjour ${params.name},`,
      "",
      `Votre ticket SAV #${safeReclamationId} a été clôturé par l'administration des ventes.`,
      "Nous vous invitons à compléter l'enquête de satisfaction en cliquant sur le lien suivant.",
      `Évaluez notre SAV: ${params.loginUrl}`,
      "",
      "Top Médical SAV"
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
        <p>Bonjour ${safeName},</p>
        <p>Votre ticket SAV <strong>#${safeReclamationId}</strong> a été clôturé par l'administration des ventes.</p>
        <p>Nous vous invitons à compléter l'enquête de satisfaction en cliquant sur le lien suivant.</p>
        <p>
          <a href="${safeLoginUrl}" style="display:inline-block;background:#991b1b;color:white;padding:10px 14px;border-radius:6px;text-decoration:none;">Évaluez notre SAV</a>
        </p>
        <p>Top Médical SAV</p>
      </div>
    `
  });
}
