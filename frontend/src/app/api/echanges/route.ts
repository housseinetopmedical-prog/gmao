import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

type InternalDestination =
    | "ADV"
    | "MAGASINIER"
    | "ADMIN"
    | "TECHNICIAN"
    | "RESPONSABLE_TECHNIQUE"
    | "RESPONSABLE_FACTURATION"
    | "RESPONSABLE_APPELS_OFFRE"
    | "IMPORT";
type PersistedInternalDestination = "ADV" | "MAGASINIER" | "ADMIN" | "TECHNICIAN";
type InternalStatus = "OPEN" | "IN_PROGRESS" | "WAITING_REPLY" | "RESOLVED";
type InternalKind = "CREATE" | "MESSAGE" | "STATUS";

type InternalPayload = {
    threadId: string;
    destination: InternalDestination;
    status: InternalStatus;
    subject: string;
    message: string;
    recipientUserId?: number | null;
    recipientUserName?: string | null;
    recipientUserRole?: string | null;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    kind: InternalKind;
};

type ThreadParticipant = {
    id: number;
    name: string;
    role: string;
};

type ThreadMessage = {
    id: number;
    kind: InternalKind;
    message: string;
    status: InternalStatus;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    createdAt: Date;
    user: {
        id: number;
        name: string;
        role: string;
    } | null;
};

type ThreadAggregate = {
    threadId: string;
    ticketId: number | null;
    marketId: number | null;
    destination: InternalDestination;
    subject: string;
    status: InternalStatus;
    createdAt: Date;
    updatedAt: Date;
    creator: {
        id: number;
        name: string;
        role: string;
    } | null;
    ticket: {
        id: number;
        displayId?: number | string | null;
        ticketReference?: string | null;
        title: string;
        status: string;
        priority: string;
        equipment?: {
            id: number;
            name: string | null;
            serialNumber: string | null;
            blNumber: string | null;
            type: string | null;
        } | null;
    } | null;
    market: {
        id: number;
        equipmentId: number | null;
        marketNumber: string;
        designation: string;
    } | null;
    recipient: ThreadParticipant | null;
    messages: ThreadMessage[];
};

type ThreadFetchOptions = {
    summaryOnly?: boolean;
    threadId?: string | null;
    ticketId?: number | null;
    userId?: number | null;
    role?: InternalDestination | null;
    assignedTicketIds?: number[];
};

const STATUS_VALUES: InternalStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_REPLY", "RESOLVED"];
const DEST_VALUES: InternalDestination[] = [
    "ADV",
    "MAGASINIER",
    "ADMIN",
    "TECHNICIAN",
    "RESPONSABLE_TECHNIQUE",
    "RESPONSABLE_FACTURATION",
    "RESPONSABLE_APPELS_OFFRE",
    "IMPORT"
];

const ADMIN_EQUIVALENT_DESTINATIONS: InternalDestination[] = [
    "ADMIN",
    "RESPONSABLE_TECHNIQUE",
    "RESPONSABLE_FACTURATION",
    "RESPONSABLE_APPELS_OFFRE",
    "IMPORT"
];
const KIND_VALUES: InternalKind[] = ["CREATE", "MESSAGE", "STATUS"];

function canRoleViewInternalThreads(role: InternalDestination | null) {
    return Boolean(role);
}

function isStatus(value: string): value is InternalStatus {
    return STATUS_VALUES.includes(value as InternalStatus);
}

function isDestination(value: string): value is InternalDestination {
    return DEST_VALUES.includes(value as InternalDestination);
}

function isKind(value: string): value is InternalKind {
    return KIND_VALUES.includes(value as InternalKind);
}

function normalizeRole(role: string | undefined | null): InternalDestination | null {
    if (!role) return null;
    if (role === "ADV") return "ADV";
    if (role === "MAGASINIER") return "MAGASINIER";
    if (role === "ADMIN") return "ADMIN";
    if (role === "RESPONSABLE_TECHNIQUE") return "RESPONSABLE_TECHNIQUE";
    if (role === "RESPONSABLE_FACTURATION") return "RESPONSABLE_FACTURATION";
    if (role === "RESPONSABLE_APPELS_OFFRE") return "RESPONSABLE_APPELS_OFFRE";
    if (role === "IMPORT") return "IMPORT";
    if (role === "TECHNICIAN") return "TECHNICIAN";
    return null;
}

function canMatchLegacyAdminDestination(role: InternalDestination | null) {
    return role ? ADMIN_EQUIVALENT_DESTINATIONS.includes(role) : false;
}

function toPersistedDestination(destination: InternalDestination): PersistedInternalDestination {
    if (destination === "ADV" || destination === "MAGASINIER" || destination === "TECHNICIAN") {
        return destination;
    }

    return "ADMIN";
}

function parsePayload(raw: string | null | undefined, fallbackId: number): InternalPayload | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;

        const destinationRaw = String(parsed.destination || "ADV").toUpperCase();
        const destination = isDestination(destinationRaw) ? destinationRaw : "ADV";

        const statusRaw = String(parsed.status || "OPEN").toUpperCase();
        const status = isStatus(statusRaw) ? statusRaw : "OPEN";

        const kindRaw = String(parsed.kind || "CREATE").toUpperCase();
        const kind = isKind(kindRaw) ? kindRaw : "CREATE";

        const threadId = String(parsed.threadId || `LEGACY-${fallbackId}`);
        const subject = String(parsed.subject || "Sans sujet");
        const message = String(parsed.message || "");
        const recipientUserId = Number(parsed.recipientUserId || 0) || null;
        const recipientUserName = parsed.recipientUserName ? String(parsed.recipientUserName) : null;
        const recipientUserRole = parsed.recipientUserRole ? String(parsed.recipientUserRole) : null;
        const attachmentUrl = parsed.attachmentUrl ? String(parsed.attachmentUrl) : null;
        const attachmentName = parsed.attachmentName ? String(parsed.attachmentName) : null;

        return {
            threadId,
            destination,
            status,
            subject,
            message,
            recipientUserId,
            recipientUserName,
            recipientUserRole,
            attachmentUrl,
            attachmentName,
            kind
        };
    } catch {
        return null;
    }
}

function generateThreadId(anchorId: number, anchorType: "TICKET" | "MARKET"): string {
    return `${anchorType === "MARKET" ? "INT-MARKET" : "INT"}-${anchorId}-${Date.now()}`;
}

function toAggregateFromModern(raw: any): ThreadAggregate {
    return {
        threadId: String(raw.threadId),
        ticketId: raw.ticketId ?? null,
        marketId: raw.marketId ?? null,
        destination: raw.destination as InternalDestination,
        subject: raw.sujet || "Sans sujet",
        status: raw.statut as InternalStatus,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        creator: raw.createur
            ? {
                  id: raw.createur.id,
                  name: raw.createur.name,
                  role: raw.createur.role
              }
            : null,
        ticket: raw.ticket
            ? {
                  id: raw.ticket.id,
                  title: raw.ticket.title,
                  status: raw.ticket.status,
                                    priority: raw.ticket.priority,
                                    equipment: raw.ticket.equipment
                                            ? {
                                                        id: raw.ticket.equipment.id,
                                                        name: raw.ticket.equipment.name ?? null,
                                                        serialNumber: raw.ticket.equipment.serialNumber ?? null,
                                                        blNumber: raw.ticket.equipment.blNumber ?? null,
                                                        type: raw.ticket.equipment.type ?? null
                                                }
                                            : null
              }
            : null,
        market: raw.market
            ? {
                  id: raw.market.id,
                  equipmentId: raw.market.equipmentId ?? null,
                  marketNumber: raw.market.marketNumber,
                  designation: raw.market.designation
              }
            : null,
        recipient: raw.recipient
            ? {
                  id: raw.recipient.id,
                  name: raw.recipient.name,
                  role: raw.recipient.role
              }
            : null,
        messages: Array.isArray(raw.messages)
            ? raw.messages.map((msg: any) => ({
                  id: msg.id,
                  kind: msg.type as InternalKind,
                  message: msg.message || "",
                  status: msg.statut as InternalStatus,
                  attachmentUrl: msg.pieceJointeUrl || null,
                  attachmentName: msg.pieceJointeNom || null,
                  createdAt: msg.createdAt,
                  user: msg.expediteur
                      ? {
                            id: msg.expediteur.id,
                            name: msg.expediteur.name,
                            role: msg.expediteur.role
                        }
                      : null
              }))
            : []
    };
}

async function fetchModernThreads(options: ThreadFetchOptions = {}) {
    const summaryOnly = options.summaryOnly === true;
    const where: any = {};
    const accessOr: any[] = [];

    if (options.threadId) {
        where.threadId = options.threadId;
    } else {
        if (options.ticketId) {
            where.ticketId = options.ticketId;
        }
        if (options.userId && !canRoleViewInternalThreads(options.role || null)) {
            accessOr.push({ createurId: options.userId });
            accessOr.push({ messages: { some: { expediteurId: options.userId } } });
        }
        if (!canRoleViewInternalThreads(options.role || null) && options.role === "TECHNICIAN" && Array.isArray(options.assignedTicketIds) && options.assignedTicketIds.length > 0) {
            accessOr.push({ ticketId: { in: options.assignedTicketIds } });
        }
        if (accessOr.length > 0) {
            where.OR = accessOr;
        }
    }

    const rows = await prisma.ticket_interne.findMany({
        where,
        include: {
            createur: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            },
            recipient: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            },
            ticket: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    equipment: {
                        select: {
                            id: true,
                            name: true,
                            serialNumber: true,
                            blNumber: true,
                            type: true
                        }
                    }
                }
            },
            market: {
                select: {
                    id: true,
                    equipmentId: true,
                    marketNumber: true,
                    designation: true
                }
            },
            messages: {
                include: {
                    expediteur: {
                        select: {
                            id: true,
                            name: true,
                            role: true
                        }
                    }
                },
                orderBy: {
                    createdAt: summaryOnly ? "desc" : "asc"
                },
                ...(summaryOnly ? { take: 1 } : {})
            }
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    return rows.map(toAggregateFromModern);
}

async function fetchLegacyThreads(options: ThreadFetchOptions = {}) {
    const where: any = {
        action: "INTERNAL_TICKET"
    };
    const filters: any[] = [];

    if (options.ticketId) {
        where.ticketId = options.ticketId;
    }

    if (options.threadId) {
        filters.push({ note: { contains: `"threadId":"${options.threadId}"` } });
    } else {
        if (options.userId && !canRoleViewInternalThreads(options.role || null)) {
            filters.push({ userId: options.userId });
            filters.push({ note: { contains: `"recipientUserId":${options.userId}` } });
        }
        if (options.role && !canRoleViewInternalThreads(options.role || null)) {
            filters.push({ note: { contains: `"destination":"${options.role}"` } });
            if (canMatchLegacyAdminDestination(options.role) && options.role !== "ADMIN") {
                filters.push({ note: { contains: '"destination":"ADMIN"' } });
            }
        }
        if (!canRoleViewInternalThreads(options.role || null) && options.role === "TECHNICIAN" && Array.isArray(options.assignedTicketIds) && options.assignedTicketIds.length > 0) {
            filters.push({ ticketId: { in: options.assignedTicketIds } });
        }
    }

    if (filters.length > 0) {
        where.OR = filters;
    }

    const rows = await prisma.sav_history.findMany({
        where,
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    role: true
                }
            },
            ticket: {
                select: {
                    id: true,
                    title: true,
                    status: true,
                    priority: true,
                    equipment: {
                        select: {
                            id: true,
                            name: true,
                            serialNumber: true,
                            blNumber: true,
                            type: true
                        }
                    }
                }
            }
        },
        orderBy: {
            createdAt: "asc"
        }
    });

    const threads = new Map<string, ThreadAggregate>();

    rows.forEach((row) => {
        const payload = parsePayload(row.note, row.id);
        if (!payload) return;

        if (!threads.has(payload.threadId)) {
            threads.set(payload.threadId, {
                threadId: payload.threadId,
                ticketId: row.ticketId ?? null,
                marketId: null,
                destination: payload.destination,
                subject: payload.subject,
                status: payload.status,
                createdAt: row.createdAt,
                updatedAt: row.createdAt,
                creator: row.user
                    ? {
                          id: row.user.id,
                          name: row.user.name,
                          role: row.user.role
                      }
                    : null,
                ticket: row.ticket
                    ? {
                          id: row.ticket.id,
                          title: row.ticket.title,
                          status: row.ticket.status,
                                                    priority: row.ticket.priority,
                                                    equipment: row.ticket.equipment
                                                            ? {
                                                                        id: row.ticket.equipment.id,
                                                                        name: row.ticket.equipment.name ?? null,
                                                                        serialNumber: row.ticket.equipment.serialNumber ?? null,
                                                                        blNumber: row.ticket.equipment.blNumber ?? null,
                                                                        type: row.ticket.equipment.type ?? null
                                                                }
                                                            : null
                      }
                    : null,
                market: null,
                recipient:
                    payload.recipientUserId && payload.recipientUserName && payload.recipientUserRole
                        ? {
                              id: payload.recipientUserId,
                              name: payload.recipientUserName,
                              role: payload.recipientUserRole
                          }
                        : null,
                messages: []
            });
        }

        const thread = threads.get(payload.threadId)!;
        if (row.createdAt > thread.updatedAt) {
            thread.updatedAt = row.createdAt;
        }
        thread.status = payload.status;
        thread.destination = payload.destination;

        if (payload.kind === "CREATE" && payload.subject) {
            thread.subject = payload.subject;
        }
        if (payload.recipientUserId && payload.recipientUserName && payload.recipientUserRole) {
            thread.recipient = {
                id: payload.recipientUserId,
                name: payload.recipientUserName,
                role: payload.recipientUserRole
            };
        }

        thread.messages.push({
            id: row.id,
            kind: payload.kind,
            message: payload.message,
            status: payload.status,
            attachmentUrl: payload.attachmentUrl || null,
            attachmentName: payload.attachmentName || null,
            createdAt: row.createdAt,
            user: row.user
                ? {
                      id: row.user.id,
                      name: row.user.name,
                      role: row.user.role
                  }
                : null
        });
    });

    return Array.from(threads.values())
        .map((thread) => {
            const sortedMessages = thread.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
            return {
                ...thread,
                messages: options.summaryOnly ? sortedMessages.slice(-1) : sortedMessages
            };
        })
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

function mergeThreads(modern: ThreadAggregate[], legacy: ThreadAggregate[]) {
    const merged = new Map<string, ThreadAggregate>();

    modern.forEach((thread) => {
        merged.set(thread.threadId, thread);
    });

    legacy.forEach((legacyThread) => {
        if (!merged.has(legacyThread.threadId)) {
            merged.set(legacyThread.threadId, legacyThread);
            return;
        }
        const existing = merged.get(legacyThread.threadId)!;
        if (!existing.recipient && legacyThread.recipient) {
            merged.set(legacyThread.threadId, {
                ...existing,
                recipient: legacyThread.recipient
            });
        }
        // Si un thread moderne existe deja, on n'ajoute pas les messages legacy
        // pour eviter les doublons visuels dans l'historique.
    });

    return Array.from(merged.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

async function attachTicketReferencesToThreads(threads: ThreadAggregate[]) {
    const ticketReferences = await getTicketAnnualReferenceMap(
        threads.map((thread) => Number(thread.ticket?.id || thread.ticketId || 0)).filter(Boolean)
    );

    return threads.map((thread) => ({
        ...thread,
        ticket: thread.ticket ? attachTicketAnnualReference(thread.ticket, ticketReferences) : thread.ticket
    }));
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
        const summaryOnly = searchParams.get("summary") === "1";
        const threadId = String(searchParams.get("threadId") || "").trim() || null;
        const ticketIdParam = searchParams.get("ticketId");
        const userIdParam = searchParams.get("userId");
        const roleParam = searchParams.get("role");

        const ticketId = ticketIdParam ? Number(ticketIdParam) : null;
        const userId = userIdParam ? Number(userIdParam) : null;
        const role = normalizeRole(roleParam);

        if (mode === "users") {
            const users = await prisma.user.findMany({
                where: {
                    role: {
                        in: [
                            "ADV",
                            "MAGASINIER",
                            "ADMIN",
                            "TECHNICIAN",
                            "RESPONSABLE_TECHNIQUE",
                            "RESPONSABLE_FACTURATION",
                            "RESPONSABLE_APPELS_OFFRE",
                            "IMPORT"
                        ]
                    }
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    password: true,
                    role: true
                },
                orderBy: {
                    name: "asc"
                }
            });

            return NextResponse.json(
                userId ? users.filter((entry) => entry.id !== userId) : users
            );
        }

        const assignedTicketIds = role === "TECHNICIAN" && userId
            ? new Set(
                  (
                      await prisma.ticket.findMany({
                          where: { assignedToId: userId },
                          select: { id: true }
                      })
                  ).map((ticket) => ticket.id)
              )
            : new Set<number>();
        const assignedTicketIdList = Array.from(assignedTicketIds);

        const [modernThreads, legacyThreads] = await Promise.all([
            fetchModernThreads({
                summaryOnly,
                threadId,
                ticketId,
                userId,
                role,
                assignedTicketIds: assignedTicketIdList
            }),
            fetchLegacyThreads({
                summaryOnly,
                threadId,
                ticketId,
                userId,
                role,
                assignedTicketIds: assignedTicketIdList
            })
        ]);
        const threads = await attachTicketReferencesToThreads(mergeThreads(modernThreads, legacyThreads));

        const filtered = threads.filter((thread) => {
            if (ticketId && thread.ticketId !== ticketId) return false;
            if (!userId) return true;
            if (canRoleViewInternalThreads(role)) return true;

            const isCreator = thread.creator?.id === userId;
            const isRecipient = thread.recipient?.id === userId;
            const involved = thread.messages.some((message) => message.user?.id === userId);
            if (isCreator || isRecipient || involved) return true;
            if (role === "TECHNICIAN" && assignedTicketIds.has(Number(thread.ticketId || 0))) return true;
            if (!thread.recipient?.id && role && thread.destination === role) return true;
            if (!thread.recipient?.id && role && canMatchLegacyAdminDestination(role) && thread.destination === "ADMIN") return true;
            return false;
        });

        if (threadId) {
            return NextResponse.json(filtered[0] || null);
        }

        return NextResponse.json(filtered);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Erreur serveur ticketing interne" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const senderId = Number(body.senderId);
        const requestedTicketId = Number(body.ticketId || 0) || null;
        const requestedMarketId = Number(body.marketId || 0) || null;
        const equipmentId = Number(body.equipmentId || 0) || null;
        const statusRaw = String(body.status || "OPEN").toUpperCase();
        const subject = String(body.subject || "").trim();
        const message = String(body.message || "").trim();
        const recipientUserId = Number(body.recipientUserId || 0) || null;
        const attachmentUrl = body.attachmentUrl ? String(body.attachmentUrl).trim() : null;
        const attachmentName = body.attachmentName ? String(body.attachmentName).trim() : null;
        const kindRaw = String(body.kind || "CREATE").toUpperCase();
        const providedThreadId = body.threadId ? String(body.threadId) : "";

        if (!senderId || (!requestedTicketId && !requestedMarketId && !equipmentId)) {
            return NextResponse.json({ error: "senderId et ticketId ou marketId sont requis" }, { status: 400 });
        }
        if (!message && !attachmentUrl) {
            return NextResponse.json({ error: "Message ou pièce jointe requis" }, { status: 400 });
        }
        if (!isStatus(statusRaw)) {
            return NextResponse.json({ error: "Statut invalide" }, { status: 400 });
        }
        if (!isKind(kindRaw)) {
            return NextResponse.json({ error: "Type d'action interne invalide" }, { status: 400 });
        }
        if (!recipientUserId) {
            return NextResponse.json({ error: "Destinataire utilisateur requis" }, { status: 400 });
        }

        if (kindRaw === "CREATE" && !subject) {
            return NextResponse.json({ error: "Sujet requis pour creer un ticket interne" }, { status: 400 });
        }
        if (kindRaw !== "CREATE" && !providedThreadId) {
            return NextResponse.json({ error: "threadId requis pour ajouter message ou changer statut" }, { status: 400 });
        }

        const [sender, recipient] = await Promise.all([
            prisma.user.findUnique({
                where: { id: senderId },
                select: { id: true, name: true, role: true }
            }),
            prisma.user.findUnique({
                where: { id: recipientUserId },
                select: { id: true, name: true, role: true }
            })
        ]);

        if (!sender) return NextResponse.json({ error: "Expediteur introuvable" }, { status: 404 });
        if (!recipient) return NextResponse.json({ error: "Destinataire introuvable" }, { status: 404 });
        if (sender.role === "CLIENT") {
            return NextResponse.json({ error: "Le client ne peut pas interagir avec le ticketing interne" }, { status: 403 });
        }
        if (recipient.role === "CLIENT") {
            return NextResponse.json({ error: "Le destinataire doit etre un acteur interne." }, { status: 400 });
        }

        const senderDestination = normalizeRole(sender.role);
        const recipientDestination = normalizeRole(recipient.role);
        if (!recipientDestination) {
            return NextResponse.json({ error: "Destinataire interne invalide" }, { status: 400 });
        }
        if (recipient.id === sender.id || (senderDestination && senderDestination === recipientDestination && sender.id === recipient.id)) {
            return NextResponse.json({ error: "Le destinataire doit etre different de l'acteur expediteur." }, { status: 400 });
        }

        const destinationRaw = recipientDestination;
        const persistedDestination = toPersistedDestination(destinationRaw);

        let ticket = requestedTicketId
            ? await prisma.ticket.findUnique({
                  where: { id: requestedTicketId },
                  select: {
                      id: true,
                      status: true,
                      equipmentId: true,
                      equipment: {
                          select: {
                              id: true,
                              name: true,
                              serialNumber: true,
                              blNumber: true,
                              type: true
                          }
                      }
                  }
              })
            : null;

        const market = !ticket && (requestedMarketId || equipmentId)
            ? await prisma.marche.findFirst({
                  where: requestedMarketId ? { id: requestedMarketId } : { equipmentId },
                  select: {
                      id: true,
                      equipmentId: true,
                      marketNumber: true,
                      designation: true
                  }
              })
            : null;

        if (!ticket && (requestedMarketId || equipmentId) && !market) {
            return NextResponse.json({ error: "Marché introuvable" }, { status: 404 });
        }

        if (!ticket && !market) return NextResponse.json({ error: "Ticket ou marché introuvable" }, { status: 404 });

        if (ticket && ["CLOSED", "READY_FOR_DELIVERY", "NON_REPARE"].includes(String((ticket as any).status || "").toUpperCase())) {
            return NextResponse.json({ error: "La messagerie est fermée pour ce ticket terminé ou clôturé." }, { status: 400 });
        }

        const anchorId = ticket?.id || market?.id || 0;
        const threadId = kindRaw === "CREATE" ? generateThreadId(anchorId, market ? "MARKET" : "TICKET") : providedThreadId;

        const legacyThreadDetails = providedThreadId
            ? await fetchLegacyThreads({ threadId: providedThreadId, summaryOnly: false })
            : [];

        const saved = await prisma.$transaction(async (tx) => {
            const existingThread = await tx.ticket_interne.findUnique({
                where: { threadId },
                include: {
                    messages: {
                        select: {
                            expediteurId: true
                        }
                    }
                }
            });

            let threadRecordId = Number(existingThread?.id || 0) || null;
            let threadSubject = subject || "Sans sujet";

            if (!existingThread) {
                if (kindRaw !== "CREATE") {
                    // Cas legacy: on recree un thread interne propre si l'ancien n'existe que dans sav_history.
                    const createdThread = await tx.ticket_interne.create({
                        data: {
                            threadId,
                            ticketId: ticket?.id || null,
                            marketId: market?.id || null,
                            destination: persistedDestination,
                            statut: statusRaw,
                            sujet: subject || "Sans sujet",
                            createurId: sender.id,
                            recipientId: recipient.id
                        }
                    });
                    threadRecordId = createdThread.id;
                    threadSubject = createdThread.sujet;
                } else {
                    const createdThread = await tx.ticket_interne.create({
                        data: {
                            threadId,
                            ticketId: ticket?.id || null,
                            marketId: market?.id || null,
                            destination: persistedDestination,
                            statut: statusRaw,
                            sujet: subject || "Sans sujet",
                            createurId: sender.id,
                            recipientId: recipient.id
                        }
                    });
                    threadRecordId = createdThread.id;
                    threadSubject = createdThread.sujet;
                }
            } else {
                const knownParticipantIds = new Set<number>([
                    Number(existingThread.createurId || 0),
                    Number((existingThread as any).recipientId || 0),
                    ...existingThread.messages.map((entry) => Number(entry.expediteurId || 0)),
                    Number(legacyThreadDetails[0]?.recipient?.id || 0)
                ].filter((value) => Number.isFinite(value) && value > 0));

                if (kindRaw !== "CREATE" && !knownParticipantIds.has(sender.id)) {
                    throw new Error("Visualisation seule: seuls l'expéditeur ou le destinataire peuvent répondre à cette conversation.");
                }

                threadSubject = kindRaw === "CREATE" ? subject || existingThread.sujet : existingThread.sujet;
                const updatedThread = await tx.ticket_interne.update({
                    where: { id: existingThread.id },
                    data: {
                        destination: persistedDestination,
                        statut: statusRaw,
                        sujet: threadSubject,
                        recipientId: (existingThread as any).recipientId || recipient.id
                    }
                });
                threadRecordId = updatedThread.id;
            }

            if (!threadRecordId) {
                throw new Error("Conversation interne introuvable.");
            }

            const createdMessage = await tx.message_ticket_interne.create({
                data: {
                    ticketInterneId: threadRecordId,
                    expediteurId: sender.id,
                    type: kindRaw,
                    message,
                    statut: statusRaw,
                    pieceJointeUrl: attachmentUrl,
                    pieceJointeNom: attachmentName
                }
            });

            const payload: InternalPayload = {
                threadId,
                destination: destinationRaw,
                status: statusRaw,
                subject: threadSubject,
                message,
                recipientUserId: recipient.id,
                recipientUserName: recipient.name,
                recipientUserRole: recipient.role,
                attachmentUrl,
                attachmentName,
                kind: kindRaw
            };

            if (ticket) {
                await tx.sav_history.create({
                    data: {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: sender.id,
                        action: "INTERNAL_TICKET",
                        note: JSON.stringify(payload)
                    }
                });
            }

            return {
                thread: {
                    id: threadRecordId,
                    sujet: threadSubject
                },
                message: createdMessage
            };
        });

        return NextResponse.json({
            id: saved.message.id,
            threadId,
            kind: kindRaw,
            destination: destinationRaw,
            status: statusRaw,
            subject: saved.thread.sujet,
            message,
            recipient,
            attachmentUrl,
            attachmentName,
            createdAt: saved.message.createdAt,
            sender
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Erreur creation ticket interne" }, { status: 500 });
    }
}


