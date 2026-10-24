import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getRequestUserContext } from "@/metier/utilisateur-requete";
import { sendGenericEmail } from "@/metier/emails";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
    return String(name || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeFaxNumber(value: unknown) {
    return String(value || "").trim().replace(/[^\d+]/g, "");
}

function faxDigits(value: string) {
    return value.replace(/[^\d]/g, "");
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

async function resolveAttachments(rawAttachments: unknown) {
    const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
    const resolved = [] as Array<{ filename: string; content: Buffer; contentType?: string }>;

    for (const entry of attachments) {
        const rawUrl = String((entry as any)?.rawUrl || "").trim();
        const name = sanitizeFilename(String((entry as any)?.name || "piece-jointe").trim() || "piece-jointe");
        if (!rawUrl.startsWith("/uploads/")) continue;

        const fullPath = path.join(process.cwd(), "public", rawUrl.replace(/^\//, "").replace(/\//g, path.sep));
        const content = await readFile(fullPath);
        const contentType = typeof (entry as any)?.contentType === "string" ? (entry as any).contentType : undefined;
        resolved.push({ filename: name, content, contentType });
    }

    return resolved;
}

function getFaxProvider() {
    return String(process.env.FAX_PROVIDER || "email_gateway").trim().toLowerCase();
}

function resolveFaxRecipient(faxNumber: string) {
    const relayEmail = String(process.env.FAX_GATEWAY_EMAIL_TO || "").trim();
    if (relayEmail && relayEmail.includes("@")) return relayEmail;

    const gatewayDomain = String(process.env.FAX_GATEWAY_DOMAIN || "").trim().replace(/^@/, "");
    if (gatewayDomain) return `${faxDigits(faxNumber)}@${gatewayDomain}`;

    return "";
}

async function sendFaxPlusFax(params: {
    faxNumber: string;
    recipientName: string;
    subject: string;
    message: string;
    attachments: Array<{ filename: string; content: Buffer; contentType?: string }>;
}) {
    const accessToken = String(process.env.FAXPLUS_ACCESS_TOKEN || "").trim();
    const userId = String(process.env.FAXPLUS_USER_ID || "self").trim();
    const clientId = String(process.env.FAXPLUS_CLIENT_ID || "").trim();
    const fromNumber = String(process.env.FAXPLUS_FROM_NUMBER || "").trim();
    const baseUrl = String(process.env.FAXPLUS_BASE_URL || "https://restapi.fax.plus/v3").trim().replace(/\/$/, "");

    if (!accessToken) {
        throw new Error("Configuration Fax.Plus manquante : FAXPLUS_ACCESS_TOKEN.");
    }
    if (!fromNumber) {
        throw new Error("Configuration Fax.Plus manquante : FAXPLUS_FROM_NUMBER.");
    }
    if (params.attachments.length === 0) {
        throw new Error("Ajoutez au moins un fichier PDF à envoyer par fax.");
    }

    const headers = new Headers({
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
    });
    if (clientId) headers.set("x-fax-clientid", clientId);

    const uploadedFiles: string[] = [];
    for (const attachment of params.attachments) {
        const formData = new FormData();
        formData.append("fax_file", new Blob([new Uint8Array(attachment.content)], { type: attachment.contentType || "application/pdf" }), attachment.filename);

        const extension = path.extname(attachment.filename).toLowerCase();
        const format = extension === ".tif" || extension === ".tiff" ? "tiff" : "pdf";
        const uploadResponse = await fetch(`${baseUrl}/accounts/${encodeURIComponent(userId)}/files?format=${format}`, {
            method: "POST",
            headers,
            body: formData
        });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) {
            throw new Error(String(uploadData?.message || uploadData?.error || "Téléversement du fichier fax impossible."));
        }

        const filePath = String(uploadData?.path || uploadData?.file || uploadData?.id || "").trim();
        if (!filePath) {
            throw new Error("Réponse Fax.Plus invalide après téléversement du fichier.");
        }
        uploadedFiles.push(filePath);
    }

    const sendHeaders = new Headers(headers);
    sendHeaders.set("Content-Type", "application/json");

    const sendResponse = await fetch(`${baseUrl}/accounts/${encodeURIComponent(userId)}/outbox`, {
        method: "POST",
        headers: sendHeaders,
        body: JSON.stringify({
            comment: {
                text: [
                    params.subject,
                    "",
                    `Destinataire : ${params.recipientName}`,
                    `Numéro de fax : ${params.faxNumber}`,
                    "",
                    params.message
                ].join("\n")
            },
            files: uploadedFiles,
            from: fromNumber,
            to: [params.faxNumber],
            options: {
                enhancement: true,
                retry: {
                    count: 2,
                    delay: 15
                }
            },
            return_ids: true
        })
    });
    const sendData = await sendResponse.json().catch(() => ({}));
    if (!sendResponse.ok) {
        throw new Error(String(sendData?.message || sendData?.error || "Envoi Fax.Plus impossible."));
    }

    return String(sendData?.ids?.[0] || sendData?.id || `faxplus-${Date.now()}`);
}

export async function POST(req: Request) {
    try {
        const { role } = getRequestUserContext(req);
        if (!["RESPONSABLE_APPELS_OFFRE", "ADMIN"].includes(String(role || ""))) {
            return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
        }

        const body = await req.json();
        const faxNumber = normalizeFaxNumber(body?.faxNumber);
        const recipientName = String(body?.recipientName || "").trim();
        const subject = String(body?.subject || "").trim();
        const message = String(body?.message || "").trim();

        if (faxDigits(faxNumber).length < 6) {
            return NextResponse.json({ error: "Numéro de fax invalide." }, { status: 400 });
        }
        if (!recipientName) {
            return NextResponse.json({ error: "Le destinataire est obligatoire." }, { status: 400 });
        }
        if (!subject) {
            return NextResponse.json({ error: "L'objet est obligatoire." }, { status: 400 });
        }
        if (!message) {
            return NextResponse.json({ error: "Le message est obligatoire." }, { status: 400 });
        }

        const attachments = await resolveAttachments(body?.attachments);
        const sentAt = new Date().toISOString();
        let externalId = "";
        if (getFaxProvider() === "faxplus") {
            externalId = await sendFaxPlusFax({ faxNumber, recipientName, subject, message, attachments });
        } else {
            const faxRecipient = resolveFaxRecipient(faxNumber);
            if (!faxRecipient) {
                return NextResponse.json(
                    { error: "La passerelle fax n'est pas configurée. Définissez FAX_GATEWAY_DOMAIN ou FAX_GATEWAY_EMAIL_TO." },
                    { status: 501 }
                );
            }

            const text = [
                `Destinataire: ${recipientName}`,
                `Numéro de fax: ${faxNumber}`,
                "",
                message,
                "",
                "Top Médical SAV"
            ].join("\n");

            const mailResult = await sendGenericEmail({
                to: faxRecipient,
                replyTo: String(process.env.FAX_REPLY_TO || process.env.GMAIL_FROM || process.env.GMAIL_USER || "").trim() || undefined,
                subject: `[FAX] ${subject}`,
                text,
                html: `
                    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
                        <p><strong>Destinataire :</strong> ${escapeHtml(recipientName)}</p>
                        <p><strong>Numéro de fax :</strong> ${escapeHtml(faxNumber)}</p>
                        <div>${escapeHtmlWithLineBreaks(message)}</div>
                        <p style="margin-top:16px;font-weight:600;">Top Médical SAV</p>
                    </div>
                `,
                attachments
            });
            externalId = String((mailResult as any)?.messageId || `fax-${Date.now()}`);
        }

        return NextResponse.json({
            id: externalId,
            faxNumber,
            recipientName,
            subject,
            sentAt,
            status: "Envoyé"
        }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Envoi du fax impossible." }, { status: 500 });
    }
}
