import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import prisma from "@/metier/base-donnees";

export const SUPPLIER_MESSAGE_ACTIONS = ["SUPPLIER_EMAIL_SENT", "SUPPLIER_EMAIL_RECEIVED"] as const;

export type SupplierMessageDirection = "OUTBOUND" | "INBOUND";

export type SupplierMessagePayload = {
    channel: "SUPPLIER_EMAIL";
    threadId: string;
    orderId: number | null;
    orderRef: string;
    supplier: string;
    supplierEmail: string;
    subject: string;
    bodyText: string;
    direction: SupplierMessageDirection;
    gmailMessageId?: string | null;
    inReplyTo?: string | null;
    references?: string[];
    from?: string | null;
    to?: string[];
    attachments?: Array<{
        name: string;
        url: string;
        contentType?: string | null;
        size?: number | null;
    }>;
    externalDate?: string | null;
    syncedAt?: string | null;
};

export type SupplierThreadMessage = {
    id: number;
    action: string;
    createdAt: string;
    senderName: string;
    senderRole: string | null;
    payload: SupplierMessagePayload;
};

export type SupplierThreadSummary = {
    threadId: string;
    orderId: number | null;
    orderRef: string;
    supplier: string;
    supplierEmail: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    ticket: {
        id: number;
        title: string;
        equipmentId: number;
    } | null;
    items: Array<{
        id: number;
        name: string;
        ref: string | null;
        qty: number;
        ticketId: number | null;
    }>;
    messages: SupplierThreadMessage[];
};

type PurchaseOrderWithRelations = Awaited<ReturnType<typeof prisma.purchase_order.findUnique>> & {
    items?: Array<{
        id: number;
        name: string;
        ref: string | null;
        qty: number;
        ticketId: number | null;
        ticket?: {
            id: number;
            title: string;
            equipmentId: number;
        } | null;
    }>;
};

function normalizeOrderId(raw: unknown) {
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function getThreadIdFromOrder(orderId: number | null) {
    return orderId ? `order:${orderId}` : "";
}

function makeManualThreadId() {
    return `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function cleanEmailReplyText(raw: string) {
    const normalized = String(raw || "").replace(/\r\n/g, "\n").trim();
    if (!normalized) return "";

    const withoutQuotedHeaders = normalized
        .replace(/^.*<[^>]+>\s+a\s+écrit\s*:\s*$/gim, "")
        .replace(/^.*<[^>]+>\s+wrote\s*:\s*$/gim, "")
        .replace(/^logo-plateforme\.png$/gim, "")
        .trim();

    const lines = withoutQuotedHeaders.split("\n");
    const stopPatterns = [
        /^>+/,
        /^On .+wrote:$/i,
        /^.+wrote\s*:?$/i,
        /^Le .+a écrit\s*:?$/i,
        /^.+a écrit\s*:?$/i,
        /^De\s*:/i,
        /^From\s*:/i,
        /^Envoyé\s*:/i,
        /^Sent\s*:/i,
        /^Objet\s*:/i,
        /^Subject\s*:/i,
        /^À\s*:/i,
        /^To\s*:/i,
        /^Cc\s*:/i,
        /^---+\s*Original Message\s*---+/i
    ];

    const kept: string[] = [];
    for (const line of lines) {
        if (stopPatterns.some((pattern) => pattern.test(line.trim()))) break;
        kept.push(line);
    }

    return kept.join("\n").trim() || normalized;
}

function sanitizeFilename(name: string) {
    return String(name || "fichier").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function storeIncomingAttachment(params: { filename: string; content: Buffer; contentType?: string | null; size?: number | null }) {
    if (/logo-plateforme\.png/i.test(String(params.filename || ""))) {
        return null;
    }

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const ext = path.extname(params.filename || "");
    const base = sanitizeFilename(path.basename(params.filename || "piece-jointe", ext));
    const storedFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${base}${ext}`;
    await writeFile(path.join(uploadDir, storedFilename), params.content);

    return {
        name: params.filename,
        url: `/api/uploads?path=${encodeURIComponent(`/uploads/${storedFilename}`)}`,
        contentType: params.contentType || null,
        size: params.size || params.content.length
    };
}

export function parseSupplierMessagePayload(note: string | null | undefined): SupplierMessagePayload | null {
    if (!note) return null;
    try {
        const parsed = JSON.parse(note) as Partial<SupplierMessagePayload>;
        if (parsed?.channel !== "SUPPLIER_EMAIL") return null;
        const orderId = normalizeOrderId(parsed.orderId);
        const threadId = String(parsed.threadId || getThreadIdFromOrder(orderId) || "").trim();
        if (!threadId) return null;

        return {
            channel: "SUPPLIER_EMAIL",
            threadId,
            orderId,
            orderRef: String(parsed.orderRef || "").trim(),
            supplier: String(parsed.supplier || "").trim(),
            supplierEmail: String(parsed.supplierEmail || "").trim(),
            subject: String(parsed.subject || "").trim(),
            bodyText: String(parsed.bodyText || "").trim(),
            direction: parsed.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
            gmailMessageId: typeof parsed.gmailMessageId === "string" ? parsed.gmailMessageId.trim() : null,
            inReplyTo: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo.trim() : null,
            references: Array.isArray(parsed.references) ? parsed.references.map((value) => String(value || "").trim()).filter(Boolean) : [],
            from: typeof parsed.from === "string" ? parsed.from.trim() : null,
            to: Array.isArray(parsed.to) ? parsed.to.map((value) => String(value || "").trim()).filter(Boolean) : [],
            attachments: Array.isArray(parsed.attachments)
                ? parsed.attachments
                      .map((attachment) => ({
                          name: String(attachment?.name || "").trim(),
                          url: String(attachment?.url || "").trim(),
                          contentType: typeof attachment?.contentType === "string" ? attachment.contentType.trim() : null,
                          size: Number.isFinite(Number(attachment?.size)) ? Number(attachment?.size) : null
                      }))
                      .filter((attachment) => attachment.name && attachment.url)
                : [],
            externalDate: typeof parsed.externalDate === "string" ? parsed.externalDate : null,
            syncedAt: typeof parsed.syncedAt === "string" ? parsed.syncedAt : null
        };
    } catch {
        return null;
    }
}

function stripReplyPrefix(value: string) {
    return value.replace(/^(re|tr|fwd|fw)\s*:\s*/i, "").trim().toLowerCase();
}

function normalizeEmail(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase();
}

export function buildSupplierDefaultSubject(orderRef: string, supplier: string) {
    const safeSupplier = supplier.trim() || "fournisseur";
    return `[Commande ${orderRef}] Echange avec ${safeSupplier}`;
}

function hasFetchPayload(
    value: false | {
        source?: Buffer;
        envelope?: { subject?: string | null };
        internalDate?: Date | string;
    }
): value is {
    source?: Buffer;
    envelope?: { subject?: string | null };
    internalDate?: Date | string;
} {
    return Boolean(value);
}

function buildMessageRow(row: any, payload: SupplierMessagePayload): SupplierThreadMessage {
    return {
        id: row.id,
        action: row.action,
        createdAt: row.createdAt.toISOString(),
        senderName: row.user?.name || (payload.direction === "INBOUND" ? payload.supplier : "Utilisateur"),
        senderRole: row.user?.role || (payload.direction === "INBOUND" ? "SUPPLIER" : null),
        payload
    };
}

export async function getSupplierMessagingOrders() {
    const [orders, historyRows] = await Promise.all([
        prisma.purchase_order.findMany({
            where: {
                items: {
                    some: {
                        ticketId: {
                            not: null
                        }
                    }
                }
            },
            include: {
                items: {
                    include: {
                        ticket: {
                            select: {
                                id: true,
                                title: true,
                                equipmentId: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: "desc"
            }
        }),
        prisma.sav_history.findMany({
            where: {
                action: {
                    in: [...SUPPLIER_MESSAGE_ACTIONS]
                }
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                }
            },
            orderBy: {
                createdAt: "asc"
            }
        })
    ]);

    const messagesByThread = new Map<string, SupplierThreadMessage[]>();
    historyRows.forEach((row) => {
        const payload = parseSupplierMessagePayload(row.note);
        if (!payload) return;
        const messages = messagesByThread.get(payload.threadId) || [];
        messages.push(buildMessageRow(row, payload));
        messagesByThread.set(payload.threadId, messages);
    });

    const orderThreads = orders.map((order) => {
        const threadId = getThreadIdFromOrder(order.id);
        const anchorItem = order.items.find((item) => item.ticket) || null;
        const messages = messagesByThread.get(threadId) || [];
        const updatedAt = messages.length > 0 ? messages[messages.length - 1].createdAt : order.updatedAt.toISOString();

        return {
            threadId,
            orderId: order.id,
            orderRef: order.ref,
            supplier: order.supplier,
            supplierEmail: String(order.supplierContact || "").trim(),
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            updatedAt,
            ticket: anchorItem?.ticket
                ? {
                      id: anchorItem.ticket.id,
                      title: anchorItem.ticket.title,
                      equipmentId: anchorItem.ticket.equipmentId
                  }
                : null,
            items: order.items.map((item) => ({
                id: item.id,
                name: item.name,
                ref: item.ref,
                qty: item.qty,
                ticketId: item.ticketId
            })),
            messages
        } satisfies SupplierThreadSummary;
    });

    const manualThreads = new Map<string, SupplierThreadSummary>();
    historyRows.forEach((row) => {
        const payload = parseSupplierMessagePayload(row.note);
        if (!payload || payload.orderId !== null) return;
        const existing = manualThreads.get(payload.threadId);
        const message = buildMessageRow(row, payload);
        if (!existing) {
            manualThreads.set(payload.threadId, {
                threadId: payload.threadId,
                orderId: null,
                orderRef: "",
                supplier: payload.supplier || payload.supplierEmail,
                supplierEmail: payload.supplierEmail,
                status: "OPEN",
                createdAt: row.createdAt.toISOString(),
                updatedAt: row.createdAt.toISOString(),
                ticket: null,
                items: [],
                messages: [message]
            });
            return;
        }
        existing.messages.push(message);
        existing.updatedAt = row.createdAt.toISOString();
        if (!existing.supplier && payload.supplier) existing.supplier = payload.supplier;
        if (!existing.supplierEmail && payload.supplierEmail) existing.supplierEmail = payload.supplierEmail;
    });

    return [...manualThreads.values(), ...orderThreads]
        .filter((thread) => thread.messages.length > 0)
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

export async function getSupplierOrderOrThrow(orderId: number) {
    const order = await prisma.purchase_order.findUnique({
        where: { id: orderId },
        include: {
            items: {
                include: {
                    ticket: {
                        select: {
                            id: true,
                            title: true,
                            equipmentId: true
                        }
                    }
                }
            }
        }
    });

    if (!order) {
        throw new Error("Commande fournisseur introuvable.");
    }

    return order as PurchaseOrderWithRelations;
}

export async function updateSupplierOrderContact(orderId: number, supplierContact: string) {
    return prisma.purchase_order.update({
        where: { id: orderId },
        data: {
            supplierContact: supplierContact.trim() || null
        }
    });
}

export function resolveOrderAnchor(order: PurchaseOrderWithRelations) {
    const anchorItem = order.items?.find((item) => item.ticket) || null;
    if (!anchorItem?.ticket) {
        throw new Error("Cette commande n'est liée à aucun ticket exploitable pour l'historique.");
    }

    return {
        ticketId: anchorItem.ticket.id,
        equipmentId: anchorItem.ticket.equipmentId
    };
}

export async function getSupplierFallbackAnchor() {
    const equipment = await prisma.equipment.findFirst({
        orderBy: { id: "asc" },
        select: { id: true }
    });

    if (!equipment?.id) {
        throw new Error("Aucun matériel n'est disponible pour enregistrer cette conversation.");
    }

    return {
        ticketId: null,
        equipmentId: equipment.id
    };
}

export async function getExistingSupplierMessages(params: { orderId?: number | null; threadId?: string | null }) {
    const rows = await prisma.sav_history.findMany({
        where: {
            action: {
                in: [...SUPPLIER_MESSAGE_ACTIONS]
            }
        },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            }
        },
        orderBy: {
            createdAt: "asc"
        }
    });

    return rows
        .map((row) => ({ row, payload: parseSupplierMessagePayload(row.note) }))
        .filter((entry) => {
            if (!entry.payload) return false;
            if (params.threadId) return entry.payload.threadId === params.threadId;
            if (params.orderId !== undefined) return entry.payload.orderId === params.orderId;
            return false;
        });
}

export async function storeSupplierMessage(params: {
    order?: PurchaseOrderWithRelations | null;
    userId: number;
    action: (typeof SUPPLIER_MESSAGE_ACTIONS)[number];
    payload: SupplierMessagePayload;
}) {
    const anchor = params.order ? resolveOrderAnchor(params.order) : await getSupplierFallbackAnchor();
    const firstAttachment = Array.isArray(params.payload.attachments) ? params.payload.attachments[0] : null;

    return prisma.$transaction(async (tx) => {
        await tx.messagerie_fournisseur.create({
            data: {
                threadId: params.payload.threadId,
                ticketId: anchor.ticketId,
                equipmentId: anchor.equipmentId,
                expediteurId: params.userId,
                fournisseur: params.payload.supplier || null,
                fournisseurEmail: params.payload.supplierEmail || null,
                sujet: params.payload.subject || "Conversation fournisseur",
                message: params.payload.bodyText || "",
                direction: params.payload.direction,
                pieceJointeUrl: firstAttachment?.url || null,
                pieceJointeNom: firstAttachment?.name || null,
                externalMessageId: params.payload.gmailMessageId || null
            }
        });

        return tx.sav_history.create({
            data: {
                ticketId: anchor.ticketId,
                equipmentId: anchor.equipmentId,
                userId: params.userId,
                action: params.action,
                note: JSON.stringify(params.payload)
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                }
            }
        });
    });
}

function buildImapClient() {
    const user = process.env.GMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD || process.env.SMTP_PASS;
    if (!user || !pass) {
        throw new Error("Configuration Gmail manquante pour la synchronisation IMAP.");
    }

    return new ImapFlow({
        host: process.env.GMAIL_IMAP_HOST || "imap.gmail.com",
        port: Number(process.env.GMAIL_IMAP_PORT || 993),
        secure: String(process.env.GMAIL_IMAP_SECURE || "true").toLowerCase() !== "false",
        auth: {
            user,
            pass
        }
    });
}

export async function syncSupplierReplies(params: { orderId?: number | null; threadId?: string | null; userId: number }) {
    const orderId = normalizeOrderId(params.orderId);
    const order = orderId ? await getSupplierOrderOrThrow(orderId) : null;
    const threadId = String(params.threadId || getThreadIdFromOrder(orderId) || "").trim();
    if (!threadId) {
        throw new Error("Conversation fournisseur invalide.");
    }

    const existing = await getExistingSupplierMessages({ orderId, threadId });
    const firstPayload = existing[0]?.payload || null;
    const supplierEmail = normalizeEmail(order?.supplierContact || firstPayload?.supplierEmail);
    if (!supplierEmail) {
        throw new Error("Aucun e-mail fournisseur n'est défini pour cette conversation.");
    }

    const knownGmailIds = new Set(
        existing
            .map((entry) => entry.payload?.gmailMessageId)
            .filter((value): value is string => Boolean(value))
    );
    const outboundIds = new Set(
        existing
            .filter((entry) => entry.payload?.direction === "OUTBOUND")
            .flatMap((entry) => [entry.payload?.gmailMessageId, ...(entry.payload?.references || [])])
            .filter((value): value is string => Boolean(value))
    );
    const knownSubjects = new Set(
        existing
            .map((entry) => stripReplyPrefix(String(entry.payload?.subject || "")))
            .filter(Boolean)
    );
    if (order) {
        knownSubjects.add(stripReplyPrefix(buildSupplierDefaultSubject(order.ref, order.supplier)));
    }

    const client = buildImapClient();
    const createdMessages: SupplierThreadMessage[] = [];

    try {
        await client.connect();
        await client.mailboxOpen("INBOX");

        const since = existing[0]?.row.createdAt || new Date(Date.now() - 1000 * 60 * 60 * 24 * 45);
        const uids = await client.search({ from: supplierEmail, since });
        const matchingUids = Array.isArray(uids) ? uids : [];

        for (const uid of matchingUids.slice(-30)) {
            const message = await client.fetchOne(uid, { source: true, envelope: true, internalDate: true });
            if (!hasFetchPayload(message)) continue;
            const source = message.source;
            if (!source) continue;

            const parsed = await simpleParser(source);
            const gmailMessageId = String(parsed.messageId || "").trim();
            if (!gmailMessageId || knownGmailIds.has(gmailMessageId)) continue;

            const references = [
                ...String(parsed.inReplyTo || "")
                    .split(/\s+/)
                    .map((value) => value.trim())
                    .filter(Boolean),
                ...String(parsed.references || "")
                    .split(/\s+/)
                    .map((value) => value.trim())
                    .filter(Boolean)
            ];
            const subject = String(parsed.subject || message.envelope?.subject || "").trim();
            const normalizedSubject = stripReplyPrefix(subject);
            const matchesThread = references.some((value) => outboundIds.has(value))
                || knownSubjects.has(normalizedSubject)
                || (order ? normalizedSubject.includes(stripReplyPrefix(order.ref)) : false);

            if (!matchesThread) continue;

            const bodyText = cleanEmailReplyText(String(parsed.text || parsed.html || "").trim());
            if (!bodyText) continue;

            const payload: SupplierMessagePayload = {
                channel: "SUPPLIER_EMAIL",
                threadId,
                orderId,
                orderRef: order?.ref || String(firstPayload?.orderRef || ""),
                supplier: order?.supplier || String(firstPayload?.supplier || supplierEmail),
                supplierEmail,
                subject: subject || (order ? buildSupplierDefaultSubject(order.ref, order.supplier) : String(firstPayload?.subject || "Conversation fournisseur")),
                bodyText,
                direction: "INBOUND",
                gmailMessageId,
                inReplyTo: String(parsed.inReplyTo || "").trim() || null,
                references,
                from: parsed.from?.text || supplierEmail,
                to: (parsed.to?.value || []).map((entry: { address?: string | null }) => entry.address || "").filter(Boolean),
                attachments: (await Promise.all(
                    (parsed.attachments || []).map((attachment: { filename?: string | null; content: Buffer | Uint8Array; contentType?: string | null; size?: number | null }) =>
                        storeIncomingAttachment({
                            filename: attachment.filename || "piece-jointe",
                            content: Buffer.from(attachment.content),
                            contentType: attachment.contentType,
                            size: attachment.size
                        })
                    )
                )).filter((attachment): attachment is NonNullable<typeof attachment> => Boolean(attachment)),
                externalDate: new Date(parsed.date || message.internalDate || new Date()).toISOString(),
                syncedAt: new Date().toISOString()
            };

            const saved = await storeSupplierMessage({
                order,
                userId: params.userId,
                action: "SUPPLIER_EMAIL_RECEIVED",
                payload
            });

            knownGmailIds.add(gmailMessageId);
            createdMessages.push({
                id: saved.id,
                action: saved.action,
                createdAt: saved.createdAt.toISOString(),
                senderName: saved.user?.name || payload.supplier,
                senderRole: saved.user?.role || "SUPPLIER",
                payload
            });
        }
    } finally {
        await client.logout().catch(() => undefined);
    }

    return createdMessages;
}

export function buildSupplierThreadId(orderId?: number | null) {
    return orderId ? getThreadIdFromOrder(orderId) : makeManualThreadId();
}

