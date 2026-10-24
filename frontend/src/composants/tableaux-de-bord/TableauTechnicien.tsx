"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";
import panelStyles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";

const DASHBOARD_REFRESH_MS = 60000;
const VALIDATED_TECHNICIAN_ALERTS_STORAGE_KEY = "technicianValidatedAlerts";
const ALERT_CARD_STYLE = { border: "1px solid #1f1f1f", background: "#ffffff" };
const ALERT_BADGE_STYLE = { background: "#fff1f2", border: "1px solid #fecaca", color: "#b00020" };
const ALERT_VALIDATE_BUTTON_STYLE = {
    border: "1px solid #86efac",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 800,
    padding: "0.28rem 0.7rem",
    cursor: "pointer"
};

function formatTicketReference(source: any): string {
    const directReference = String(source?.ticketReference || "").trim();
    if (directReference) return directReference;

    const rawDisplay = String(source?.displayId || "").trim();
    if (/^\d{8}$/.test(rawDisplay)) return rawDisplay;

    const rawId = String(source?.ticketId || source?.id || "").trim();
    const matchFromTitle = String(source?.title || "").match(/#\s*(\d{1,8})/);
    const rawReference = rawDisplay || rawId || matchFromTitle?.[1] || "";
    if (/^\d{8}$/.test(rawReference)) return rawReference;

    const numericId = Number(rawReference);
    if (Number.isFinite(numericId) && numericId > 0) {
        const rawDate = source?.createdAt || source?.ticket?.createdAt;
        const parsedDate = rawDate ? new Date(String(rawDate)) : null;
        const year = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.getFullYear() : new Date().getFullYear();
        return `${year}${String(numericId).padStart(4, "0")}`;
    }

    return rawReference || "-";
}

export default function TechnicianDashboard() {
    const [data, setData] = useState<{
        stats: Record<string, number>;
        interventions: any[];
        alerts: any[];
        assignedTickets?: any[];
    } | null>(null);
    const [importOverview, setImportOverview] = useState<{ alertOrders: any[]; historyOrders: any[] } | null>(null);
    const [validatedTechnicianAlerts, setValidatedTechnicianAlerts] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        try {
            const saved = JSON.parse(localStorage.getItem(VALIDATED_TECHNICIAN_ALERTS_STORAGE_KEY) || "[]");
            if (Array.isArray(saved)) {
                setValidatedTechnicianAlerts(saved.map((item) => String(item)));
            }
        } catch {
            setValidatedTechnicianAlerts([]);
        }

        const fetchDashboardData = async () => {
            try {
                const savedUser = localStorage.getItem("user");
                if (!savedUser) return;
                const parsedUser = JSON.parse(savedUser);

                const [dashboardRes, importRes] = await Promise.all([
                    fetch(`/api/dashboard/technician?summary=1&userId=${parsedUser.id}`),
                    fetch("/api/import/overview?summary=1&role=RESPONSABLE_TECHNIQUE", { cache: "no-store" })
                ]);

                if (dashboardRes.ok && !cancelled) {
                    const result = await dashboardRes.json();
                    setData(result);
                }

                if (importRes.ok && !cancelled) {
                    const importData = await importRes.json();
                    setImportOverview({
                        alertOrders: Array.isArray(importData?.alertOrders) ? importData.alertOrders : [],
                        historyOrders: Array.isArray(importData?.historyOrders) ? importData.historyOrders : []
                    });
                } else if (!cancelled) {
                    setImportOverview({ alertOrders: [], historyOrders: [] });
                }
            } catch (error) {
                console.error("Dashboard fetch error:", error);
                if (!cancelled) {
                    setImportOverview({ alertOrders: [], historyOrders: [] });
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void fetchDashboardData();

        const intervalId = window.setInterval(() => {
            void fetchDashboardData();
        }, DASHBOARD_REFRESH_MS);

        const handleFocusRefresh = () => {
            if (document.visibilityState === "visible") {
                void fetchDashboardData();
            }
        };

        window.addEventListener("focus", handleFocusRefresh);
        document.addEventListener("visibilitychange", handleFocusRefresh);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleFocusRefresh);
            document.removeEventListener("visibilitychange", handleFocusRefresh);
        };
    }, []);

    const validateTechnicianAlert = (key: string) => {
        setValidatedTechnicianAlerts((prev) => {
            const next = Array.from(new Set([...prev, key]));
            localStorage.setItem(VALIDATED_TECHNICIAN_ALERTS_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const isTechnicianAlertValidated = (key: string) => validatedTechnicianAlerts.includes(key);

    const { stats = {}, alerts = [] } = (data as any) || {};
    const importAlerts = Array.isArray(importOverview?.alertOrders) ? importOverview!.alertOrders : [];
    const technicalVisitsCount = useMemo(
        () => Number(stats.appelsOffreTechnicalVisitsToDo || 0),
        [stats.appelsOffreTechnicalVisitsToDo]
    );

    const visitAlerts = useMemo(
        () => (Array.isArray(alerts) ? alerts : []).filter((alert: any) => alert?.alertKind === "MAINTENANCE" || alert?.alertKind === "APPEL_OFFRE_VISIT" || alert?.alertKind === "TECHNICAL_VISIT_DUE"),
        [alerts]
    );
    const quoteApprovedAlerts = useMemo(
        () => (Array.isArray(alerts) ? alerts : []).filter((alert: any) => alert?.alertKind === "QUOTE_APPROVED"),
        [alerts]
    );
    const staleRepairStatusAlerts = useMemo(
        () => (Array.isArray(alerts) ? alerts : []).filter((alert: any) => alert?.alertKind === "REPAIR_STATUS_STALE"),
        [alerts]
    );
    const visibleStaleRepairStatusAlerts = useMemo(
        () => staleRepairStatusAlerts.filter((alert: any) => !isTechnicianAlertValidated(`stale-repair-status-${alert.id}`)),
        [staleRepairStatusAlerts, validatedTechnicianAlerts]
    );
    const visibleQuoteApprovedAlerts = useMemo(
        () => quoteApprovedAlerts.filter((alert: any) => !isTechnicianAlertValidated(`quote-approved-${alert.id}`)),
        [quoteApprovedAlerts, validatedTechnicianAlerts]
    );
    const visibleVisitAlerts = useMemo(
        () => visitAlerts.filter((alert: any) => !isTechnicianAlertValidated(`visit-alert-${alert.id}`)),
        [visitAlerts, validatedTechnicianAlerts]
    );
    const visibleImportAlerts = useMemo(
        () => importAlerts.filter((order: any) => !isTechnicianAlertValidated(`import-alert-${order.id}`)).slice(0, 4),
        [importAlerts, validatedTechnicianAlerts]
    );
    const hasTechnicianAlerts = visibleStaleRepairStatusAlerts.length > 0
        || visibleQuoteApprovedAlerts.length > 0
        || visibleVisitAlerts.length > 0
        || visibleImportAlerts.length > 0;
    const statCards = useMemo(
        () => [
            { label: "Tickets du jour", value: stats.ticketsToday || 0 },
            { label: "Tickets affectés", value: stats.totalAssigned || 0 },
            { label: "Visites techniques à réaliser", value: technicalVisitsCount }
        ],
        [stats, technicalVisitsCount]
    );

    if (loading) {
        return (
            <div style={{ height: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 className="animate-spin" size={32} color="var(--primary-blue)" />
                <style jsx>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .animate-spin { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        );
    }

    return (
        <div className={styles.dashboardContainer}>
            <section className={panelStyles.sectionCard}>
                <h2 className={panelStyles.sectionTitle}>
                    <Ticket size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Tableau de bord
                </h2>
                <h3 className={panelStyles.sectionTitle} style={{ fontSize: "1rem", marginTop: "0.85rem" }}>Tickets</h3>
                <div className={panelStyles.metricGrid} style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                    {statCards.map((item) => (
                        <article key={item.label} className={panelStyles.metricCard}>
                            <div className={panelStyles.metricLabel}>{item.label}</div>
                            <div className={panelStyles.metricValue}>{item.value}</div>
                        </article>
                    ))}
                </div>
            </section>

            <section className={panelStyles.sectionCard}>
                <div className={panelStyles.itemMain}>
                    <h2 className={panelStyles.sectionTitle} style={{ marginBottom: 0 }}>Alertes technicien</h2>
                </div>
                <div style={{ display: "grid", gap: "0.8rem", marginTop: "1rem" }}>
                    {!hasTechnicianAlerts ? (
                        <div className={panelStyles.empty}>Aucune alerte prioritaire pour le moment.</div>
                    ) : null}

                        {visibleStaleRepairStatusAlerts.map((alert: any) => {
                            const alertKey = `stale-repair-status-${alert.id}`;
                            return (
                                <article key={alertKey} className={panelStyles.listItem} style={ALERT_CARD_STYLE}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                                        <div>
                                            <div className={panelStyles.itemTitle}>{alert.title}</div>
                                        </div>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                            <button type="button" onClick={() => validateTechnicianAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                                ✔
                                            </button>
                                            <span className={panelStyles.statusBadge} style={ALERT_BADGE_STYLE}>
                                                {formatTicketReference(alert)}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                        {visibleQuoteApprovedAlerts.map((alert: any) => {
                            const alertKey = `quote-approved-${alert.id}`;
                            return (
                            <article key={alertKey} className={panelStyles.listItem} style={ALERT_CARD_STYLE}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                                    <div>
                                        <div className={panelStyles.itemTitle}>Devis validé par le client</div>
                                    </div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button type="button" onClick={() => validateTechnicianAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                            ✔
                                        </button>
                                        <span className={panelStyles.statusBadge} style={ALERT_BADGE_STYLE}>
                                            {formatTicketReference(alert)}
                                        </span>
                                    </div>
                                </div>
                            </article>
                            );
                        })}
                        {visibleVisitAlerts.map((alert: any) => {
                            const scheduledLabel = alert?.scheduledDate
                                ? new Date(alert.scheduledDate).toLocaleDateString("fr-FR")
                                : "Date non renseignée";
                            const equipmentLabel = String(alert?.equipment?.name || alert?.equipment?.serialNumber || "Matériel non renseigné").trim();
                            const alertKey = `visit-alert-${alert.id}`;
                            const isTechnicalVisitDue = alert?.alertKind === "TECHNICAL_VISIT_DUE";

                            return (
                                <article key={alertKey} className={panelStyles.listItem} style={ALERT_CARD_STYLE}>
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                                        <div>
                                            <div className={panelStyles.itemTitle} style={{ color: "#111827" }}>
                                                {isTechnicalVisitDue ? "Il reste deux jours pour la visite technique" : alert.title}
                                            </div>
                                            {equipmentLabel ? <div style={{ color: "#111827", marginTop: "0.25rem" }}>{equipmentLabel}</div> : null}
                                            <div style={{ color: "#475569", fontSize: "0.9rem", marginTop: "0.25rem" }}>Prévue le {scheduledLabel}</div>
                                        </div>
                                        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                            <button type="button" onClick={() => validateTechnicianAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                                ✔
                                            </button>
                                            <span className={panelStyles.statusBadge} style={ALERT_BADGE_STYLE}>
                                                {isTechnicalVisitDue ? (alert?.marketNumber || "Marché") : (alert?.visitKindLabel || "Visite")}
                                            </span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                        {visibleImportAlerts.map((order: any) => {
                            const alertKey = `import-alert-${order.id}`;
                            return (
                            <article key={alertKey} className={panelStyles.listItem} style={{ ...ALERT_CARD_STYLE, padding: "0.6rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                                    <div className={panelStyles.itemTitle}>Pièce reçue DP</div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button type="button" onClick={() => validateTechnicianAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                            ✔
                                        </button>
                                        <span className={panelStyles.statusBadge} style={ALERT_BADGE_STYLE}>{order.ticket?.id ? formatTicketReference(order.ticket) : "Pièce reçue DP"}</span>
                                    </div>
                                </div>
                            </article>
                            );
                        })}
                </div>
            </section>
        </div>
    );
}


