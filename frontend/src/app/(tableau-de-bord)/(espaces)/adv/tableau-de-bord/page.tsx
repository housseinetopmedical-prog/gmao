"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : dashboard.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { Ticket } from "lucide-react";
import styles from "../adv.module.css";
import { getChecklistMetadata, reclamationHoursAgo, updatedHoursAgo } from "@/metier/workflow-adv";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import { formatEquipmentLabel, getTicketEquipmentItems } from "@/metier/materiel-ticket";

const ALERT_CARD_STYLE = { border: "1px solid #1f1f1f", background: "#ffffff" };
const ALERT_NUMBER_BADGE_STYLE = {
    background: "#fff1f2",
    border: "1px solid #fecaca",
    color: "#b00020",
    borderRadius: 999,
    padding: "0.22rem 0.65rem",
    fontWeight: 800
};
const ALERT_CHECK_STYLE = {
    border: "1px solid #86efac",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 800,
    padding: "0.28rem 0.7rem",
    cursor: "pointer"
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function cleanText(value: unknown) {
    return String(value || "").trim();
}

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketItem = {
    id: number;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    assignedToId?: number | null;
    estimatedEndDate?: string | null;
    updatedAt: string;
    reclamation?: {
        createdAt?: string | null;
    } | null;
    equipment?: {
        name?: string | null;
        client?: string | null;
    } | null;
    savHistory?: Array<{
        action?: string | null;
        createdAt?: string | null;
        note?: string | null;
        user?: {
            role?: string | null;
        } | null;
    }>;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ReclamationItem = {
    id: number;
    status: string;
    customerName: string;
    deviceModel: string;
    serialNumber: string;
    interventionType?: string | null;
    description?: string;
    createdAt: string;
    updatedAt: string;
    checklist?: string | null;
    ticket?: {
        id: number;
        status: string;
        priority?: string | null;
        savHistory?: Array<{
            action?: string | null;
            createdAt?: string | null;
            note?: string | null;
            user?: {
                role?: string | null;
            } | null;
        }>;
        ticketReference?: string | null;
        displayId?: number | string | null;
        updatedAt?: string | null;
        createdAt?: string | null;
        assignedTo?: {
            id: number;
            name: string;
        } | null;
    } | null;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function MetricCard({ label, value }: { label: string; value: number }) {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <article className={styles.metricCard}>
            <div className={styles.metricLabel}>{label}</div>
            <div className={styles.metricValue}>{value}</div>
        </article>
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function uniqueByKey<T extends { key: string }>(items: T[]) {
    const seen = new Set<string>();
    return items.filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
    });
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getMaterialItems(item: ReclamationItem) {
    const metadata = getChecklistMetadata(item) as any;
    const materialName = cleanText(metadata?.entryRepairSlip?.designation)
        || cleanText(metadata?.equipmentName)
        || cleanText(item.deviceModel);

    const items = getTicketEquipmentItems({
        checklist: item.checklist,
        deviceModel: item.deviceModel,
        serialNumber: item.serialNumber,
        equipmentName: materialName,
        description: item.description
    });

    if (items.length > 0) {
        return items.map((entry) => ({
            ...entry,
            designation: materialName || cleanText(entry.designation) || cleanText(item.deviceModel)
        }));
    }

    return [{
        index: 0,
        designation: materialName,
        serialNumber: item.serialNumber,
        pn: cleanText(metadata?.entryRepairSlip?.pn) || cleanText(metadata?.pn),
        articleCode: "",
        quantity: 1
    }];
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function renderMaterialLines(item: ReclamationItem, keyPrefix: string) {
    const metadata = getChecklistMetadata(item) as any;
    const materialItems = getMaterialItems(item);

    return materialItems.map((material, index) => {
        const label = formatEquipmentLabel(material) || "Matériel non renseigné";
        const model = cleanText(metadata?.model) || cleanText(item.deviceModel);
        const fallbackSerial = cleanText(item.serialNumber);
        const rawSerial = cleanText(material.serialNumber);
        const serialLooksLikeModel = rawSerial.length > 0 && (
            rawSerial.toLowerCase() === model.toLowerCase()
            || rawSerial.toLowerCase() === label.toLowerCase()
            || !/\d/.test(rawSerial)
        );
        const serialNumber = serialLooksLikeModel && fallbackSerial ? fallbackSerial : rawSerial;
        const pn = cleanText(material.pn);
        const showSerial = Boolean(serialNumber) && serialNumber.toLowerCase() !== label.toLowerCase();

        // Cette partie affiche l interface visible a l ecran.
        return (
            <div key={`${keyPrefix}-${item.id}-${index}`}>
                <div className={styles.itemMeta}>{label}</div>
                {showSerial ? <div className={styles.itemMeta}>SN: {serialNumber}</div> : null}
                {pn ? <div className={styles.itemMeta}>PN: {pn}</div> : null}
            </div>
        );
    });
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeInterventionType(value: unknown) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "WORKSHOP" || normalized === "EN ATELIER" || normalized === "ATELIER") return "WORKSHOP";
    if (normalized === "SITE" || normalized === "SUR SITE") return "SITE";
    return "";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isActiveDashboardTicket(ticket: { status?: string | null; savHistory?: Array<{ action?: string | null; createdAt?: string | null; note?: string | null }> } | null | undefined) {
    return String(ticket?.status || "").toUpperCase() !== "CLOSED" && !getAdministrativeClosureAt(ticket?.savHistory || []);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isQuotePendingReclamation(status: string | null | undefined) {
    const normalized = String(status || "").toUpperCase();
    return ["PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_REJECTED"].includes(normalized);
}

function isFilled(value: unknown) {
    return String(value || "").trim().length > 0;
}

function getMerchandiseRows(metadata: any) {
    const rows = metadata?.merchandiseInfo?.equipmentMerchandiseItems;
    return Array.isArray(rows) ? rows : [];
}

function isMerchandiseInfoComplete(metadata: any) {
    const merchandiseInfo = metadata?.merchandiseInfo || {};
    const rows = getMerchandiseRows(metadata);
    if (rows.length > 0) {
        return rows.every((row: any) =>
            isFilled(row?.articleCode)
            && isFilled(row?.warrantyLabel)
            && isFilled(row?.invoiceDate)
            && isFilled(row?.shippingDate)
            && isFilled(row?.warrantyLimitDate)
        );
    }

    return isFilled(merchandiseInfo?.articleCode)
        && isFilled(merchandiseInfo?.warrantyLabel)
        && isFilled(merchandiseInfo?.invoiceDate)
        && isFilled(merchandiseInfo?.shippingDate)
        && isFilled(merchandiseInfo?.warrantyLimitDate);
}

function hasSavStatusUpdate(ticket: TicketItem | ReclamationItem["ticket"] | null | undefined) {
    const ticketStatus = String(ticket?.status || "").toUpperCase();
    if (["DIAGNOSTIC", "DECISION", "PENDING_PARTS", "REPAIR", "QUALITY_TEST", "READY_FOR_DELIVERY"].includes(ticketStatus)) {
        return true;
    }

    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    return history.some((entry) => {
        const action = String(entry?.action || "").trim();
        const normalizedAction = action.toUpperCase();
        return action === "INTERVENTION_LOG"
            || action === "Progress update"
            || normalizedAction.startsWith("STATUS CHANGED:")
            || normalizedAction === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
            || normalizedAction === "INTERVENTION_VALIDATED";
    });
}

function hasNonRepareOutcome(history: Array<{ action?: string | null }> | null | undefined) {
    return Array.isArray(history)
        && history.some((entry) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

function isReadyForAdvTreatment(item: ReclamationItem) {
    const historyEntries = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
    const ticketStatus = String(item.ticket?.status || "").toUpperCase();
    const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
    return Boolean(item.ticket?.id)
        && !isAdministrativelyClosed
        && (ticketStatus === "READY_FOR_DELIVERY" || ticketStatus === "NON_REPARE" || (ticketStatus === "CLOSED" && hasNonRepareOutcome(historyEntries)));
}

function isDpInfoLate(item: ReclamationItem) {
    const status = String(item.status || "").toUpperCase();
    const relevantStatuses = ["PENDING_STORE_REVIEW", "PENDING_ADV_VERIFICATION", "PENDING_TECHNICAL_MANAGER_REVIEW", "PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED", "TAKEN_IN_CHARGE"];
    const metadata = getChecklistMetadata(item) as any;
    if (!relevantStatuses.includes(status) || isMerchandiseInfoComplete(metadata)) return false;

    const referenceDate = metadata?.merchandiseInfo?.updatedAt || metadata?.merchandiseInfo?.filledAt || item.updatedAt || item.createdAt;
    const referenceTime = new Date(String(referenceDate || "")).getTime();
    if (!Number.isFinite(referenceTime)) return false;
    return Date.now() - referenceTime > 24 * 60 * 60 * 1000;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getAlertToneClass(level: string) {
    const normalized = String(level || "").toLowerCase();
    if (normalized.includes("critique")) return styles.statusDanger;
    if (normalized.includes("élev") || normalized.includes("eleve")) return styles.statusWarn;
    return styles.statusInfo;
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvDashboardPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketItem[]>([]);
    const [reclamations, setReclamations] = useState<ReclamationItem[]>([]);
    const [validatedClientUpdateAlerts, setValidatedClientUpdateAlerts] = useState<string[]>([]);
    const [validatedQuoteApprovedAlerts, setValidatedQuoteApprovedAlerts] = useState<string[]>([]);
    const [validatedAdvAlerts, setValidatedAdvAlerts] = useState<string[]>([]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem("advValidatedClientUpdateAlerts");
            const parsed = raw ? JSON.parse(raw) : [];
            setValidatedClientUpdateAlerts(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
            setValidatedClientUpdateAlerts([]);
        }
    }, []);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem("advValidatedQuoteApprovedAlerts");
            const parsed = raw ? JSON.parse(raw) : [];
            setValidatedQuoteApprovedAlerts(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
            setValidatedQuoteApprovedAlerts([]);
        }
    }, []);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem("advValidatedAlerts");
            const parsed = raw ? JSON.parse(raw) : [];
            setValidatedAdvAlerts(Array.isArray(parsed) ? parsed.map(String) : []);
        } catch {
            setValidatedAdvAlerts([]);
        }
    }, []);

    const validateClientUpdateAlert = (key: string) => {
        setValidatedClientUpdateAlerts((current) => {
            const next = Array.from(new Set([...current, key]));
            window.localStorage.setItem("advValidatedClientUpdateAlerts", JSON.stringify(next));
            return next;
        });
    };

    const validateQuoteApprovedAlert = (key: string) => {
        setValidatedQuoteApprovedAlerts((current) => {
            const next = Array.from(new Set([...current, key]));
            window.localStorage.setItem("advValidatedQuoteApprovedAlerts", JSON.stringify(next));
            return next;
        });
    };

    const validateAdvAlert = (key: string) => {
        setValidatedAdvAlerts((current) => {
            const next = Array.from(new Set([...current, key]));
            window.localStorage.setItem("advValidatedAlerts", JSON.stringify(next));
            return next;
        });
        validateClientUpdateAlert(key);
        validateQuoteApprovedAlert(key);
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [reclamationRes, ticketRes] = await Promise.all([fetch("/api/reclamations?light=1"), fetch("/api/tickets?light=1")]);
                const reclamationData = await reclamationRes.json();
                const ticketData = await ticketRes.json();

                setReclamations(Array.isArray(reclamationData) ? reclamationData : []);
                setTickets(Array.isArray(ticketData) ? ticketData : []);
            } catch (error) {
                console.error("ADV dashboard fetch error:", error);
                setReclamations([]);
                setTickets([]);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const metrics = useMemo(() => {
        const quoteNeededStatuses = ["PENDING_ADV_QUOTE"];
        const openReclamationsWithTicket = reclamations.filter(
            (item) => isActiveDashboardTicket(item.ticket) && !isQuotePendingReclamation(item.status)
        );

        const newReclamations = reclamations.filter((item) => {
            const normalizedStatus = String(item.status || "").toUpperCase();
            return Boolean(item.ticket?.id)
                && isActiveDashboardTicket(item.ticket)
                && !["TAKEN_IN_CHARGE", "NOT_TAKEN_IN_CHARGE"].includes(normalizedStatus);
        }).length;
        const quoteRequired = reclamations.filter((item) => quoteNeededStatuses.includes(String(item.status || ""))).length;
        const ticketsAtelier = openReclamationsWithTicket.filter((item) => normalizeInterventionType(item.interventionType) === "WORKSHOP").length;
        const ticketsOnSite = openReclamationsWithTicket.filter((item) => normalizeInterventionType(item.interventionType) === "SITE").length;
        const activeToProcess = reclamations.filter(isReadyForAdvTreatment).length;
        return {
            newReclamations,
            quoteRequired,
            ticketsAtelier,
            ticketsOnSite,
            activeToProcess
        };
    }, [reclamations, tickets]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const alerts = useMemo(() => {
        const hasTicketExceeded48h = (ticket: TicketItem | null | undefined) => {
            if (!ticket) return false;
            if (hasSavStatusUpdate(ticket)) return false;
            return Math.max(updatedHoursAgo(ticket), reclamationHoursAgo(ticket)) >= 48;
        };
        const items: Array<{ key: string; level: string; message: string; badge: string; kind?: "clientUpdate" | "quoteApproved" }> = [];

        reclamations
            .filter((item) => isActiveDashboardTicket(item.ticket))
            .forEach((item) => {
                const history = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
                const ticketLabel = (item.ticket as any)?.ticketReference || (item.ticket as any)?.displayId || item.ticket?.id || item.id;
                const latestClientUpdate = history
                    .filter((entry) => {
                        if (String(entry?.action || "") !== "CLIENT_UPDATE") return false;
                        const role = String(entry?.user?.role || "").toUpperCase();
                        return role === "CLIENT";
                    })
                    .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime())[0];
                if (latestClientUpdate) {
                    const alertKey = `client-update-${item.id}-${latestClientUpdate.createdAt || item.updatedAt || ""}`;
                    if (!validatedClientUpdateAlerts.includes(alertKey)) {
                        items.push({
                            key: alertKey,
                            level: "Mise à jour ticket par le client",
                            badge: String(ticketLabel),
                            message: "",
                            kind: "clientUpdate"
                        });
                    }
                }

                const latestQuoteApproved = history
                    .filter((entry) => ["CLIENT_QUOTE_APPROVED", "QUOTE_CLIENT_APPROVED"].includes(String(entry?.action || "")))
                    .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime())[0];
                if (latestQuoteApproved || String(item.status || "").toUpperCase() === "QUOTE_APPROVED") {
                    const alertKey = `quote-approved-${item.id}-${latestQuoteApproved?.createdAt || item.updatedAt || ""}`;
                    if (!validatedQuoteApprovedAlerts.includes(alertKey)) {
                        items.push({
                            key: alertKey,
                            level: "Devis validé par le client",
                            badge: String(ticketLabel),
                            message: "",
                            kind: "quoteApproved"
                        });
                    }
                }

                if (isDpInfoLate(item) && !validatedAdvAlerts.includes(`dp-late-${item.id}`)) {
                    items.push({
                        key: `dp-late-${item.id}`,
                        level: "Infos DP incomplètes depuis 24h",
                        badge: String(ticketLabel),
                        message: ""
                    });
                }

                if (item.ticket && hasTicketExceeded48h(item.ticket as TicketItem) && !validatedAdvAlerts.includes(`inactive-${item.id}`)) {
                    items.push({
                        key: `inactive-${item.id}`,
                        level: "Ticket inactif depuis 48h au niveau SAV",
                        badge: String(ticketLabel),
                        message: ""
                    });
                }
            });

        return uniqueByKey(items).slice(0, 12);
    }, [reclamations, tickets, validatedAdvAlerts, validatedClientUpdateAlerts, validatedQuoteApprovedAlerts]);

    if (loading) {
        return <div className={styles.empty}>Chargement du dashboard ADV...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>
                    <Ticket size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Tableau de bord
                </h2>
                <div className={styles.helper} style={{ marginBottom: "0.9rem" }}>
                </div>
                <div className={styles.metricGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                    <MetricCard label="Nv tickets" value={metrics.newReclamations} />
                    <MetricCard label="Tickets en atelier" value={metrics.ticketsAtelier} />
                    <MetricCard label="Tickets sur site" value={metrics.ticketsOnSite} />
                    <MetricCard label="Tickets nécessitant un devis" value={metrics.quoteRequired} />
                    <MetricCard label="Tickets à traiter" value={metrics.activeToProcess} />
                </div>
            </section>

            <section className={styles.sectionCard} style={{ marginTop: "1rem" }}>
                <h3 className={styles.sectionTitle}>Alertes ADV</h3>
                {alerts.length === 0 ? (
                    <div className={styles.empty}>Aucune alerte prioritaire pour le moment.</div>
                ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                        {alerts.map((alert) => (
                            <article key={alert.key} className={styles.listItem} style={ALERT_CARD_STYLE}>
                                <div className={styles.itemMain}>
                                    <div className={styles.itemTitle}>{alert.level}</div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <button
                                            type="button"
                                            onClick={() => validateAdvAlert(alert.key)}
                                            style={ALERT_CHECK_STYLE}
                                            aria-label="Valider l'alerte"
                                        >
                                            ✔
                                        </button>
                                        <span className={styles.statusBadge} style={ALERT_NUMBER_BADGE_STYLE}>{alert.badge}</span>
                                    </div>
                                </div>
                                {alert.message ? <div className={styles.itemMeta}>{alert.message}</div> : null}
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "dashboard" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
