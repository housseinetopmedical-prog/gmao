import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getRequestUserContext } from "@/metier/utilisateur-requete";
import { sendSupplierEmail } from "@/metier/emails";
import {
    buildSupplierThreadId,
    buildSupplierDefaultSubject,
    getExistingSupplierMessages,
    getSupplierMessagingOrders,
    getSupplierOrderOrThrow,
    storeSupplierMessage,
    updateSupplierOrderContact,
    type SupplierMessagePayload
} from "@/metier/messagerie-fournisseur";

function sanitizeFilename(name: string) {
    return String(name || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function resolveOutgoingAttachments(rawAttachments: unknown) {
    const attachments = Array.isArray(rawAttachments) ? rawAttachments : [];
    const resolved = [] as Array<{ filename: string; content: Buffer; contentType?: string }>;
    const payloadEntries = [] as Array<{ name: string; url: string; contentType?: string | null; size?: number | null }>;

    for (const entry of attachments) {
        const rawUrl = String((entry as any)?.rawUrl || "").trim();
        const name = sanitizeFilename(String((entry as any)?.name || "piece-jointe").trim() || "piece-jointe");
        if (!rawUrl.startsWith("/uploads/")) continue;
        const fullPath = path.join(process.cwd(), "public", rawUrl.replace(/^\//, "").replace(/\//g, path.sep));
        const content = await readFile(fullPath);
        const contentType = typeof (entry as any)?.contentType === "string" ? (entry as any).contentType : undefined;
        resolved.push({ filename: name, content, contentType });
        payloadEntries.push({
            name,
            url: `/api/uploads?path=${encodeURIComponent(rawUrl)}`,
            contentType: contentType || null,
            size: content.length
        });
    }

    return { resolved, payloadEntries };
}

export async function GET() {
    try {
        const threads = await getSupplierMessagingOrders();
        return NextResponse.json(threads);
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { role, userId } = getRequestUserContext(req);
        const currentRole = String(role || "");
        if (!["RESPONSABLE_TECHNIQUE", "ADMIN"].includes(currentRole)) {
            return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
        }
        if (!userId) {
            return NextResponse.json({ error: "Utilisateur invalide." }, { status: 400 });
        }

        const body = await req.json();
        const orderId = body?.orderId !== undefined && body?.orderId !== null && body?.orderId !== "" ? Number(body.orderId) : null;
        const threadId = String(body?.threadId || "").trim();
        const message = String(body?.message || "").trim();
        const subject = String(body?.subject || "").trim();
        const rawSupplierEmail = String(body?.supplierEmail || "").trim().toLowerCase();
        const supplierName = String(body?.supplierName || "").trim();
        const attachmentPayload = await resolveOutgoingAttachments(body?.attachments);

        if (orderId !== null && (!Number.isFinite(orderId) || orderId <= 0)) {
            return NextResponse.json({ error: "Commande invalide." }, { status: 400 });
        }
        if (!message) {
            return NextResponse.json({ error: "Le message est obligatoire." }, { status: 400 });
        }
        if (!subject) {
            return NextResponse.json({ error: "L'objet est obligatoire." }, { status: 400 });
        }
        if (!rawSupplierEmail || !rawSupplierEmail.includes("@")) {
            return NextResponse.json({ error: "L'e-mail du destinataire Gmail est obligatoire." }, { status: 400 });
        }

        const order = orderId ? await getSupplierOrderOrThrow(orderId) : null;
        const supplierEmail = rawSupplierEmail;
        if (order && supplierEmail !== String(order.supplierContact || "").trim().toLowerCase()) {
            await updateSupplierOrderContact(order.id, supplierEmail);
        }

        const finalThreadId = threadId || buildSupplierThreadId(orderId);
        const existingMessages = await getExistingSupplierMessages({ orderId, threadId: finalThreadId });
        const lastOutbound = [...existingMessages]
            .reverse()
            .map((entry) => entry.payload)
            .find((payload): payload is SupplierMessagePayload => Boolean(payload && payload.direction === "OUTBOUND"));

        const finalSupplierName = supplierName || order?.supplier || lastOutbound?.supplier || supplierEmail.split("@")[0] || "Fournisseur";
        const finalSubject = subject || lastOutbound?.subject || (order ? buildSupplierDefaultSubject(String(order.ref || ""), order.supplier) : `Echange avec ${finalSupplierName}`);
        const references = [
            ...(lastOutbound?.references || []),
            ...(lastOutbound?.gmailMessageId ? [lastOutbound.gmailMessageId] : [])
        ].filter(Boolean);

        const mailResult = await sendSupplierEmail({
            to: supplierEmail,
            supplierName: finalSupplierName,
            orderRef: order?.ref || "Conversation libre",
            subject: finalSubject,
            body: message,
            inReplyTo: lastOutbound?.gmailMessageId || undefined,
            references,
            attachments: attachmentPayload.resolved
        });

        const payload: SupplierMessagePayload = {
            channel: "SUPPLIER_EMAIL",
            threadId: finalThreadId,
            orderId: order?.id || null,
            orderRef: order?.ref || "",
            supplier: finalSupplierName,
            supplierEmail,
            subject: finalSubject,
            bodyText: message,
            direction: "OUTBOUND",
            gmailMessageId: String(mailResult.messageId || "").trim() || null,
            inReplyTo: lastOutbound?.gmailMessageId || null,
            references,
            from: process.env.GMAIL_FROM || process.env.GMAIL_USER || null,
            to: [supplierEmail],
            attachments: attachmentPayload.payloadEntries,
            externalDate: new Date().toISOString(),
            syncedAt: new Date().toISOString()
        };

        const saved = await storeSupplierMessage({
            order,
            userId,
            action: "SUPPLIER_EMAIL_SENT",
            payload
        });

        return NextResponse.json({
            threadId: finalThreadId,
            id: saved.id,
            action: saved.action,
            createdAt: saved.createdAt.toISOString(),
            senderName: saved.user?.name || "Responsable technique",
            senderRole: saved.user?.role || currentRole,
            payload
        }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}

