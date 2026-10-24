"use client";

/*
Commentaire simple du fichier :
- Espace : responsable-technique.
- Partie : tableau de bord.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { hasPendingQuoteApprovedAlert } from "@/metier/workflow-technicien";

const MANAGER_DECISION_STATUSES = ["PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "QUOTE_APPROVED"];
const DASHBOARD_REFRESH_MS = 60000;
const UNASSIGNED_TICKET_ALERT_MS = 24 * 60 * 60 * 1000;
const VALIDATED_ALERTS_STORAGE_KEY = "responsableTechniqueValidatedAlerts";
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
const ACTIVE_FOLLOW_UP_STATUSES = ["DIAGNOSTIC", "WAITING_PARTS", "REPAIR", "READY_FOR_DELIVERY"];

function formatTicketReference(source: any): string {
    const directReference = String(source?.ticketReference || "").trim();
    if (directReference) return directReference;

    const rawDisplay = String(source?.displayId || "").trim();
    if (/^\d{8}$/.test(rawDisplay)) return rawDisplay;

    const rawId = String(source?.id || "").trim();
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

function formatTicketTitle(source: any): string {
    return `Ticket #${formatTicketReference(source)}`;
}

function toTimestamp(value: unknown): number {
    const parsed = value ? new Date(String(value)).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
}

function getAssignmentWaitingReferenceAt(reclamation: any): string | null {
    const status = String(reclamation?.status || "").trim().toUpperCase();
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    const matchingHistory = history.find((entry: any) => {
        const action = String(entry?.action || "").trim().toUpperCase();
        const note = String(entry?.note || "").trim().toLowerCase();

        if (action.startsWith("STATUS CHANGED:")) {
            return MANAGER_DECISION_STATUSES.some((target) => action.includes(`-> ${target}`));
        }
        if (status === "QUOTE_APPROVED") {
            return action === "CLIENT_QUOTE_APPROVED" || action === "QUOTE_CLIENT_APPROVED";
        }
        if (status === "PENDING_TECHNICAL_MANAGER_REVIEW") {
            return action === "MERCHANDISE_INFO_COMPLETED" || action === "MAGASINIER_CONTRACT_REVIEW_VALIDATED";
        }
        if (status === "READY_FOR_TECH_MANAGER_ASSIGNMENT") {
            return action === "ADV_DECISION_TAKEN" || note.includes("responsable technique pour affectation");
        }
        return false;
    });

    return matchingHistory?.createdAt
        || reclamation?.updatedAt
        || reclamation?.ticket?.updatedAt
        || reclamation?.createdAt
        || reclamation?.ticket?.createdAt
        || null;
}

function buildUnassignedTicketAlert(reclamation: any) {
    const ticket = reclamation?.ticket || {};
    if (!MANAGER_DECISION_STATUSES.includes(String(reclamation?.status || "")) || ticket?.assignedToId) return null;

    const referenceAt = getAssignmentWaitingReferenceAt(reclamation);
    const referenceMs = toTimestamp(referenceAt);
    if (!referenceMs) return null;

    const ageMs = Date.now() - referenceMs;
    if (ageMs < UNASSIGNED_TICKET_ALERT_MS) return null;

    return {
        id: `unassigned-overdue-${ticket?.id || reclamation?.id}`,
        ticketId: ticket?.id || null,
        ticketReference: formatTicketReference(ticket),
        customerName: reclamation?.customerName || "",
        deviceModel: reclamation?.deviceModel || "",
        referenceAt,
        ageHours: Math.floor(ageMs / (60 * 60 * 1000))
    };
}

function isActiveFollowUpTicket(ticket: any) {
    const status = String(ticket?.status || "").trim().toUpperCase();
    return Boolean(ticket?.id && ticket?.assignedToId)
        && ACTIVE_FOLLOW_UP_STATUSES.includes(status)
        && !ticket?.closedAt;
}

function getUnassignedAlertKey(alert: any) {
    return `${alert?.id || "unassigned"}-${alert?.referenceAt || ""}`;
}

function getQuoteApprovedAlertKey(alert: any) {
    return String(alert?.id || "");
}

function getImportAlertKey(order: any) {
    return `import-alert-${order?.id || ""}-${order?.receivedDate || order?.updatedAt || ""}`;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getLocalUser() {
    try {
        const raw = localStorage.getItem("user");
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            id: Number(parsed?.id || 0) || null,
            role: String(parsed?.role || "")
        };
    } catch {
        return {
            id: null,
            role: ""
        };
    }
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ResponsableTechniqueDashboardPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [importOverview, setImportOverview] = useState<{ alertOrders: any[]; historyOrders: any[] } | null>(null);
    const [decisionCount, setDecisionCount] = useState(0);
    const [processingCount, setProcessingCount] = useState(0);
    const [quoteApprovedAlerts, setQuoteApprovedAlerts] = useState<any[]>([]);
    const [unassignedTicketAlerts, setUnassignedTicketAlerts] = useState<any[]>([]);
    const [validatedAlerts, setValidatedAlerts] = useState<string[]>([]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(VALIDATED_ALERTS_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            setValidatedAlerts(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
            setValidatedAlerts([]);
        }
    }, []);

    const validateAlert = (key: string) => {
        if (!key) return;
        setValidatedAlerts((current) => {
            const next = Array.from(new Set([...current, key]));
            window.localStorage.setItem(VALIDATED_ALERTS_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);
            try {
                const user = getLocalUser();
                const [importRes, reclamationsRes] = await Promise.all([
                    fetch("/api/import/overview?summary=1&role=RESPONSABLE_TECHNIQUE", { cache: "no-store" }),
                    fetch("/api/reclamations?light=1&includeStoreReview=1&historyLimit=16&skipSanitize=1", {
                        cache: "no-store",
                        headers: {
                            "x-user-role": user.role,
                            "x-user-id": String(user.id || "")
                        }
                    })
                ]);
                const importData = await importRes.json();
                const reclamationsData = await reclamationsRes.json();

                if (cancelled) return;

                setImportOverview({
                    alertOrders: Array.isArray(importData?.alertOrders) ? importData.alertOrders : [],
                    historyOrders: Array.isArray(importData?.historyOrders) ? importData.historyOrders : []
                });

                const reclamationRows = Array.isArray(reclamationsData) ? reclamationsData : [];
                setDecisionCount(
                    reclamationRows.filter((item: any) => MANAGER_DECISION_STATUSES.includes(String(item?.status || "")) && !item?.ticket?.assignedToId).length
                );
                setProcessingCount(
                    reclamationRows.filter((item: any) => isActiveFollowUpTicket(item?.ticket)).length
                );
                setUnassignedTicketAlerts(
                    reclamationRows
                        .map(buildUnassignedTicketAlert)
                        .filter(Boolean)
                        .sort((a: any, b: any) => b.ageHours - a.ageHours)
                );
                setQuoteApprovedAlerts(
                    reclamationRows
                        .map((item: any) => item?.ticket)
                        .filter((ticket: any) => Boolean(ticket?.id))
                        .filter((ticket: any) => hasPendingQuoteApprovedAlert(ticket))
                        .map((ticket: any) => ({
                            id: `quote-approved-${ticket.id}`,
                            ticketReference: ticket?.ticketReference,
                            displayId: ticket?.displayId,
                            createdAt: ticket?.createdAt,
                            title: "Devis validé par le client",
                            equipment: ticket?.equipment
                        }))
                );
            } catch (error) {
                console.error("Responsable technique load error:", error);
                if (!cancelled) {
                    setImportOverview({ alertOrders: [], historyOrders: [] });
                    setDecisionCount(0);
                    setProcessingCount(0);
                    setQuoteApprovedAlerts([]);
                    setUnassignedTicketAlerts([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void fetchData();

        const intervalId = window.setInterval(() => {
            void fetchData();
        }, DASHBOARD_REFRESH_MS);

        // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
        const handleFocusRefresh = () => {
            if (document.visibilityState === "visible") {
                void fetchData();
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

    const importAlerts = Array.isArray(importOverview?.alertOrders) ? importOverview!.alertOrders : [];
    const visibleImportAlerts = useMemo(
        () => importAlerts.filter((order: any) => !validatedAlerts.includes(getImportAlertKey(order))).slice(0, 5),
        [importAlerts, validatedAlerts]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const visibleQuoteApprovedAlerts = useMemo(
        () => quoteApprovedAlerts.filter((alert) => !validatedAlerts.includes(getQuoteApprovedAlertKey(alert))).slice(0, 5),
        [quoteApprovedAlerts, validatedAlerts]
    );
    const visibleUnassignedTicketAlerts = useMemo(
        () => unassignedTicketAlerts.filter((alert) => !validatedAlerts.includes(getUnassignedAlertKey(alert))).slice(0, 5),
        [unassignedTicketAlerts, validatedAlerts]
    );

    if (loading) {
        // Cette partie affiche l interface visible a l ecran.
        return (
            <div style={{ height: "40vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 className="animate-spin" size={28} color="var(--brand-red, #b11226)" />
                <style jsx>{`
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .animate-spin { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        );
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>
                    <Ticket size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Tableau de bord
                </h2>
                <h3 className={styles.sectionTitle} style={{ fontSize: "1rem", marginTop: "0.85rem" }}>Tickets</h3>
                <div className={styles.metricGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                    <div className={styles.metricCard} style={{ minHeight: "112px" }}>
                        <div className={styles.metricLabel}>Affectations en attente</div>
                        <div className={styles.metricValue}>{decisionCount}</div>
                    </div>
                    <div className={styles.metricCard} style={{ minHeight: "112px" }}>
                        <div className={styles.metricLabel}>Tickets en cours de traitement</div>
                        <div className={styles.metricValue}>{processingCount}</div>
                    </div>
                </div>
            </section>

            <section className={styles.sectionCard} style={{ marginTop: "0.85rem" }}>
                <h3 className={styles.sectionTitle}>Alerte responsable technique</h3>
                <div style={{ display: "grid", gap: "0.8rem" }}>
                    {visibleUnassignedTicketAlerts.length === 0 && visibleQuoteApprovedAlerts.length === 0 && visibleImportAlerts.length === 0 ? (
                        <div className={styles.empty}>Aucune alerte prioritaire pour le moment.</div>
                    ) : null}

                    {visibleUnassignedTicketAlerts.map((alert) => {
                        const alertKey = getUnassignedAlertKey(alert);

                        return (
                            <article
                                key={alert.id}
                                className={styles.listItem}
                                style={ALERT_CARD_STYLE}
                            >
                                <div className={styles.itemMain}>
                                    <div>
                                        <div className={styles.itemTitle}>Ticket sans affectation</div>
                                    </div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button type="button" onClick={() => validateAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                            ✔
                                        </button>
                                        <span className={styles.statusBadge} style={ALERT_BADGE_STYLE}>
                                            {alert.ticketReference || "-"}
                                        </span>
                                    </div>
                                </div>
                            </article>
                        );
                    })}

                    {visibleQuoteApprovedAlerts.map((alert) => {
                        const alertKey = getQuoteApprovedAlertKey(alert);
                        return (
                            <article
                                key={alert.id}
                                className={styles.listItem}
                                style={ALERT_CARD_STYLE}
                            >
                                <div className={styles.itemMain}>
                                    <div className={styles.itemTitle}>Devis validé par le client</div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button type="button" onClick={() => validateAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                            ✔
                                        </button>
                                        <span className={styles.statusBadge} style={ALERT_BADGE_STYLE}>{formatTicketReference(alert)}</span>
                                    </div>
                                </div>
                            </article>
                        );
                    })}

                    {visibleImportAlerts.map((order: any) => {
                        const alertKey = getImportAlertKey(order);
                        return (
                            <article key={`import-alert-${order.id}`} className={styles.listItem} style={{ ...ALERT_CARD_STYLE, padding: "0.6rem" }}>
                                <div className={styles.itemMain}>
                                    <div className={styles.itemTitle}>Pièce reçue DP</div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button type="button" onClick={() => validateAlert(alertKey)} style={ALERT_VALIDATE_BUTTON_STYLE} aria-label="Valider l'alerte">
                                            ✔
                                        </button>
                                        <span className={styles.statusBadge} style={ALERT_BADGE_STYLE}>{order.ticket?.id ? formatTicketReference(order.ticket) : "Pièce reçue DP"}</span>
                                    </div>
                                </div>
                            </article>
                        );
                    })}

                </div>
            </section>
        </>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "tableau de bord" de l espace "responsable-technique".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
