"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../technicien.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getSeverityBadgeStyle, getStatusLabel } from "@/metier/workflow-technicien";

const ACTIVE_STATUSES = new Set(["OPEN", "QUALIFICATION", "DIAGNOSTIC", "PENDING_PARTS", "REPAIR", "QUALITY_TEST"]);
const TICKETS_REFRESH_MS = 10000;
const URGENCY_LEVELS = ["1", "2", "3", "4", "5"] as const;

function getLocalUser() {
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        return {
            id: Number(user?.id || 0) || null,
            name: String(user?.name || "").trim()
        };
    } catch {
        return { id: null, name: "" };
    }
}

function getClientDisplayName(ticket: any) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const firstName = String((metadata as any)?.firstName || "").trim();
    const lastName = String((metadata as any)?.lastName || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || ticket?.reclamation?.customerName || ticket?.equipment?.client || "-";
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

function getLockedUrgencyLevel(ticket: any) {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const entry = [...history].reverse().find((item: any) => String(item?.action || "") === "URGENCY_LEVEL_LOCKED");
    const match = String(entry?.note || "").match(/Niveau d'urgence\s*:\s*([1-5])/i);
    if (match?.[1]) return match[1];

    const priorityEntry = [...history].reverse().find((item: any) => ["Priority updated", "Priorité mise à jour"].includes(String(item?.action || "")));
    const priorityMatch = String(priorityEntry?.note || "").match(/->\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
    return priorityMatch?.[1] ? priorityToUrgencyLevel(priorityMatch[1]) : "";
}

export default function MesTicketsTechnicienPage() {
    const [loading, setLoading] = useState(true);
    const [savingTicketId, setSavingTicketId] = useState<number | null>(null);
    const [tickets, setTickets] = useState<any[]>([]);
    const [urgencyLevels, setUrgencyLevels] = useState<Record<number, string>>({});
    const [search, setSearch] = useState("");
    const [feedback, setFeedback] = useState("");

    useEffect(() => {
        const user = getLocalUser();

        if (!user?.id) {
            setTickets([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadTickets = async (showLoader = false) => {
            if (showLoader) setLoading(true);
            try {
                const response = await fetch(`/api/tickets?assignedToId=${user.id}`, { cache: "no-store" });
                const data = await response.json().catch(() => []);
                if (!cancelled) {
                    const list = Array.isArray(data) ? data : [];
                    setTickets(list);
                }
            } catch (error) {
                console.error("Erreur chargement tickets technicien:", error);
                if (!cancelled) setTickets([]);
            } finally {
                if (showLoader && !cancelled) setLoading(false);
            }
        };

        void loadTickets(true);
        const intervalId = window.setInterval(() => void loadTickets(false), TICKETS_REFRESH_MS);
        const refreshOnFocus = () => {
            if (document.visibilityState === "visible") void loadTickets(false);
        };

        window.addEventListener("focus", refreshOnFocus);
        document.addEventListener("visibilitychange", refreshOnFocus);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", refreshOnFocus);
            document.removeEventListener("visibilitychange", refreshOnFocus);
        };
    }, []);

    const updateUrgencyLevel = async (ticket: any, level: string) => {
        if (!ticket?.id || savingTicketId) return;

        const normalizedLevel = normalizeUrgencyLevel(level);
        const user = getLocalUser();
        setSavingTicketId(ticket.id);
        setFeedback("");
        setUrgencyLevels((prev) => ({ ...prev, [ticket.id]: normalizedLevel }));
        try {
            const priority = urgencyLevelToPriority(normalizedLevel);
            const response = await fetch(`/api/tickets/${ticket.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    priority
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Impossible d'enregistrer le niveau d'urgence.");
            }

            await fetch(`/api/tickets/${ticket.id}/messages`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: user.id,
                    action: "URGENCY_LEVEL_LOCKED",
                    message: `Niveau d'urgence: ${normalizedLevel}`
                })
            }).catch(() => null);

            const urgencyHistoryEntry = {
                action: "URGENCY_LEVEL_LOCKED",
                note: `Niveau d'urgence: ${normalizedLevel}`,
                createdAt: new Date().toISOString()
            };
            setTickets((prev) => prev.map((item) => item.id === ticket.id ? {
                ...item,
                priority,
                savHistory: [...(Array.isArray(item.savHistory) ? item.savHistory : []), urgencyHistoryEntry]
            } : item));
            setFeedback("Niveau d'urgence enregistré.");
        } catch (error: any) {
            setUrgencyLevels((prev) => ({ ...prev, [ticket.id]: "" }));
            setFeedback(error?.message || "Erreur pendant l'enregistrement du niveau d'urgence.");
        } finally {
            setSavingTicketId(null);
        }
    };

    const activeTickets = useMemo(() => {
        const query = search.trim().toLowerCase();
        const currentUser = getLocalUser();
        return tickets
            .filter((ticket) => ACTIVE_STATUSES.has(String(ticket?.status || "").toUpperCase()))
            .filter((ticket) => !currentUser.id || Number(ticket?.assignedToId || ticket?.assignedTo?.id || 0) === Number(currentUser.id))
            .filter((ticket) => {
                if (!query) return true;
                const lockedUrgencyLevel = getLockedUrgencyLevel(ticket);
                const displayedUrgencyLevel = lockedUrgencyLevel || priorityToUrgencyLevel(ticket.priority);
                const text = [
                    ticket?.displayId,
                    ticket?.id,
                    getClientDisplayName(ticket),
                    getStatusLabel(ticket.status),
                    displayedUrgencyLevel,
                    ticket?.equipment?.name,
                    ticket?.equipment?.serialNumber,
                    ticket?.reclamation?.deviceModel,
                    ticket?.reclamation?.serialNumber
                ].filter(Boolean).join(" ").toLowerCase();
                return text.includes(query);
            });
    }, [tickets, search]);

    return (
        <section className={styles.sectionCard}>
            <div className={styles.itemMain} style={{ marginBottom: "0.85rem" }}>
                <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Tickets actifs</h2>
                <input
                    className={styles.input}
                    style={{ maxWidth: "360px" }}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher par ticket, client ou matériel..."
                />
            </div>
            {feedback ? <div className={styles.helper} style={{ marginBottom: "0.75rem" }}>{feedback}</div> : null}

            {loading ? (
                <div className={styles.empty}>Chargement des tickets...</div>
            ) : activeTickets.length === 0 ? (
                <div className={styles.empty}>Aucun ticket actif.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Numéro</th>
                                <th>Client</th>
                                <th>Statut</th>
                                <th>Niveau d'urgence</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeTickets.map((ticket) => {
                                const lockedUrgencyLevel = getLockedUrgencyLevel(ticket);
                                const displayedUrgencyLevel = lockedUrgencyLevel || priorityToUrgencyLevel(ticket.priority);

                                return (
                                    <tr key={ticket.id}>
                                        <td>
                                            <Link href={`/technicien/tickets/${ticket.id}`} className="btn btn-outline" style={{ whiteSpace: "nowrap" }}>
                                                #{ticket.displayId || ticket.id}
                                            </Link>
                                        </td>
                                        <td>{getClientDisplayName(ticket)}</td>
                                        <td>
                                            <span
                                                style={{
                                                    background: "#e2e8f0",
                                                    border: "1px solid #cbd5e1",
                                                    color: "#334155",
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    padding: "0.18rem 0.55rem",
                                                    borderRadius: "999px",
                                                    fontSize: "0.82rem",
                                                    fontWeight: 700
                                                }}
                                            >
                                                {getStatusLabel(ticket.status)}
                                            </span>
                                        </td>
                                        <td>
                                            {lockedUrgencyLevel ? (
                                                <span
                                                    style={{
                                                        ...getSeverityBadgeStyle(ticket.priority),
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
                                            ) : (
                                                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", minWidth: "110px" }}>
                                                    <select
                                                        className={styles.select}
                                                        value={urgencyLevels[ticket.id] || ""}
                                                        onChange={(event) => updateUrgencyLevel(ticket, event.target.value)}
                                                        disabled={savingTicketId === ticket.id}
                                                        style={{ minWidth: "90px" }}
                                                    >
                                                        <option value="" disabled>Sélectionner</option>
                                                        {URGENCY_LEVELS.map((level) => (
                                                            <option key={level} value={level}>{level}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <Link className="btn btn-outline" href={`/technicien/tickets/${ticket.id}?section=suivi`}>
                                                Suivi
                                            </Link>
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
