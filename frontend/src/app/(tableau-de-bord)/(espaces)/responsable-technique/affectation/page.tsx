"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "@/app/(tableau-de-bord)/(espaces)/technicien/technicien.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getReclamationStatusLabel } from "@/metier/workflow-adv";
import { getSeverityBadgeStyle, getStatusLabel } from "@/metier/workflow-technicien";

type Technician = {
    id: number;
    name: string;
    activeTickets?: number;
};

type TicketRow = {
    id: number;
    status: string;
    customerName: string;
    checklist?: string | null;
    ticket?: {
        id: number;
        assignedToId?: number | null;
        displayId?: string | null;
        status?: string | null;
        priority?: string | null;
        savHistory?: Array<{
            action?: string | null;
            note?: string | null;
        }> | null;
        assignedTo?: {
            id: number;
            name: string;
        } | null;
    } | null;
};

const MANAGER_STATUSES = [
    "PENDING_TECHNICAL_MANAGER_REVIEW",
    "READY_FOR_TECH_MANAGER_ASSIGNMENT",
    "QUOTE_APPROVED"
];

const ACTIVE_TICKET_STATUSES = ["DIAGNOSTIC", "PENDING_PARTS", "REPAIR", "TAKEN_IN_CHARGE", "QUOTE_APPROVED"];
const URGENCY_LEVELS = ["1", "2", "3", "4", "5"] as const;

const SUBTLE_BADGE_STYLE = {
    background: "#e2e8f0",
    border: "1px solid #cbd5e1",
    color: "#334155"
} as const;

function getLocalUser() {
    try {
        const parsed = JSON.parse(localStorage.getItem("user") || "{}");
        return {
            id: Number(parsed?.id || 0) || null,
            name: String(parsed?.name || "").trim(),
            role: String(parsed?.role || "").trim()
        };
    } catch {
        return { id: null, name: "", role: "" };
    }
}

function resolveWarrantyStatus(rawStatus: unknown, rawLabel: unknown, rawNote: unknown) {
    const normalizedStatus = String(rawStatus || "").trim().toUpperCase();
    if (normalizedStatus === "UNDER_WARRANTY" || normalizedStatus === "OUT_OF_WARRANTY") return normalizedStatus;

    const mergedText = [rawLabel, rawNote]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

    if (mergedText.includes("hors garantie") || mergedText.includes("out of warranty")) return "OUT_OF_WARRANTY";
    if (mergedText.includes("sous garantie") || mergedText.includes("under warranty")) return "UNDER_WARRANTY";
    return "";
}

function getWarrantyStatusFromChecklist(checklist: string | null | undefined) {
    const metadata = parseChecklistPayload(checklist).metadata || {};
    const merchandiseInfo = (metadata as any).merchandiseInfo || {};
    const storeReview = (metadata as any).storeReview || {};
    return resolveWarrantyStatus(merchandiseInfo.warrantyStatus, merchandiseInfo.warrantyLabel, storeReview.note);
}

function formatTicketNumber(row: TicketRow) {
    return row.ticket?.displayId || row.ticket?.id || "-";
}

function priorityToUrgencyLevel(priority: string | null | undefined) {
    const normalized = String(priority || "").trim().toUpperCase();
    if (normalized === "LOW") return "1";
    if (normalized === "MEDIUM") return "2";
    if (normalized === "HIGH") return "3";
    if (normalized === "CRITICAL") return "5";
    return "2";
}

function urgencyLevelToPriority(level: string) {
    if (level === "1") return "LOW";
    if (level === "2") return "MEDIUM";
    if (level === "3") return "HIGH";
    if (level === "4") return "CRITICAL";
    if (level === "5") return "CRITICAL";
    return "CRITICAL";
}

function normalizeUrgencyLevel(level: unknown) {
    const value = String(level || "").trim();
    return URGENCY_LEVELS.includes(value as any) ? value : "2";
}

function getLockedUrgencyLevel(row: TicketRow) {
    const history = Array.isArray(row.ticket?.savHistory) ? row.ticket.savHistory : [];
    const entry = [...history].reverse().find((item) => String(item?.action || "") === "URGENCY_LEVEL_LOCKED");
    const match = String(entry?.note || "").match(/Niveau d'urgence\s*:\s*([1-5])/i);
    if (match?.[1]) return match[1];

    const priorityEntry = [...history].reverse().find((item) => ["Priority updated", "Priorité mise à jour"].includes(String(item?.action || "")));
    const priorityMatch = String(priorityEntry?.note || "").match(/->\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
    return priorityMatch?.[1] ? priorityToUrgencyLevel(priorityMatch[1]) : "";
}

export default function ResponsableTechniqueTicketsActifsPage() {
    const [loading, setLoading] = useState(true);
    const [savingRowId, setSavingRowId] = useState<number | null>(null);
    const [rows, setRows] = useState<TicketRow[]>([]);
    const [technicians, setTechnicians] = useState<Technician[]>([]);
    const [selectedTechnicians, setSelectedTechnicians] = useState<Record<number, string>>({});
    const [urgencyLevels, setUrgencyLevels] = useState<Record<number, string>>({});
    const [warrantyOverrides, setWarrantyOverrides] = useState<Record<number, string>>({});
    const [search, setSearch] = useState("");
    const [feedback, setFeedback] = useState("");

    const assignmentOptions = useMemo(() => {
        const user = getLocalUser();
        const list = [...technicians];
        if (user.id && user.role === "RESPONSABLE_TECHNIQUE" && !list.some((item) => item.id === user.id)) {
            list.unshift({ id: user.id, name: user.name || "Moi-même", activeTickets: 0 });
        }
        return list;
    }, [technicians]);

    const fetchData = async () => {
        setLoading(true);
        setFeedback("");
        try {
            const user = getLocalUser();
            const [reclamationRes, technicianRes, ticketRes] = await Promise.all([
                fetch("/api/reclamations?light=1&includeStoreReview=1&historyLimit=20", {
                    headers: {
                        "x-user-role": user.role,
                        "x-user-id": String(user.id || "")
                    },
                    cache: "no-store"
                }),
                fetch("/api/technicians", { cache: "no-store" }),
                fetch("/api/tickets", { cache: "no-store" })
            ]);

            const reclamationData = await reclamationRes.json().catch(() => []);
            const technicianData = await technicianRes.json().catch(() => []);
            const ticketData = await ticketRes.json().catch(() => []);

            const activeTicketRows: TicketRow[] = (Array.isArray(ticketData) ? ticketData : [])
                .filter((ticket: any) => ACTIVE_TICKET_STATUSES.includes(String(ticket.status || "").toUpperCase()))
                .map((ticket: any) => ({
                    id: Number(ticket.reclamation?.id || 0) || -Number(ticket.id),
                    status: String(ticket.reclamation?.status || ticket.status || ""),
                    customerName: String(ticket.reclamation?.customerName || ticket.equipment?.client || ticket.title || "-"),
                    checklist: ticket.reclamation?.checklist || null,
                    ticket: {
                        id: Number(ticket.id),
                        assignedToId: ticket.assignedToId ?? null,
                        displayId: ticket.displayId || ticket.ticketReference || null,
                        status: ticket.status,
                        priority: ticket.priority || null,
                        savHistory: Array.isArray(ticket.savHistory) ? ticket.savHistory : [],
                        assignedTo: ticket.assignedTo || null
                    }
                }));

            const activeTicketIds = new Set(activeTicketRows.map((item) => item.ticket?.id).filter(Boolean));
            const waitingRows: TicketRow[] = (Array.isArray(reclamationData) ? reclamationData : [])
                .filter((item: any) => MANAGER_STATUSES.includes(String(item.status || "")))
                .filter((item: any) => !item.ticket?.id || !activeTicketIds.has(item.ticket.id))
                .map((item: any) => ({
                    id: Number(item.id),
                    status: String(item.status || ""),
                    customerName: String(item.customerName || "-"),
                    checklist: item.checklist || null,
                    ticket: item.ticket
                        ? {
                              id: Number(item.ticket.id),
                              assignedToId: item.ticket.assignedToId ?? null,
                              displayId: item.ticket.displayId || item.ticket.ticketReference || null,
                              status: item.ticket.status || null,
                              priority: item.ticket.priority || null,
                              savHistory: Array.isArray(item.ticket.savHistory) ? item.ticket.savHistory : [],
                              assignedTo: item.ticket.assignedTo || null
                          }
                        : null
                }));

            const nextRows = [...waitingRows, ...activeTicketRows];
            setRows(nextRows);
            setTechnicians(Array.isArray(technicianData) ? technicianData : []);
            setSelectedTechnicians((prev) => {
                const next = { ...prev };
                nextRows.forEach((row) => {
                    if (!next[row.id]) next[row.id] = row.ticket?.assignedToId ? String(row.ticket.assignedToId) : "";
                });
                return next;
            });
        } catch (error) {
            console.error("Responsable technique tickets actifs error:", error);
            setRows([]);
            setTechnicians([]);
            setFeedback("Impossible de charger les tickets actifs.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchData();
    }, []);

    const assignTicket = async (row: TicketRow) => {
        if (!row.ticket?.id || savingRowId) return;

        const technicianId = Number(selectedTechnicians[row.id] || 0) || null;
        if (!technicianId) {
            setFeedback("Sélectionnez un technicien avant l'affectation.");
            return;
        }

        const warrantyStatus = getWarrantyStatusFromChecklist(row.checklist) || warrantyOverrides[row.id] || "";
        if (row.id > 0 && warrantyStatus !== "UNDER_WARRANTY" && warrantyStatus !== "OUT_OF_WARRANTY") {
            setFeedback("Renseignez le statut de garantie avant l'affectation.");
            return;
        }

        setSavingRowId(row.id);
        setFeedback("");
        try {
            const user = getLocalUser();
            const response = row.id > 0
                ? await fetch(`/api/responsable-technique/reclamations/${row.id}/review`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                          userId: user.id,
                          decision: "ASSIGN_TECHNICIAN",
                          warrantyStatus,
                          technicianId
                      })
                  })
                : await fetch(`/api/tickets/${row.ticket.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                          userId: user.id,
                          assignedToId: technicianId,
                          status: "DIAGNOSTIC"
                      })
                  });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Impossible d'affecter le ticket.");
            }

            await fetchData();
            setFeedback("Ticket affecté.");
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant l'affectation.");
        } finally {
            setSavingRowId(null);
        }
    };

    const updateUrgencyLevel = async (row: TicketRow, level: string) => {
        if (!row.ticket?.id || savingRowId) return;

        const normalizedLevel = normalizeUrgencyLevel(level);
        setUrgencyLevels((prev) => ({ ...prev, [row.ticket!.id]: normalizedLevel }));
        setSavingRowId(row.id);
        setFeedback("");
        try {
            const user = getLocalUser();
            const response = await fetch(`/api/tickets/${row.ticket.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    priority: urgencyLevelToPriority(normalizedLevel)
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Impossible d'enregistrer le niveau d'urgence.");
            }

            await fetch(`/api/tickets/${row.ticket.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    action: "URGENCY_LEVEL_LOCKED",
                    message: `Niveau d'urgence: ${normalizedLevel}`
                })
            }).catch(() => null);

            await fetchData();
            setFeedback("Niveau d'urgence enregistré.");
        } catch (error: any) {
            setUrgencyLevels((prev) => ({ ...prev, [row.ticket!.id]: "" }));
            setFeedback(error?.message || "Erreur pendant l'enregistrement du niveau d'urgence.");
        } finally {
            setSavingRowId(null);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement des tickets actifs...</div>;
    }

    const currentUser = getLocalUser();
    const filteredRows = rows.filter((row) => {
        const query = search.trim().toLowerCase();
        if (!query) return true;
        const ticketStatus = String(row.ticket?.status || "").toUpperCase();
        const lockedUrgencyLevel = getLockedUrgencyLevel(row);
        const displayedUrgencyLevel = lockedUrgencyLevel || priorityToUrgencyLevel(row.ticket?.priority);
        const searchText = [
            formatTicketNumber(row),
            row.ticket?.id,
            row.id,
            row.customerName,
            ticketStatus ? getStatusLabel(ticketStatus) : getReclamationStatusLabel(row.status),
            row.ticket?.assignedTo?.name,
            displayedUrgencyLevel,
            getWarrantyStatusFromChecklist(row.checklist)
        ].filter(Boolean).join(" ").toLowerCase();

        return searchText.includes(query);
    });
    return (
        <section className={styles.sectionCard}>
            <div className={styles.itemMain} style={{ alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem" }}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Tickets actifs</h2>
                <input
                    className={styles.input}
                    style={{ maxWidth: "380px" }}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher par ticket, client, statut..."
                />
            </div>
            {feedback ? <div className={styles.helper} style={{ marginBottom: "0.75rem" }}>{feedback}</div> : null}

            {filteredRows.length === 0 ? (
                <div className={styles.empty}>{rows.length === 0 ? "Aucun ticket actif." : "Aucun ticket ne correspond à la recherche."}</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Numéro</th>
                                <th>Client</th>
                                <th>Statut</th>
                                <th>Affectation</th>
                                <th>Niveau d'urgence</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows.map((row) => {
                                const isAssigned = Boolean(row.ticket?.assignedToId || row.ticket?.assignedTo);
                                const ticketStatus = String(row.ticket?.status || "").toUpperCase();
                                const warrantyStatus = getWarrantyStatusFromChecklist(row.checklist);
                                const warrantyMissing = row.id > 0 && !warrantyStatus;
                                const assignedToResponsible = Number(row.ticket?.assignedToId || 0) === Number(currentUser.id || 0);
                                const lockedUrgencyLevel = getLockedUrgencyLevel(row);
                                const displayedUrgencyLevel = lockedUrgencyLevel || priorityToUrgencyLevel(row.ticket?.priority);
                                const selectedAssigneeId = Number(selectedTechnicians[row.id] || 0);
                                const selectedSelf = Boolean(currentUser.id && selectedAssigneeId === Number(currentUser.id));
                                const canResponsibleChooseUrgency = Boolean(row.ticket?.id && (assignedToResponsible || (!isAssigned && selectedSelf)));

                                return (
                                    <tr key={`rt-ticket-row-${row.id}-${row.ticket?.id || "none"}`}>
                                        <td>
                                            {row.ticket?.id ? (
                                                <Link className="btn btn-outline" href={`/responsable-technique/tickets/${row.ticket.id}`} style={{ whiteSpace: "nowrap" }}>
                                                    #{formatTicketNumber(row)}
                                                </Link>
                                            ) : (
                                                <span className={styles.statusBadge} style={SUBTLE_BADGE_STYLE}>Ticket à créer</span>
                                            )}
                                        </td>
                                        <td>{row.customerName || "-"}</td>
                                        <td>
                                            <span className={styles.statusBadge} style={SUBTLE_BADGE_STYLE}>
                                                {ticketStatus ? getStatusLabel(ticketStatus) : getReclamationStatusLabel(row.status)}
                                            </span>
                                        </td>
                                        <td>
                                            {isAssigned ? (
                                                <span className={styles.itemMeta}>
                                                    {row.ticket?.assignedTo?.name || (assignedToResponsible ? "Responsable Technique" : "-")}
                                                </span>
                                            ) : row.ticket?.id ? (
                                                <div style={{ display: "grid", gap: "0.5rem", minWidth: "220px" }}>
                                                    {warrantyMissing ? (
                                                        <select
                                                            className={styles.select}
                                                            value={warrantyOverrides[row.id] || ""}
                                                            onChange={(event) => setWarrantyOverrides((prev) => ({ ...prev, [row.id]: event.target.value }))}
                                                        >
                                                            <option value="">Garantie</option>
                                                            <option value="UNDER_WARRANTY">Sous garantie</option>
                                                            <option value="OUT_OF_WARRANTY">Hors garantie</option>
                                                        </select>
                                                    ) : null}
                                                    <select
                                                        className={styles.select}
                                                        value={selectedTechnicians[row.id] || ""}
                                                        onChange={(event) => setSelectedTechnicians((prev) => ({ ...prev, [row.id]: event.target.value }))}
                                                    >
                                                        <option value="">Sélectionner</option>
                                                        {assignmentOptions.map((technician) => (
                                                            <option key={technician.id} value={String(technician.id)}>
                                                                {Number(technician.id) === Number(currentUser.id) ? "Moi-même" : technician.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button className="btn btn-primary" type="button" onClick={() => assignTicket(row)} disabled={savingRowId === row.id}>
                                                        {savingRowId === row.id ? "Affectation..." : "Affecter"}
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={styles.itemMeta}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.ticket?.id && lockedUrgencyLevel ? (
                                                <span
                                                    className={styles.statusBadge}
                                                    style={{
                                                        ...getSeverityBadgeStyle(row.ticket.priority),
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        padding: "0.18rem 0.55rem",
                                                        borderRadius: "999px",
                                                        fontSize: "0.82rem",
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    {displayedUrgencyLevel}
                                                </span>
                                            ) : row.ticket?.id && canResponsibleChooseUrgency ? (
                                                <select
                                                    className={styles.select}
                                                    value={urgencyLevels[row.ticket.id] || ""}
                                                    onChange={(event) => updateUrgencyLevel(row, event.target.value)}
                                                    disabled={savingRowId === row.id}
                                                    style={{ minWidth: "90px" }}
                                                >
                                                    <option value="" disabled>Sélectionner</option>
                                                    {URGENCY_LEVELS.map((level) => (
                                                        <option key={level} value={level}>{level}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className={styles.itemMeta}>-</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.ticket?.id ? (
                                                <Link className="btn btn-outline" href={`/responsable-technique/tickets/${row.ticket.id}?section=suivi`}>
                                                    Suivi
                                                </Link>
                                            ) : (
                                                <span className={styles.itemMeta}>-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
