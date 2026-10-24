"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import { getStatusLabel, getTechnicianRepairStatusReferenceAt } from "@/metier/workflow-technicien";
import { parseChecklistPayload } from "@/metier/workflow-client";

type DashboardSnapshot = {
    tickets: any[];
    importOverview: { pendingOrders: any[]; alertOrders: any[]; historyOrders: any[] };
    appelsOffreOverview: { equipments: any[]; visits: any[] };
    clientAccesses: any[];
    internalThreads: any[];
    supplierThreads: any[];
};

const SATISFACTION_GROUPS = [
    { label: "Faible", min: 1, max: 4, color: "#f97316" },
    { label: "Moyenne", min: 5, max: 7, color: "#f59e0b" },
    { label: "Très bonne", min: 8, max: 10, color: "#16a34a" }
];
const ADMIN_OVERDUE_DAYS = 7;
const QUALIFICATION_WAITING_STATUSES = new Set(["OPEN", "QUALIFICATION"]);
const ASSIGNMENT_WAITING_STATUSES = new Set(["PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "QUOTE_APPROVED"]);
const REPAIR_PROGRESS_STATUSES = new Set(["DIAGNOSTIC", "PENDING_PARTS", "REPAIR", "QUALITY_TEST"]);

function formatDateLabel(value: string | null | undefined) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function formatPerDay(value: number) {
    return value.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayKey(date: Date) {
    return startOfDay(date).toISOString().slice(0, 10);
}

function getRecentDayBuckets(days: number) {
    return Array.from({ length: days }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - index));
        const day = startOfDay(date);
        return {
            key: formatDayKey(day),
            label: formatDateLabel(day.toISOString())
        };
    });
}

function getHistoryEntries(ticket: any) {
    return Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
}

function isQuoteSentAction(action: string) {
    return ["QUOTE_SENT_TO_CLIENT", "ADV_QUOTE_SENT"].includes(action);
}

function isQuoteApprovedAction(action: string) {
    return ["QUOTE_APPROVED", "CLIENT_QUOTE_APPROVED", "QUOTE_CLIENT_APPROVED"].includes(action);
}

function countQuoteEventsByDay(tickets: any[], kind: "sent" | "approved", days: number) {
    const buckets = getRecentDayBuckets(days).map((day) => ({ ...day, count: 0 }));
    const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]));

    tickets.forEach((ticket) => {
        getHistoryEntries(ticket).forEach((entry: any) => {
            const action = String(entry?.action || "").trim().toUpperCase();
            const matches = kind === "sent" ? isQuoteSentAction(action) : isQuoteApprovedAction(action);
            if (!matches) return;

            const parsedDate = entry?.createdAt ? new Date(entry.createdAt) : null;
            if (!parsedDate || Number.isNaN(parsedDate.getTime())) return;

            const bucket = byKey.get(formatDayKey(parsedDate));
            if (bucket) bucket.count += 1;
        });
    });

    return buckets;
}

function getAveragePerDay(series: Array<{ count: number }>) {
    if (series.length === 0) return 0;
    return series.reduce((total, item) => total + item.count, 0) / series.length;
}

function getSatisfactionDistribution(tickets: any[]) {
    const ratedTickets = tickets
        .map((ticket) => Number(ticket?.satisfactionRate || ticket?.reclamation?.satisfactionRate || 0))
        .filter((value) => Number.isFinite(value) && value > 0);

    const groups = SATISFACTION_GROUPS.map((group) => ({
        ...group,
        count: ratedTickets.filter((value) => value >= group.min && value <= group.max).length
    }));

    const average = ratedTickets.length === 0
        ? 0
        : ratedTickets.reduce((total, value) => total + value, 0) / ratedTickets.length;

    return {
        average,
        total: ratedTickets.length,
        groups
    };
}

function getDaysSince(value: string | null | undefined) {
    const parsed = value ? new Date(value) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return 0;
    const now = Date.now();
    return Math.floor((now - parsed.getTime()) / (1000 * 60 * 60 * 24));
}

function getLatestHistoryAt(ticket: any, predicate: (action: string, entry: any) => boolean): string | null {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const latest = history
        .filter((entry: any) => predicate(String(entry?.action || "").trim().toUpperCase(), entry))
        .sort((left: any, right: any) => new Date(String(right?.createdAt || "")).getTime() - new Date(String(left?.createdAt || "")).getTime())[0];

    return latest?.createdAt ? String(latest.createdAt) : null;
}

function getAssignmentWaitingReferenceAt(ticket: any): string | null {
    return getLatestHistoryAt(ticket, (action, entry) => {
        const note = String(entry?.note || "").toLowerCase();
        if (action.startsWith("STATUS CHANGED:")) {
            return Array.from(ASSIGNMENT_WAITING_STATUSES).some((target) => action.includes(`-> ${target}`));
        }
        return action === "MERCHANDISE_INFO_COMPLETED"
            || action === "MAGASINIER_CONTRACT_REVIEW_VALIDATED"
            || action === "ADV_DECISION_TAKEN"
            || action === "CLIENT_QUOTE_APPROVED"
            || action === "QUOTE_CLIENT_APPROVED"
            || note.includes("responsable technique pour affectation");
    }) || ticket?.reclamation?.updatedAt || ticket?.updatedAt || ticket?.createdAt || null;
}

function getTicketDelayInfo(ticket: any): { reason: string; days: number } | null {
    const status = String(ticket?.status || "").trim().toUpperCase();
    const reclamationStatus = String(ticket?.reclamation?.status || "").trim().toUpperCase();
    const hasAdministrativeClosure = Boolean(getAdministrativeClosureAt(ticket?.savHistory || []));
    if (status === "CLOSED" || hasAdministrativeClosure) return null;

    const qualifiedAt = getLatestHistoryAt(ticket, (action) => action === "ADV_QUALIFICATION");
    if (QUALIFICATION_WAITING_STATUSES.has(status) && !qualifiedAt) {
        const referenceAt = ticket?.reclamation?.createdAt || ticket?.createdAt || null;
        const days = getDaysSince(referenceAt);
        if (days >= ADMIN_OVERDUE_DAYS) {
            return { reason: "Qualification non réalisée depuis plus d'une semaine", days };
        }
    }

    if (!ticket?.assignedToId && (ASSIGNMENT_WAITING_STATUSES.has(status) || ASSIGNMENT_WAITING_STATUSES.has(reclamationStatus))) {
        const days = getDaysSince(getAssignmentWaitingReferenceAt(ticket));
        if (days >= ADMIN_OVERDUE_DAYS) {
            return { reason: "Affectation non réalisée depuis plus d'une semaine", days };
        }
    }

    if (REPAIR_PROGRESS_STATUSES.has(status)) {
        const days = getDaysSince(getTechnicianRepairStatusReferenceAt(ticket));
        if (days >= ADMIN_OVERDUE_DAYS) {
            return { reason: "État de réparation non mis à jour depuis plus d'une semaine", days };
        }
    }

    return null;
}

function countInterventionEntries(tickets: any[]) {
    return tickets.reduce((total, ticket) => {
        const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
        const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
        const repairEntries = Array.isArray(technicalDiagnosis.repairEntries) ? technicalDiagnosis.repairEntries.length : 0;
        const usedParts = Array.isArray(technicalDiagnosis.usedParts) ? technicalDiagnosis.usedParts.length : 0;
        return total + repairEntries + usedParts;
    }, 0);
}

function hasNonRepareOutcome(history: any[]) {
    return Array.isArray(history)
        && history.some((entry) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

function isReadyForAdvTreatment(ticket: any) {
    const historyEntries = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const status = String(ticket?.status || "").toUpperCase();
    const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
    return Boolean(ticket?.id)
        && !isAdministrativelyClosed
        && (status === "READY_FOR_DELIVERY" || status === "NON_REPARE" || (status === "CLOSED" && hasNonRepareOutcome(historyEntries)));
}

function getMarketMeta(item: any) {
    return item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
}

function getTechnicalVisitDates(item: any) {
    const dates = getMarketMeta(item).technicalVisitDates;
    return Array.isArray(dates) ? dates : [];
}

function parseTechnicalVisitDate(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return null;

    const frenchDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const parsed = frenchDate
        ? new Date(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]))
        : /^\d{4}-\d{2}-\d{2}$/.test(text)
          ? new Date(`${text}T12:00:00`)
          : new Date(text);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getVisitDateKey(value: unknown) {
    const parsed = parseTechnicalVisitDate(value);
    if (!parsed) return "";
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function isVisitCompleted(status: unknown) {
    const normalized = String(status || "").trim().toUpperCase();
    return ["COMPLETED", "DONE", "REALIZED", "REALISED", "REALISEE", "RÉALISÉE"].includes(normalized);
}

function countAppelsOffreTechnicalVisitsToDo(equipments: any[], visits: any[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const countedVisitKeys = new Set<string>();
    const completedVisitKeys = new Set<string>();
    let count = 0;

    visits.forEach((visit) => {
        const dateKey = getVisitDateKey(visit?.scheduledDate);
        if (!dateKey) return;
        const key = `${Number(visit?.equipmentId || visit?.equipment?.id || 0) || 0}-${dateKey}`;
        if (isVisitCompleted(visit?.status)) {
            completedVisitKeys.add(key);
            return;
        }
        if (countedVisitKeys.has(key)) return;
        countedVisitKeys.add(key);
        count += 1;
    });

    equipments.forEach((item) => {
        getTechnicalVisitDates(item).forEach((rawDate: unknown) => {
            const parsed = parseTechnicalVisitDate(rawDate);
            if (!parsed || parsed < today) return;

            const dateKey = getVisitDateKey(parsed);
            const key = `${Number(item?.id || 0) || 0}-${dateKey}`;
            if (countedVisitKeys.has(key) || completedVisitKeys.has(key)) return;

            countedVisitKeys.add(key);
            count += 1;
        });
    });

    return count;
}

function cleanDisplayValue(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const normalized = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    if (["-", "non renseigne", "non precisee", "non precise"].includes(normalized)) return "";
    return text;
}

function normalizeStatKey(value: unknown) {
    return cleanDisplayValue(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function isSameDisplayValue(left: unknown, right: unknown) {
    const leftKey = normalizeStatKey(left);
    const rightKey = normalizeStatKey(right);
    return Boolean(leftKey) && leftKey === rightKey;
}

function getTicketFailureLabel(ticket: any) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const entryRepairSlip = (metadata as any).entryRepairSlip || {};
    return cleanDisplayValue(entryRepairSlip.failureDescription)
        || cleanDisplayValue(ticket?.reclamation?.description)
        || cleanDisplayValue(ticket?.description)
        || "Panne non precisee";
}

function getTicketMaterialLabel(ticket: any) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const entryRepairSlip = (metadata as any).entryRepairSlip || {};
    const equipmentItems = Array.isArray(entryRepairSlip.equipmentItems) ? entryRepairSlip.equipmentItems : [];
    const firstItem = equipmentItems[0] || {};

    const rawModel = cleanDisplayValue(ticket?.equipment?.model) || cleanDisplayValue((metadata as any).model) || cleanDisplayValue(ticket?.reclamation?.deviceModel);
    const name = cleanDisplayValue(firstItem.designation) || cleanDisplayValue(ticket?.equipment?.name) || rawModel || "Materiel";

    return {
        name,
        model: rawModel,
        brand: cleanDisplayValue(ticket?.equipment?.brand) || cleanDisplayValue((metadata as any).brand),
        serialNumber: cleanDisplayValue(firstItem.serialNumber) || cleanDisplayValue(ticket?.equipment?.serialNumber) || cleanDisplayValue(ticket?.reclamation?.serialNumber)
    };
}

function formatTicketNumber(ticket: any) {
    return ticket?.ticketReference || ticket?.displayId || ticket?.id || "-";
}

export default function AdminDashboard() {
    const [loading, setLoading] = useState(true);
    const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            try {
                const user = JSON.parse(localStorage.getItem("user") || "{}");
                const userId = Number(user?.id || 0) || 0;

                const [ticketsRes, importRes, appelsOffreRes, clientAccessRes, threadsRes, supplierThreadsRes] = await Promise.all([
                    fetch("/api/tickets?hideClientDocuments=1", { cache: "no-store" }),
                    fetch("/api/import/overview?role=RESPONSABLE_TECHNIQUE", { cache: "no-store" }),
                    fetch("/api/appels-offre/overview", { cache: "no-store" }),
                    fetch("/api/adv/client-access", { cache: "no-store" }),
                    fetch(`/api/messagerie?summary=1&role=ADMIN&userId=${userId}`, { cache: "no-store" }),
                    fetch("/api/responsable-technique/supplier-messaging", { cache: "no-store" })
                ]);

                const [ticketsData, importData, appelsOffreData, clientAccessData, threadsData, supplierThreadsData] = await Promise.all([
                    ticketsRes.json().catch(() => []),
                    importRes.json().catch(() => ({})),
                    appelsOffreRes.json().catch(() => ({})),
                    clientAccessRes.json().catch(() => []),
                    threadsRes.json().catch(() => []),
                    supplierThreadsRes.json().catch(() => [])
                ]);

                if (cancelled) return;

                setSnapshot({
                    tickets: Array.isArray(ticketsData) ? ticketsData : [],
                    importOverview: {
                        pendingOrders: Array.isArray(importData?.pendingOrders) ? importData.pendingOrders : [],
                        alertOrders: Array.isArray(importData?.alertOrders) ? importData.alertOrders : [],
                        historyOrders: Array.isArray(importData?.historyOrders) ? importData.historyOrders : []
                    },
                    appelsOffreOverview: {
                        equipments: Array.isArray(appelsOffreData?.equipments) ? appelsOffreData.equipments : [],
                        visits: Array.isArray(appelsOffreData?.visits) ? appelsOffreData.visits : []
                    },
                    clientAccesses: Array.isArray(clientAccessData) ? clientAccessData : [],
                    internalThreads: Array.isArray(threadsData) ? threadsData : [],
                    supplierThreads: Array.isArray(supplierThreadsData) ? supplierThreadsData : []
                });
            } catch (error) {
                console.error("Admin dashboard load error:", error);
                if (!cancelled) {
                    setSnapshot({
                        tickets: [],
                        importOverview: { pendingOrders: [], alertOrders: [], historyOrders: [] },
                        appelsOffreOverview: { equipments: [], visits: [] },
                        clientAccesses: [],
                        internalThreads: [],
                        supplierThreads: []
                    });
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const tickets = snapshot?.tickets || [];
    const importOverview = snapshot?.importOverview || { pendingOrders: [], alertOrders: [], historyOrders: [] };
    const appelsOffreOverview = snapshot?.appelsOffreOverview || { equipments: [], visits: [] };
    const closedTickets = useMemo(
        () => tickets.filter((ticket) => Boolean(getAdministrativeClosureAt(ticket?.savHistory || []))),
        [tickets]
    );

    const satisfactionStats = useMemo(() => getSatisfactionDistribution(tickets), [tickets]);
    const satisfactionChartMax = Math.max(1, ...satisfactionStats.groups.map((group) => group.count));
    const activeTickets = useMemo(
        () => tickets.filter((ticket) => {
            const status = String(ticket?.status || "").toUpperCase();
            const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(ticket?.savHistory || []));
            return status !== "CLOSED" && !isAdministrativelyClosed;
        }),
        [tickets]
    );
    const delayedTickets = useMemo(
        () => activeTickets
            .map((ticket) => ({
                ticket,
                delay: getTicketDelayInfo(ticket)
            }))
            .filter((item): item is { ticket: any; delay: { reason: string; days: number } } => Boolean(item.delay))
            .sort((left, right) => right.delay.days - left.delay.days),
        [activeTickets]
    );
    const metrics = useMemo(
        () => {
            const newTickets = tickets.filter((ticket) => ["OPEN", "QUALIFICATION"].includes(String(ticket?.status || "").toUpperCase())).length;
            const workshopTickets = activeTickets.filter((ticket) => String(ticket?.interventionType || ticket?.reclamation?.interventionType || "").toUpperCase() === "WORKSHOP").length;
            const siteTickets = activeTickets.filter((ticket) => String(ticket?.interventionType || ticket?.reclamation?.interventionType || "").toUpperCase() === "SITE").length;
            const quoteRequired = activeTickets.filter((ticket) => {
                const status = String(ticket?.status || ticket?.reclamation?.status || "").toUpperCase();
                return ["PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT"].includes(status);
            }).length;
            const readyForAdvTreatment = tickets.filter(isReadyForAdvTreatment).length;
            const processing = activeTickets.filter((ticket) => REPAIR_PROGRESS_STATUSES.has(String(ticket?.status || "").toUpperCase())).length;
            const appelsOffreTechnicalVisitsToDo = countAppelsOffreTechnicalVisitsToDo(appelsOffreOverview.equipments, appelsOffreOverview.visits);

            return [
                { label: "Nv tickets", value: newTickets },
                { label: "Tickets en atelier", value: workshopTickets },
                { label: "Tickets sur site", value: siteTickets },
                { label: "Tickets nécessitant un devis", value: quoteRequired },
                { label: "Tickets à traiter", value: readyForAdvTreatment },
                { label: "Tickets en cours de traitement", value: processing },
                { label: "Visites techniques à réaliser", value: appelsOffreTechnicalVisitsToDo },
                { label: "Tickets en retard", value: delayedTickets.length },
                { label: "Demandes import en attente", value: importOverview.pendingOrders.length },
                { label: "Accès clients", value: snapshot?.clientAccesses?.length || 0 }
            ];
        },
        [
            activeTickets,
            appelsOffreOverview.equipments,
            appelsOffreOverview.visits,
            delayedTickets.length,
            importOverview.pendingOrders.length,
            snapshot?.clientAccesses?.length,
            tickets
        ]
    );

    if (loading) {
        return <div className={styles.empty}>Chargement du tableau de bord...</div>;
    }

    return (
        <div className={styles.content}>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Tableau de bord</h2>
                <div className={styles.metricGrid} style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                    {metrics.map((metric) => (
                        <article key={metric.label} className={styles.metricCard}>
                            <div className={styles.metricLabel}>{metric.label}</div>
                            <div className={styles.metricValue}>{metric.value}</div>
                        </article>
                    ))}
                </div>
            </section>

            <div className={styles.formGrid2} style={{ alignItems: "start" }}>
                <section className={styles.sectionCard}>
                    <div className={styles.itemMain}>
                        <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Tickets en retard</h2>
                        <div style={{ fontSize: "0.85rem", color: "#64748b" }}>{delayedTickets.length} ticket{delayedTickets.length > 1 ? "s" : ""}</div>
                    </div>
                    {delayedTickets.length === 0 ? (
                        <div className={styles.empty} style={{ marginTop: "1rem" }}>Aucun ticket en retard.</div>
                    ) : (
                        <div className={styles.tableWrap} style={{ marginTop: "1rem" }}>
                            <table className={styles.table} style={{ minWidth: 560 }}>
                                <thead>
                                    <tr>
                                        <th>Ticket</th>
                                        <th>Client</th>
                                        <th>Motif</th>
                                        <th>Retard</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {delayedTickets.slice(0, 6).map(({ ticket, delay }) => {
                                        return (
                                            <tr key={`admin-delayed-ticket-${ticket.id}`}>
                                                <td>
                                                    <Link href={`/admin/tickets/${ticket.id}`} className={styles.ticketLink}>
                                                        #{formatTicketNumber(ticket)}
                                                    </Link>
                                                </td>
                                                <td>{ticket?.reclamation?.customerName || ticket?.equipment?.client || "Client non renseigné"}</td>
                                                <td>{delay.reason}</td>
                                                <td>
                                                    <span className={styles.statusBadge} style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>
                                                        {delay.days} j
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className={styles.sectionCard}>
                    <div className={styles.itemMain}>
                        <h2 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Statistiques de satisfaction</h2>
                    </div>
                    {satisfactionStats.total === 0 ? (
                        <div className={styles.empty}>Aucune satisfaction enregistrée.</div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginTop: "1rem" }}>
                            {satisfactionStats.groups.map((group) => (
                                <div key={group.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 52px", gap: "0.8rem", alignItems: "center" }}>
                                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{group.label}</div>
                                    <div style={{ height: "14px", borderRadius: "999px", background: "#f3f4f6", overflow: "hidden" }}>
                                        <div style={{ width: `${(group.count / satisfactionChartMax) * 100}%`, minWidth: group.count > 0 ? "8px" : 0, height: "100%", borderRadius: "999px", background: group.color }} />
                                    </div>
                                    <div style={{ textAlign: "right", fontWeight: 700, color: "#475569" }}>{group.count}</div>
                                </div>
                            ))}
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.8rem", marginTop: "0.4rem" }}>
                                <div style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.9rem", background: "#fffdfd" }}>
                                    <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase" }}>Notes reçues</div>
                                    <div style={{ marginTop: "0.25rem", fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>{satisfactionStats.total}</div>
                                </div>
                                <div style={{ border: "1px solid #e5e7eb", borderRadius: "14px", padding: "0.9rem", background: "#fffdfd" }}>
                                    <div style={{ fontSize: "0.78rem", color: "#64748b", textTransform: "uppercase" }}>Moyenne</div>
                                    <div style={{ marginTop: "0.25rem", fontSize: "1.2rem", fontWeight: 800, color: "#0f172a" }}>
                                        {formatPerDay(satisfactionStats.average)}/10
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}


