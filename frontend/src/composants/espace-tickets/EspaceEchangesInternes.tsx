"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./EspaceEchangesInternes.module.css";
import { normalizeDocumentUrl } from "@/metier/workflow-client";
import { replaceReclamationByIntervention } from "@/metier/texte-intervention";

type InternalStatus = "OPEN" | "IN_PROGRESS" | "WAITING_REPLY" | "RESOLVED";
type InternalDestination =
    | "ADV"
    | "MAGASINIER"
    | "ADMIN"
    | "TECHNICIAN"
    | "RESPONSABLE_TECHNIQUE"
    | "RESPONSABLE_FACTURATION"
    | "RESPONSABLE_APPELS_OFFRE"
    | "IMPORT";
type ExchangeKind = "CREATE" | "MESSAGE" | "STATUS";

type InternalMessage = {
    id: number;
    kind: ExchangeKind;
    message: string;
    status: InternalStatus;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    createdAt: string;
    user?: {
        id: number;
        name: string;
        role: string;
    } | null;
};

type InternalParticipant = {
    id: number;
    name: string;
    role: string;
};

type InternalThread = {
    threadId: string;
    ticketId: number | null;
    marketId: number | null;
    destination: InternalDestination;
    subject: string;
    status: InternalStatus;
    createdAt: string;
    updatedAt: string;
    creator?: {
        id: number;
        name: string;
        role: string;
    } | null;
    ticket?: {
        id: number;
        displayId?: number | string | null;
        ticketReference?: string | null;
        title: string;
        status: string;
        priority: string;
        equipment?: {
            id?: number;
            name?: string | null;
            serialNumber?: string | null;
            blNumber?: string | null;
            type?: string | null;
        } | null;
    } | null;
    market?: {
        id: number;
        equipmentId?: number | null;
        marketNumber?: string | null;
        designation?: string | null;
    } | null;
    recipient?: InternalParticipant | null;
    messages: InternalMessage[];
};

type AOMarketOption = {
    id: number;
    equipmentId?: number | null;
    marketNumber: string;
    designation: string;
    serialNumber: string;
};

type WorkspaceProps = {
    title?: string;
    subtitle?: string;
    initialTicketId?: number | null;
    contextMode?: "DEFAULT" | "AO_MARKET" | "AO_FLEX";
};

function isAORole(role: string | null | undefined) {
    return String(role || "").trim().toUpperCase() === "RESPONSABLE_APPELS_OFFRE";
}

function isAdminRole(role: string | null | undefined) {
    return String(role || "").trim().toUpperCase() === "ADMIN";
}

function isTechnicianRole(role: string | null | undefined) {
    return String(role || "").trim().toUpperCase() === "TECHNICIAN";
}

function canUseMarketExchangeRole(role: string | null | undefined) {
    return isAORole(role) || isAdminRole(role) || isTechnicianRole(role);
}

function canUseMarketExchangePair(currentUserRole: string | null | undefined, recipientRole: string | null | undefined) {
    return canUseMarketExchangeRole(currentUserRole) && canUseMarketExchangeRole(recipientRole);
}

function getRoleLabel(role: string | null | undefined) {
    const normalized = String(role || "").trim().toUpperCase();
    if (normalized === "ADV") return "ADV";
    if (normalized === "MAGASINIER") return "Magasinier";
    if (normalized === "ADMIN") return "Admin";
    if (normalized === "TECHNICIAN") return "Technicien";
    if (normalized === "RESPONSABLE_TECHNIQUE") return "Responsable technique";
    if (normalized === "RESPONSABLE_FACTURATION") return "Responsable facturation";
    if (normalized === "RESPONSABLE_APPELS_OFFRE") return "Responsable appels d'offre";
    if (normalized === "IMPORT") return "Import";
    return role || "Destinataire";
}

function formatMessageTime(raw: string | null | undefined) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatMessageDateTime(raw: string | null | undefined) {
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function getConversationCounterpart(thread: InternalThread, currentUserId: number | null | undefined) {
    if (Number(thread.creator?.id || 0) === Number(currentUserId || 0)) {
        return thread.recipient || null;
    }
    return thread.creator || thread.recipient || null;
}

function getMessageSender(thread: InternalThread, message: InternalMessage | undefined) {
    const senderId = Number(message?.user?.id || 0);
    if (!senderId) return null;
    if (senderId === Number(thread.creator?.id || 0)) return thread.creator || null;
    if (senderId === Number(thread.recipient?.id || 0)) return thread.recipient || null;
    return message?.user || null;
}

function getMessageRecipient(thread: InternalThread, message: InternalMessage | undefined) {
    const senderId = Number(message?.user?.id || 0);
    if (!senderId) return null;
    if (senderId === Number(thread.creator?.id || 0)) return thread.recipient || null;
    if (senderId === Number(thread.recipient?.id || 0)) return thread.creator || null;
    return null;
}

function getCurrentUserParticipant(user: { id?: number; role?: string; name?: string } | null): InternalParticipant | null {
    if (!user?.id) return null;
    return {
        id: Number(user.id),
        name: String(user.name || "Acteur interne"),
        role: String(user.role || "")
    };
}

function isUserInThread(thread: InternalThread, currentUserId: number | null | undefined) {
    const userId = Number(currentUserId || 0);
    if (!userId) return false;
    if (Number(thread.creator?.id || 0) === userId) return true;
    if (Number(thread.recipient?.id || 0) === userId) return true;
    return thread.messages.some((message) => Number(message.user?.id || 0) === userId);
}

function canUserAccessThread(
    thread: InternalThread,
    currentUserId: number | null | undefined,
    currentUserRole: string | null | undefined,
    assignedTicketIds: Set<number>
) {
    const normalizedRole = String(currentUserRole || "").toUpperCase();
    if (normalizedRole && normalizedRole !== "CLIENT") return true;
    if (isUserInThread(thread, currentUserId)) return true;
    if (normalizedRole === "TECHNICIAN" && assignedTicketIds.has(Number(thread.ticketId || 0))) return true;
    return false;
}

function canUserInteractWithThread(thread: InternalThread | null, currentUserId: number | null | undefined, currentUserRole?: string | null) {
    if (!thread) return true;
    return isUserInThread(thread, currentUserId);
}

function isTicketClosedForMessaging(ticket: { status?: string | null; savHistory?: Array<{ action?: string | null }> | null } | null | undefined) {
    const status = String(ticket?.status || "").trim().toUpperCase();
    if (["CLOSED", "READY_FOR_DELIVERY", "NON_REPARE"].includes(status)) return true;
    return Array.isArray(ticket?.savHistory)
        && ticket.savHistory.some((entry) => String(entry?.action || "").toUpperCase() === "ADMIN_CLOSURE_COMPLETED");
}

function buildConversationSubject(ticketTitle: string | null | undefined, recipientName: string | null | undefined, marketNumber?: string | null) {
    const normalizedMarketNumber = String(marketNumber || "").trim();
    if (normalizedMarketNumber) {
        return `Marché #${normalizedMarketNumber} - ${String(recipientName || "destinataire interne").trim()}`;
    }
    const normalizedTitle = replaceReclamationByIntervention(ticketTitle || "Ticket principal").trim();
    const normalizedRecipient = String(recipientName || "destinataire interne").trim();
    return `${normalizedTitle} - ${normalizedRecipient}`;
}

function getTicketMarketNumber(ticket: any) {
    return String(ticket?.equipment?.blNumber || "").trim();
}

function getThreadMarketNumber(thread: InternalThread | null | undefined) {
    return String(thread?.market?.marketNumber || thread?.ticket?.equipment?.blNumber || "").trim();
}

function getTicketDisplayNumber(ticket: any, fallbackTicketId?: number | null) {
    return ticket?.ticketReference || ticket?.displayId || fallbackTicketId || ticket?.id || "-";
}

function getTicketDisplayLabel(ticket: any, contextMode: "DEFAULT" | "AO_MARKET" | "AO_FLEX") {
    if (contextMode === "AO_MARKET") {
        const marketNumber = getTicketMarketNumber(ticket);
        return marketNumber ? `#${marketNumber}` : `#${ticket?.id || "-"}`;
    }
    return `#${getTicketDisplayNumber(ticket)}`;
}

function getThreadDisplayLabel(thread: InternalThread | null | undefined, fallbackTicket: any, contextMode: "DEFAULT" | "AO_MARKET" | "AO_FLEX") {
    if (contextMode === "AO_MARKET") {
        const marketNumber = getThreadMarketNumber(thread) || getTicketMarketNumber(fallbackTicket);
        return marketNumber ? `#${marketNumber}` : `#${thread?.ticketId || fallbackTicket?.id || "-"}`;
    }
    return `#${getTicketDisplayNumber(thread?.ticket || fallbackTicket, thread?.ticketId || fallbackTicket?.id)}`;
}

function shouldUseMarketLabel(thread: InternalThread | null | undefined) {
    const marketNumber = getThreadMarketNumber(thread);
    if (!marketNumber) return false;

    const equipmentType = String(thread?.ticket?.equipment?.type || "").trim().toUpperCase();
    return Boolean(thread?.marketId) || equipmentType === "APPEL_OFFRE" || isAORole(thread?.creator?.role) || isAORole(thread?.recipient?.role);
}

function getVisibleMessageText(entry: InternalMessage | undefined) {
    const text = String(entry?.message || "").trim();
    if (text) return text;
    if (entry?.attachmentName) return `Pièce jointe: ${entry.attachmentName}`;
    if (entry?.attachmentUrl) return "Pièce jointe envoyée";
    return "Aucun message";
}

function isSameConversationTarget(
    thread: InternalThread | null,
    currentUserId: number | null | undefined,
    ticketId: string,
    recipientUserId: string
) {
    if (!thread) return false;
    const counterpart = getConversationCounterpart(thread, currentUserId);
    return Number(thread.ticketId || 0) === Number(ticketId || 0) && Number(counterpart?.id || 0) === Number(recipientUserId || 0);
}

function getConversationKey(thread: InternalThread, currentUserId: number | null | undefined) {
    const ticketId = Number(thread.ticketId || 0);
    if (ticketId > 0) return `ticket:${ticketId}`;

    const counterpart = getConversationCounterpart(thread, currentUserId);
    return `thread:${thread.threadId}:${Number(counterpart?.id || 0)}`;
}

function getConversationKeyWithContext(thread: InternalThread, currentUserId: number | null | undefined, contextMode: "DEFAULT" | "AO_MARKET") {
    if (contextMode === "AO_MARKET") {
        const counterpart = getConversationCounterpart(thread, currentUserId);
        const marketNumber = getThreadMarketNumber(thread);
        if (marketNumber) return `market:${marketNumber}:${Number(counterpart?.id || 0)}`;
    }
    return getConversationKey(thread, currentUserId);
}

async function uploadAttachment(file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Téléversement de pièce jointe impossible.");
    }

    return {
        url: String(data.url || ""),
        name: String(data.name || file.name)
    };
}

export default function InternalTicketingWorkspace({
    title = "Messagerie interne privée",
    subtitle = "",
    initialTicketId = null,
    contextMode = "DEFAULT"
}: WorkspaceProps) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [feedback, setFeedback] = useState("");

    const [user, setUser] = useState<{ id?: number; role?: string; name?: string } | null>(null);
    const [tickets, setTickets] = useState<any[]>([]);
    const [aoMarkets, setAoMarkets] = useState<AOMarketOption[]>([]);
    const [participants, setParticipants] = useState<InternalParticipant[]>([]);
    const [threads, setThreads] = useState<InternalThread[]>([]);
    const [selectedThreadDetail, setSelectedThreadDetail] = useState<InternalThread | null>(null);

    const [composeTicketId, setComposeTicketId] = useState<string>(initialTicketId ? String(initialTicketId) : "");
    const [composeMarketEquipmentId, setComposeMarketEquipmentId] = useState<string>("");
    const [composeRecipientUserId, setComposeRecipientUserId] = useState<string>("");
    const [aoConversationMode, setAoConversationMode] = useState<"MARKET" | "TICKET">("MARKET");
    const [composeMessage, setComposeMessage] = useState("");
    const [composeAttachmentFile, setComposeAttachmentFile] = useState<File | null>(null);
    const conversationRef = useRef<HTMLDivElement | null>(null);

    const isAOFlexibleWorkspace = useMemo(
        () => contextMode === "AO_FLEX" && canUseMarketExchangeRole(user?.role),
        [contextMode, user?.role]
    );

    const isMarketMessagingMode = useMemo(
        () => contextMode === "AO_MARKET"
            || (isAOFlexibleWorkspace && aoConversationMode === "MARKET"),
        [aoConversationMode, contextMode, isAOFlexibleWorkspace]
    );

    const availableRecipients = useMemo(
        () => participants
            .filter((participant) => Number(participant.id) !== Number(user?.id || 0))
            .filter((participant) => !isMarketMessagingMode || canUseMarketExchangePair(user?.role, participant.role)),
        [isMarketMessagingMode, participants, user?.id, user?.role]
    );

    const selectedRecipient = useMemo(
        () => availableRecipients.find((participant) => String(participant.id) === composeRecipientUserId) || null,
        [availableRecipients, composeRecipientUserId]
    );

    const isAORestrictedWorkspace = useMemo(
        () => contextMode === "AO_MARKET" && canUseMarketExchangeRole(user?.role),
        [contextMode, user?.role]
    );

    const isAOWorkspace = contextMode === "AO_MARKET" || contextMode === "AO_FLEX";
    const activeAoMarketNumbers = useMemo(
        () => new Set(aoMarkets.map((market) => String(market.marketNumber || "").trim()).filter(Boolean)),
        [aoMarkets]
    );
    const availableTickets = useMemo(() => {
        const list = (Array.isArray(tickets) ? tickets : []).filter((ticket) => {
            if (!isMarketMessagingMode && isTicketClosedForMessaging(ticket)) return false;
            if (!isAOWorkspace) return true;
            if (String(ticket?.equipment?.type || "").toUpperCase() !== "APPEL_OFFRE") return true;
            const marketNumber = getTicketMarketNumber(ticket);
            return Boolean(marketNumber) && activeAoMarketNumbers.has(marketNumber);
        });

        if (isMarketMessagingMode) {
            return list.filter((ticket) => !canUseMarketExchangePair(user?.role, selectedRecipient?.role)
                || (String(ticket?.equipment?.type || "").toUpperCase() === "APPEL_OFFRE" && getTicketMarketNumber(ticket)));
        }

        return list;

    }, [activeAoMarketNumbers, isAOWorkspace, isMarketMessagingMode, selectedRecipient?.role, tickets, user?.role]);

    const availableMarkets = useMemo(() => {
        if (!isMarketMessagingMode) return [];

        const source = aoMarkets.length > 0
            ? aoMarkets
            : availableTickets
                .map((ticket) => ({
                    id: Number(ticket?.equipment?.id || 0),
                    marketNumber: String(ticket?.equipment?.blNumber || "").trim(),
                    designation: String(ticket?.equipment?.name || "").trim(),
                    serialNumber: String(ticket?.equipment?.serialNumber || "").trim()
                }))
                .filter((item) => item.id > 0 && item.marketNumber);

        const byMarket = new Map<string, AOMarketOption>();
        source.forEach((market) => {
            const marketNumber = String(market.marketNumber || "").trim();
            if (!marketNumber || byMarket.has(marketNumber)) return;
            byMarket.set(marketNumber, market);
        });

        return Array.from(byMarket.values());
    }, [aoMarkets, availableTickets, contextMode, isMarketMessagingMode]);

    const selectedMarketNumber = useMemo(() => {
        if (!isMarketMessagingMode) return "";
        const selectedMarket = availableMarkets.find((market) => Number(market.id) === Number(composeMarketEquipmentId));
        if (selectedMarket) return String(selectedMarket.marketNumber || "").trim();
        const selectedTicket = tickets.find((ticket) => Number(ticket.id) === Number(composeTicketId));
        return getTicketMarketNumber(selectedTicket);
    }, [availableMarkets, composeMarketEquipmentId, composeTicketId, isMarketMessagingMode, tickets]);

    const assignedTicketIds = useMemo(() => new Set(tickets.map((ticket) => Number(ticket.id || 0)).filter(Boolean)), [tickets]);

    const loadThreadDetail = async (threadId: string) => {
        if (!user?.id || !user?.role || !threadId) return null;

        try {
            const response = await fetch(`/api/messagerie?threadId=${encodeURIComponent(threadId)}&userId=${user.id}&role=${user.role}`);
            const data = await response.json();
            const detail = data && typeof data === "object" ? data as InternalThread : null;
            setSelectedThreadDetail(detail);
            return detail;
        } catch (error) {
            console.error("Internal ticketing detail error:", error);
            setSelectedThreadDetail(null);
            return null;
        }
    };

    const loadData = async (preferredThreadId?: string) => {
        if (!user?.id || !user?.role) return;
        setLoading(true);
        try {
            const ticketEndpoint =
                user.role === "TECHNICIAN" ? `/api/tickets?light=1&assignedToId=${user.id}` : "/api/tickets?light=1";

            const [ticketsRes, threadsRes, participantsRes] = await Promise.all([
                isAORestrictedWorkspace ? Promise.resolve(null) : fetch(ticketEndpoint),
                fetch(`/api/messagerie?summary=1&userId=${user.id}&role=${user.role}`),
                fetch(`/api/messagerie?mode=users&userId=${user.id}`)
            ]);

            const ticketsData = ticketsRes ? await ticketsRes.json() : [];
            const threadsData = await threadsRes.json();
            const participantsData = await participantsRes.json();

            const ticketList = Array.isArray(ticketsData) ? ticketsData : [];
            const threadList = Array.isArray(threadsData) ? threadsData : [];
            const participantList = Array.isArray(participantsData) ? participantsData : [];

            const normalizedTicketList = isAORestrictedWorkspace
                ? []
                : ticketList.filter((ticket) => !isTicketClosedForMessaging(ticket));
            const openTicketIds = new Set(normalizedTicketList.map((ticket) => Number(ticket.id || 0)).filter(Boolean));
            const normalizedThreadList = threadList.filter((thread) => {
                if (isTicketClosedForMessaging(thread.ticket)) return false;
                if (!thread.ticketId) return true;
                return openTicketIds.has(Number(thread.ticketId));
            });

            const aoMarketList = (contextMode === "AO_MARKET" || (contextMode === "AO_FLEX" && canUseMarketExchangeRole(user.role)))
                ? await fetch("/api/appels-offre/marches", { cache: "no-store" })
                    .then((response) => response.json().catch(() => []))
                    .then((data) => (Array.isArray(data) ? data : []))
                    .then((data) => data
                        .map((item) => ({
                            id: Number(item?.id || 0),
                            equipmentId: Number(item?.equipmentId || 0) || null,
                            marketNumber: String(item?.marketNumber || item?.blNumber || "").trim(),
                            designation: String(item?.name || item?.designation || "").trim(),
                            serialNumber: String(item?.serialNumber || "").trim()
                        }))
                        .filter((item) => item.id > 0 && item.marketNumber))
                : [];

            setTickets(normalizedTicketList);
            setAoMarkets(aoMarketList);
            setThreads(normalizedThreadList);
            setParticipants(participantList);

            if (normalizedTicketList.length > 0 && !composeTicketId) {
                const defaultTicketId = initialTicketId && normalizedTicketList.some((ticket) => Number(ticket.id) === Number(initialTicketId))
                    ? String(initialTicketId)
                    : String(normalizedTicketList[0].id);
                setComposeTicketId(defaultTicketId);
            }
            if ((contextMode === "AO_MARKET" || isMarketMessagingMode) && availableMarkets.length === 0 && aoMarketList.length > 0 && !composeMarketEquipmentId) {
                setComposeMarketEquipmentId(String(aoMarketList[0].id));
            }
            if (participantList.length > 0 && !composeRecipientUserId) {
                setComposeRecipientUserId(String(participantList[0].id));
            }

            if (preferredThreadId) {
                const preferredThread = normalizedThreadList.find((thread) => thread.threadId === preferredThreadId);
                const counterpart = preferredThread ? getConversationCounterpart(preferredThread, user.id) : null;
                if (preferredThread?.ticketId) setComposeTicketId(String(preferredThread.ticketId));
                if (preferredThread?.marketId) setComposeMarketEquipmentId(String(preferredThread.marketId));
                else if (preferredThread?.ticket?.equipment?.id) setComposeMarketEquipmentId(String(preferredThread.ticket.equipment.id));
                if (counterpart?.id) setComposeRecipientUserId(String(counterpart.id));
                if (preferredThread?.threadId) {
                    await loadThreadDetail(preferredThread.threadId);
                }
                return;
            }

            const matchingThread = normalizedThreadList
                .filter((thread) => canUserAccessThread(thread, user.id, user.role, assignedTicketIds))
                .find((thread) => {
                    const counterpart = getConversationCounterpart(thread, user.id);
                    if (isMarketMessagingMode) {
                        return Boolean(selectedMarketNumber)
                            && getThreadMarketNumber(thread) === selectedMarketNumber
                            && Number(counterpart?.id || 0) === Number(composeRecipientUserId || 0);
                    }
                    return Number(thread.ticketId || 0) === Number(composeTicketId || 0)
                        && Number(counterpart?.id || 0) === Number(composeRecipientUserId || 0);
                });

            if (matchingThread?.threadId) {
                await loadThreadDetail(matchingThread.threadId);
            } else {
                setSelectedThreadDetail(null);
            }
        } catch (error) {
            console.error("Internal ticketing load error:", error);
            setTickets([]);
            setParticipants([]);
            setThreads([]);
            setSelectedThreadDetail(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const raw = localStorage.getItem("user");
        const parsed = raw ? JSON.parse(raw) : {};
        setUser(parsed);
    }, []);

    useEffect(() => {
        if (contextMode === "AO_FLEX" && canUseMarketExchangeRole(user?.role)) {
            setAoConversationMode("MARKET");
            return;
        }
        setAoConversationMode("TICKET");
    }, [contextMode, user?.role]);

    useEffect(() => {
        if (!user?.id || !user?.role) return;
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id, user?.role]);

    useEffect(() => {
        if (isMarketMessagingMode && availableMarkets.length > 0 && !composeMarketEquipmentId) {
            setComposeMarketEquipmentId(String(availableMarkets[0].id));
        }
    }, [availableMarkets, composeMarketEquipmentId, isMarketMessagingMode]);

    const selectedThread = useMemo(() => {
        if ((!isMarketMessagingMode && !composeTicketId) || !composeRecipientUserId || (isMarketMessagingMode && !selectedMarketNumber)) return null;
        const matches = threads
            .filter((thread) => {
                if (!canUserAccessThread(thread, user?.id, user?.role, assignedTicketIds)) return false;
                if (isTicketClosedForMessaging(thread.ticket)) return false;
                if (!isMarketMessagingMode && thread.ticketId && !availableTickets.some((ticket) => Number(ticket.id) === Number(thread.ticketId))) return false;
                const threadMarketNumber = getThreadMarketNumber(thread);
                const threadEquipmentType = String(thread.ticket?.equipment?.type || "").toUpperCase();
                if (isAOWorkspace && threadEquipmentType === "APPEL_OFFRE" && (!threadMarketNumber || !activeAoMarketNumbers.has(threadMarketNumber))) {
                    return false;
                }
                const counterpart = getConversationCounterpart(thread, user?.id);
                if (isMarketMessagingMode) {
                    return Boolean(selectedMarketNumber)
                        && threadMarketNumber === selectedMarketNumber
                        && Number(counterpart?.id || 0) === Number(composeRecipientUserId);
                }
                return Number(thread.ticketId || 0) === Number(composeTicketId) && Number(counterpart?.id || 0) === Number(composeRecipientUserId);
            })
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return matches[0] || null;
    }, [activeAoMarketNumbers, assignedTicketIds, availableTickets, composeRecipientUserId, composeTicketId, isAOWorkspace, isMarketMessagingMode, selectedMarketNumber, threads, user?.id, user?.role]);

    const visibleThreads = useMemo(() => {
        const latestByConversation = new Map<string, InternalThread>();

        threads
            .filter((thread) => {
                if (!canUserAccessThread(thread, user?.id, user?.role, assignedTicketIds)) return false;
                if (isTicketClosedForMessaging(thread.ticket)) return false;
                if (!isMarketMessagingMode && thread.ticketId && !availableTickets.some((ticket) => Number(ticket.id) === Number(thread.ticketId))) return false;
                const threadMarketNumber = getThreadMarketNumber(thread);
                const threadEquipmentType = String(thread.ticket?.equipment?.type || "").toUpperCase();
                if (isAOWorkspace && threadEquipmentType === "APPEL_OFFRE" && (!threadMarketNumber || !activeAoMarketNumbers.has(threadMarketNumber))) {
                    return false;
                }
                if (!isMarketMessagingMode) return true;
                return Boolean(threadMarketNumber) && activeAoMarketNumbers.has(threadMarketNumber);
            })
            .forEach((thread) => {
                const effectiveContextMode = isMarketMessagingMode ? "AO_MARKET" : "DEFAULT";
                const key = getConversationKeyWithContext(thread, user?.id, effectiveContextMode);
                const current = latestByConversation.get(key);
                if (!current || new Date(thread.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
                    latestByConversation.set(key, thread);
                }
            });

        return Array.from(latestByConversation.values())
            .map((thread) => {
                const counterpart = getConversationCounterpart(thread, user?.id);
                const currentUserParticipant = getCurrentUserParticipant(user);
                const orderedMessages = [...(thread.messages || [])].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
                const lastMessage = orderedMessages[orderedMessages.length - 1];
                const sender = getMessageSender(thread, lastMessage);
                const recipient = getMessageRecipient(thread, lastMessage)
                    || (Number(lastMessage?.user?.id || 0) === Number(user?.id || 0) ? counterpart : currentUserParticipant);
                const unread = Boolean(lastMessage) && Number(lastMessage.user?.id || 0) !== Number(user?.id || 0);
                return {
                    thread,
                    counterpart,
                    lastMessage,
                    sender,
                    recipient,
                    unread
                };
            })
            .sort((a, b) => new Date(b.thread.updatedAt).getTime() - new Date(a.thread.updatedAt).getTime());
            }, [activeAoMarketNumbers, assignedTicketIds, availableTickets, isAOWorkspace, isMarketMessagingMode, threads, user?.id, user?.role]);

    const selectedMessages = useMemo(
        () =>
            (selectedThreadDetail?.messages || []).filter(
                (entry) => entry.kind === "MESSAGE" || Boolean(entry.attachmentUrl) || Boolean(entry.message.trim())
            ),
        [selectedThreadDetail]
    );

    const canInteractWithSelectedThread = useMemo(
        () => canUserInteractWithThread(selectedThreadDetail || selectedThread || null, user?.id, user?.role),
        [selectedThread, selectedThreadDetail, user?.id, user?.role]
    );
    const selectedThreadClosedForMessaging = useMemo(
        () => !isMarketMessagingMode && isTicketClosedForMessaging((selectedThreadDetail || selectedThread)?.ticket),
        [isMarketMessagingMode, selectedThread, selectedThreadDetail]
    );
    const composeTicketClosedForMessaging = useMemo(
        () => !isMarketMessagingMode && isTicketClosedForMessaging(tickets.find((ticket) => Number(ticket.id) === Number(composeTicketId))),
        [composeTicketId, isMarketMessagingMode, tickets]
    );
    const messagingLocked = selectedThreadClosedForMessaging || composeTicketClosedForMessaging;

    useEffect(() => {
        if (availableRecipients.length > 0 && !composeRecipientUserId) {
            setComposeRecipientUserId(String(availableRecipients[0].id));
        }
    }, [availableRecipients, composeRecipientUserId]);

    useEffect(() => {
        if (availableRecipients.length === 0) return;
        if (!availableRecipients.some((participant) => String(participant.id) === composeRecipientUserId)) {
            setComposeRecipientUserId(String(availableRecipients[0].id));
        }
    }, [availableRecipients, composeRecipientUserId]);

    useEffect(() => {
        if (isMarketMessagingMode || availableTickets.length === 0) return;
        if (!composeTicketId) {
            setComposeTicketId(String(availableTickets[0].id));
            return;
        }
        if (!availableTickets.some((ticket) => String(ticket.id) === composeTicketId)) {
            setComposeTicketId(String(availableTickets[0].id));
        }
    }, [availableTickets, composeTicketId, isMarketMessagingMode]);

    useEffect(() => {
        if (!conversationRef.current) return;
        conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }, [selectedMessages, selectedThread?.threadId]);

    useEffect(() => {
        if (!selectedThread?.threadId) {
            setSelectedThreadDetail(null);
            return;
        }

        void loadThreadDetail(selectedThread.threadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedThread?.threadId]);

    const sendExchange = async () => {
        if (!user?.id) return;

        const hasTarget = isMarketMessagingMode ? Boolean(composeMarketEquipmentId) : Boolean(composeTicketId);

        if (!hasTarget || (!composeMessage.trim() && !composeAttachmentFile)) {
            setFeedback(`${isMarketMessagingMode ? "Numéro de marché" : "Ticket principal"} et message ou fichier obligatoires.`);
            return;
        }

        if (!selectedRecipient || Number(selectedRecipient.id) === Number(user.id)) {
            setFeedback("Le destinataire doit être différent de l'expéditeur.");
            return;
        }

        const canReplyToSelected = isMarketMessagingMode
            ? Boolean(selectedThread && getThreadMarketNumber(selectedThread) === selectedMarketNumber && Number(getConversationCounterpart(selectedThread, user.id)?.id || 0) === Number(selectedRecipient.id))
            : isSameConversationTarget(selectedThread, user.id, composeTicketId, String(selectedRecipient.id));
        const existingThreadForTicket = threads.find(
            (thread) =>
                (isMarketMessagingMode ? getThreadMarketNumber(thread) === selectedMarketNumber : Number(thread.ticketId) === Number(composeTicketId)) &&
                ((Number(thread.creator?.id || 0) === Number(user.id) && Number(thread.recipient?.id || 0) === Number(selectedRecipient.id)) ||
                    (Number(thread.creator?.id || 0) === Number(selectedRecipient.id) && Number(thread.recipient?.id || 0) === Number(user.id)))
        ) || null;
        const targetThread = canReplyToSelected ? selectedThread : existingThreadForTicket;
        const isReply = Boolean(targetThread);
        const selectedTicket = tickets.find((ticket) => Number(ticket.id) === Number(targetThread?.ticketId || composeTicketId));
        const selectedMarket = aoMarkets.find((market) => Number(market.id) === Number(composeMarketEquipmentId));
        if (!isMarketMessagingMode && isTicketClosedForMessaging(targetThread?.ticket || selectedTicket)) {
            setFeedback("La messagerie est fermée pour ce ticket terminé ou clôturé.");
            return;
        }
        const subject = isReply
            ? targetThread?.subject || buildConversationSubject(selectedTicket?.title, selectedRecipient?.name, getTicketMarketNumber(selectedTicket))
            : buildConversationSubject(selectedTicket?.title || selectedMarket?.designation, selectedRecipient?.name, selectedMarketNumber || getTicketMarketNumber(selectedTicket));

        setSubmitting(true);
        setFeedback("");
        try {
            const body: any = {
                senderId: user.id,
                recipientUserId: Number(selectedRecipient.id),
                status: isReply ? targetThread!.status : "OPEN",
                subject,
                message: composeMessage.trim(),
                attachmentUrl: null,
                attachmentName: null,
                kind: !isReply ? "CREATE" : "MESSAGE"
            };

            if (isReply) {
                if (Number(targetThread!.marketId || 0) > 0) {
                    body.marketId = Number(targetThread!.marketId);
                } else {
                    body.ticketId = Number(targetThread!.ticketId);
                }
            } else if (isMarketMessagingMode) {
                body.marketId = Number(composeMarketEquipmentId);
            } else {
                body.ticketId = Number(composeTicketId);
            }

            if (composeAttachmentFile) {
                const uploaded = await uploadAttachment(composeAttachmentFile);
                body.attachmentUrl = uploaded.url;
                body.attachmentName = uploaded.name;
            }

            if (isReply) {
                body.threadId = targetThread!.threadId;
            }

            const res = await fetch("/api/messagerie", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Échange interne impossible.");
            }

            setComposeMessage("");
            setComposeAttachmentFile(null);

            setFeedback(
                !isReply
                    ? "Conversation privée créée et message envoyé."
                    : "Réponse envoyée."
            );
            await loadData(data.threadId || targetThread?.threadId);
        } catch (error: any) {
            setFeedback(error?.message || "Erreur d'envoi.");
        } finally {
            setSubmitting(false);
        }
    };

    const isOwnMessage = (entry: InternalMessage) => Number(entry.user?.id) === Number(user?.id);

    return (
        <div className={styles.shell} aria-label={title}>
            <section className={styles.simplePanel}>
                {title || subtitle ? (
                    <div style={{ marginBottom: "0.9rem" }}>
                        {title ? <h2 className={styles.conversationTitle} style={{ marginBottom: "0.3rem" }}>{title}</h2> : null}
                        {subtitle ? <p className={styles.empty} style={{ textAlign: "left" }}>{subtitle}</p> : null}
                    </div>
                ) : null}
                {isAOFlexibleWorkspace ? (
                    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "0.9rem" }}>
                        <button
                            type="button"
                            className={aoConversationMode === "MARKET" ? "btn btn-primary" : "btn btn-outline"}
                            onClick={() => setAoConversationMode("MARKET")}
                        >
                            Échange par marché
                        </button>
                        <button
                            type="button"
                            className={aoConversationMode === "TICKET" ? "btn btn-primary" : "btn btn-outline"}
                            onClick={() => setAoConversationMode("TICKET")}
                        >
                            Échange par ticket
                        </button>
                    </div>
                ) : null}
                <div className={styles.formGrid}>
                    <label className={styles.field}>
                        <span>{isMarketMessagingMode ? "Numéro de marché *" : "Numéro du ticket *"}</span>
                        {isMarketMessagingMode ? (
                            <select className={styles.select} value={composeMarketEquipmentId} onChange={(e) => setComposeMarketEquipmentId(e.target.value)}>
                                {availableMarkets.map((market) => (
                                    <option key={market.id} value={String(market.id)}>
                                        #{market.marketNumber}
                                    </option>
                                ))}
                                {availableMarkets.length === 0 && <option value="">Aucun marché disponible</option>}
                            </select>
                        ) : (
                            <select className={styles.select} value={composeTicketId} onChange={(e) => setComposeTicketId(e.target.value)}>
                                {availableTickets.map((ticket) => (
                                    <option key={ticket.id} value={String(ticket.id)}>
                                        {getTicketDisplayLabel(ticket, contextMode)}
                                    </option>
                                ))}
                                {availableTickets.length === 0 && <option value="">Aucun ticket disponible</option>}
                            </select>
                        )}
                    </label>

                    <label className={styles.field}>
                        <span>Destinataire *</span>
                        <select className={styles.select} value={composeRecipientUserId} onChange={(e) => setComposeRecipientUserId(e.target.value)}>
                            {availableRecipients.map((participant) => (
                                <option key={participant.id} value={String(participant.id)}>
                                    {participant.name} - {getRoleLabel(participant.role)}
                                </option>
                            ))}
                            {availableRecipients.length === 0 ? <option value="">Aucun destinataire disponible</option> : null}
                        </select>
                    </label>
                </div>

                <div className={styles.threadPanel}>
                    <div>
                        <div className={styles.conversationTitle}>Conversations actives</div>
                        <div className={styles.threadList}>
                            {loading ? (
                                <div className={styles.empty}>Chargement...</div>
                            ) : visibleThreads.length === 0 ? (
                                <div className={styles.empty}>Aucune conversation active.</div>
                            ) : (
                                visibleThreads.map(({ thread, counterpart, lastMessage, sender, recipient, unread }) => (
                                    <button
                                        key={thread.threadId}
                                        type="button"
                                        className={`${styles.threadItem} ${selectedThread?.threadId === thread.threadId ? styles.threadItemActive : ""}`}
                                        onClick={() => {
                                            if (thread.ticketId) setComposeTicketId(String(thread.ticketId));
                                            if (thread.marketId) setComposeMarketEquipmentId(String(thread.marketId));
                                            else if (thread.ticket?.equipment?.id) setComposeMarketEquipmentId(String(thread.ticket.equipment.id));
                                            if (counterpart?.id) setComposeRecipientUserId(String(counterpart.id));
                                            if (isAOFlexibleWorkspace) {
                                                setAoConversationMode(shouldUseMarketLabel(thread) ? "MARKET" : "TICKET");
                                            }
                                        }}
                                    >
                                        <div className={styles.threadHeader}>
                                            <div>
                                                <div className={styles.threadTitle}>{getThreadDisplayLabel(thread, tickets.find((ticket) => Number(ticket.id) === Number(thread.ticketId)), shouldUseMarketLabel(thread) ? "AO_MARKET" : "DEFAULT")}</div>
                                                <div className={styles.threadMeta}>Expéditeur: {sender?.name || counterpart?.name || "Interlocuteur interne"}</div>
                                                <div className={styles.threadMeta}>Destinataire: {recipient?.name || "Interlocuteur interne"}</div>
                                            </div>
                                            <span className={`${styles.threadBadge} ${unread ? styles.threadBadgeUnread : styles.threadBadgeRead}`}>
                                                {unread ? "Nouveau" : "Suivie"}
                                            </span>
                                        </div>
                                        <div className={styles.threadPreview}>{getVisibleMessageText(lastMessage)}</div>
                                        <div className={styles.threadMeta}>Dernier échange le {formatMessageDateTime(lastMessage?.createdAt || thread.updatedAt)}</div>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    <div className={styles.threadWorkspace}>
                        <div className={styles.conversationTitle}>Conversation</div>
                        <div className={styles.messages} ref={conversationRef}>
                            {loading ? (
                                <div className={styles.empty}>Chargement...</div>
                            ) : selectedMessages.length === 0 ? (
                                <div className={styles.empty}>Aucun message pour {isMarketMessagingMode ? "ce marché" : "ce ticket"} et ce destinataire.</div>
                            ) : (
                                selectedMessages.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className={`${styles.messageStack} ${isOwnMessage(entry) ? styles.messageStackOutgoing : styles.messageStackIncoming}`}
                                    >
                                        <div className={`${styles.messageBubble} ${isOwnMessage(entry) ? styles.messageBubbleOutgoing : styles.messageBubbleIncoming}`}>
                                            <div className={styles.messageTime} style={{ marginBottom: "0.25rem", fontWeight: 700 }}>
                                                {entry.user?.name || getRoleLabel(entry.user?.role)}
                                            </div>
                                            <div className={styles.messageBody}>{entry.message || (entry.attachmentName ? "Pièce jointe envoyée." : "-")}</div>
                                            <div className={styles.messageTime}>{formatMessageTime(entry.createdAt)}</div>
                                            {entry.attachmentUrl ? (
                                                <a
                                                    className={styles.attachmentLink}
                                                    href={normalizeDocumentUrl(entry.attachmentUrl) || entry.attachmentUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    {entry.attachmentName || "Pièce jointe"}
                                                </a>
                                            ) : null}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <label className={styles.field}>
                            <span>{selectedThread ? "Répondre au message *" : "Nouveau message *"}</span>
                            <textarea
                                className={styles.textarea}
                                value={composeMessage}
                                onChange={(e) => setComposeMessage(e.target.value)}
                                placeholder="Écrire un message..."
                                disabled={messagingLocked || (selectedThread !== null && !canInteractWithSelectedThread)}
                            />
                        </label>

                        {messagingLocked ? (
                            <div className={styles.empty} style={{ textAlign: "left" }}>
                                La messagerie est fermée pour ce ticket terminé ou clôturé.
                            </div>
                        ) : null}

                        {selectedThread !== null && !canInteractWithSelectedThread ? (
                            <div className={styles.empty} style={{ textAlign: "left" }}>
                                Visualisation seule: seuls l'expéditeur et le destinataire peuvent répondre ou modifier cette conversation.
                            </div>
                        ) : null}

                        <div className={styles.composerActions}>
                            <label className={styles.attachmentField}>
                                <span>Fichier</span>
                                <input className={styles.fileInput} type="file" onChange={(e) => setComposeAttachmentFile(e.target.files?.[0] || null)} disabled={messagingLocked || (selectedThread !== null && !canInteractWithSelectedThread)} />
                            </label>

                            <button
                                className={styles.sendButton}
                                type="button"
                                onClick={sendExchange}
                                disabled={submitting || messagingLocked || !user?.id || (isMarketMessagingMode ? !composeMarketEquipmentId : !composeTicketId) || availableRecipients.length === 0 || (selectedThread !== null && !canInteractWithSelectedThread)}
                            >
                                {submitting ? "Envoi..." : selectedThread ? "Répondre" : "Envoyer"}
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {feedback ? (
                <div className={styles.feedback}>{feedback}</div>
            ) : null}
        </div>
    );
}



