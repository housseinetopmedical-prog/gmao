"use client";

/*
Commentaire simple du fichier :
- Espace : admin.
- Partie : tickets.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import {
    formatTicketStatus,
    getChecklistMetadata,
    getUrgencyFromReclamation,
    getUrgencyToneClass,
    URGENCY_LABELS
} from "@/metier/workflow-adv";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    createdAt: string;
    customerName: string;
    contactEmail: string;
    deviceModel: string;
    status: string;
    checklist?: string | null;
    ticket?: {
        id?: number;
        status?: string | null;
        priority?: string | null;
        assignedTo?: {
            id?: number;
            name?: string | null;
            role?: string | null;
        } | null;
        assignedToId?: number | null;
        savHistory?: Array<{
            action?: string | null;
            createdAt?: string | null;
            note?: string | null;
        }> | null;
    } | null;
};

type TopMedicalLimitInput = {
    contractDate: string;
    duration: string;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function cleanText(value: unknown) {
    return String(value || "").trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function hasNonRepareOutcome(history: Array<{ action?: string | null }> | null | undefined) {
    return Array.isArray(history)
        && history.some((entry) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getEtatSavLabel(status: string | null | undefined, hasNonRepare = false) {
    if (hasNonRepare && String(status || "").toUpperCase() === "CLOSED") {
        return "Irréparable";
    }
    return status ? formatTicketStatus(status) : "-";
}

function priorityToUrgencyLevel(priority: string | null | undefined) {
    const normalized = String(priority || "").trim().toUpperCase();
    if (normalized === "LOW") return "1";
    if (normalized === "MEDIUM") return "2";
    if (normalized === "HIGH") return "3";
    if (normalized === "CRITICAL") return "5";
    return "-";
}

function getSavUrgencyLevel(item: Reclamation) {
    const history = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
    const urgencyEntry = [...history].reverse().find((entry) => String(entry?.action || "") === "URGENCY_LEVEL_LOCKED");
    const urgencyMatch = String(urgencyEntry?.note || "").match(/Niveau d'urgence\s*:\s*([1-5])/i);
    if (urgencyMatch?.[1]) return urgencyMatch[1];

    const priorityEntry = [...history].reverse().find((entry) => ["Priority updated", "Priorité mise à jour"].includes(String(entry?.action || "")));
    const priorityMatch = String(priorityEntry?.note || "").match(/->\s*(LOW|MEDIUM|HIGH|CRITICAL)/i);
    return priorityMatch?.[1] ? priorityToUrgencyLevel(priorityMatch[1]) : priorityToUrgencyLevel(item.ticket?.priority);
}

function formatDateOnly(raw: unknown) {
    const value = String(raw || "").trim();
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

function getTicketMerchandiseInfo(item: Reclamation) {
    const metadata = parseChecklistPayload(item.checklist).metadata || {};
    return {
        merchandiseInfo: (metadata as any).merchandiseInfo || {},
        topMedicalWarrantyLimit: (metadata as any).topMedicalWarrantyLimit || {}
    };
}

function getFirstMerchandiseItem(merchandiseInfo: any) {
    const rows = Array.isArray(merchandiseInfo?.equipmentMerchandiseItems) ? merchandiseInfo.equipmentMerchandiseItems : [];
    return rows.find((row: any) => row && typeof row === "object") || {};
}

function getWarrantyLabel(item: Reclamation) {
    const { merchandiseInfo } = getTicketMerchandiseInfo(item);
    const firstItem = getFirstMerchandiseItem(merchandiseInfo);
    const status = String(merchandiseInfo?.warrantyStatus || "").trim().toUpperCase();
    if (status === "UNDER_WARRANTY") return "Sous garantie";
    if (status === "OUT_OF_WARRANTY") return "Hors garantie";
    return String(merchandiseInfo?.warrantyLabel || firstItem?.warrantyLabel || "").trim() || "-";
}

function getSupplierLimitDate(item: Reclamation) {
    const { merchandiseInfo } = getTicketMerchandiseInfo(item);
    const firstItem = getFirstMerchandiseItem(merchandiseInfo);
    return formatDateOnly(firstItem?.warrantyLimitDate || merchandiseInfo?.warrantyLimitDate);
}

function getTopMedicalLimitDate(item: Reclamation) {
    return formatDateOnly(getTopMedicalLimitDateRaw(item));
}

function getTopMedicalLimitDateRaw(item: Reclamation) {
    const { merchandiseInfo, topMedicalWarrantyLimit } = getTicketMerchandiseInfo(item);
    const firstItem = getFirstMerchandiseItem(merchandiseInfo);
    return String(
        firstItem?.topMedicalWarrantyLimitDate
        || firstItem?.advWarrantyLimitDate
        || merchandiseInfo?.topMedicalWarrantyLimitDate
        || merchandiseInfo?.advWarrantyLimitDate
        || topMedicalWarrantyLimit?.limitDate
        || ""
    );
}

function getTopMedicalContractDateRaw(item: Reclamation) {
    const { merchandiseInfo, topMedicalWarrantyLimit } = getTicketMerchandiseInfo(item);
    const firstItem = getFirstMerchandiseItem(merchandiseInfo);
    return String(
        firstItem?.topMedicalWarrantyContractDate
        || merchandiseInfo?.topMedicalWarrantyContractDate
        || topMedicalWarrantyLimit?.contractDate
        || ""
    );
}

function getTopMedicalDurationRaw(item: Reclamation) {
    const { merchandiseInfo, topMedicalWarrantyLimit } = getTicketMerchandiseInfo(item);
    const firstItem = getFirstMerchandiseItem(merchandiseInfo);
    return String(
        firstItem?.topMedicalWarrantyDuration
        || merchandiseInfo?.topMedicalWarrantyDuration
        || topMedicalWarrantyLimit?.duration
        || ""
    );
}

function toInputDate(raw: unknown) {
    const value = String(raw || "").trim();
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
    return parsed.toISOString().slice(0, 10);
}

function parseWarrantyMonths(value: unknown) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return null;
    const yearMatch = text.match(/(\d+)\s*(an|ans|annee|annees|année|années)/i);
    if (yearMatch) return Number(yearMatch[1]) * 12;
    const monthMatch = text.match(/(\d+)\s*(mois|month|months)/i);
    if (monthMatch) return Number(monthMatch[1]);
    const numberMatch = text.match(/\d+/);
    return numberMatch ? Number(numberMatch[0]) : null;
}

function calculateWarrantyLimitDate(contractDate: string, duration: string) {
    const months = parseWarrantyMonths(duration);
    const start = new Date(contractDate);
    if (!contractDate || !months || Number.isNaN(start.getTime())) return "";
    const limit = new Date(start);
    limit.setMonth(limit.getMonth() + months);
    return limit.toISOString().slice(0, 10);
}

function getMerchandiseRows(metadata: any) {
    const rows = metadata?.merchandiseInfo?.equipmentMerchandiseItems;
    return Array.isArray(rows) ? rows : [];
}

function getSupplierWarrantyMonths(metadata: any) {
    const rows = getMerchandiseRows(metadata);
    const rowWarranty = rows
        .map((row: any) => parseWarrantyMonths(row?.warrantyLabel))
        .find((value: number | null) => Boolean(value));
    return rowWarranty || parseWarrantyMonths(metadata?.merchandiseInfo?.warrantyLabel);
}

function getTopMedicalWarrantyMonths(item: Reclamation) {
    const metadata = getChecklistMetadata(item) as any;
    const metadataMonths = parseWarrantyMonths(metadata?.merchandiseInfo?.topMedicalWarrantyDuration);
    if (metadataMonths) return metadataMonths;
    const value = Number((item.ticket as any)?.equipment?.warrantyMonths || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function getPersistedWarrantyStatus(item: Reclamation) {
    const { merchandiseInfo } = getTicketMerchandiseInfo(item);
    const status = String(merchandiseInfo?.warrantyStatus || "").trim().toUpperCase();
    if (status === "UNDER_WARRANTY" || status === "OUT_OF_WARRANTY") return status;

    const label = getWarrantyLabel(item).toLowerCase();
    if (label.includes("sous")) return "UNDER_WARRANTY";
    if (label.includes("hors")) return "OUT_OF_WARRANTY";
    return "";
}

function getTicketCreatorLabel(metadata: any) {
    if (String(metadata?.publicMarketNumber || "").trim()) return "AO";

    const source = String(metadata?.source || "").toUpperCase();
    const submittedByRole = String(metadata?.submittedByRole || "").toUpperCase();

    if (source === "ENTRY_REPAIR_SLIP" || submittedByRole === "RESPONSABLE_FACTURATION") return "Facturation";
    if (source === "CLIENT_FORM" || source === "CLIENT_EDIT" || submittedByRole === "CLIENT") return "Client";
    if (source === "ADV_FORM" || source === "ADV_EDIT" || submittedByRole === "ADV") return "ADV";
    return "-";
}

const DISMISSED_WARRANTY_ALERTS_KEY = "dismissed-short-warranty-alerts";

function readDismissedWarrantyAlerts() {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(DISMISSED_WARRANTY_ALERTS_KEY) || "[]");
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
        return [];
    }
}

function writeDismissedWarrantyAlerts(keys: string[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(DISMISSED_WARRANTY_ALERTS_KEY, JSON.stringify(Array.from(new Set(keys))));
}

function getCurrentUserId() {
    if (typeof window === "undefined") return 1;
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        return Number(user?.id || 0) || 1;
    } catch {
        return 1;
    }
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isFacturationSubmittedTicket(metadata: any) {
    return String(metadata?.source || "").toUpperCase() === "ENTRY_REPAIR_SLIP"
        || String(metadata?.submittedByRole || "").toUpperCase() === "RESPONSABLE_FACTURATION";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isClientSubmittedTicket(metadata: any) {
    const source = String(metadata?.source || "").toUpperCase();
    const submittedByRole = String(metadata?.submittedByRole || "").toUpperCase();
    return source === "CLIENT_FORM" || source === "CLIENT_EDIT" || submittedByRole === "CLIENT";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isAdvDecisionPendingStatus(status: string) {
    return ["PENDING_ADV", "PENDING", "VALIDATED"].includes(status);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isQuoteWorkflowStatus(status: string) {
    return ["PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT"].includes(status);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isPostQualificationWorkflowStatus(status: string) {
    return [
        "PENDING_STORE_REVIEW",
        "PENDING_TECHNICAL_MANAGER_REVIEW",
        "READY_FOR_TECH_MANAGER_ASSIGNMENT",
        "TAKEN_IN_CHARGE",
        "DECISION_OUT_OF_WARRANTY",
        "PENDING_ADV_QUOTE",
        "QUOTE_SENT_TO_CLIENT",
        "QUOTE_APPROVED"
    ].includes(status);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function groupMaterialsByDesignation(materials: ReturnType<typeof getTicketEquipmentItems>) {
    const grouped = new Map<string, { label: string; metaLines: string[]; order: number }>();

    materials.forEach((material, index) => {
        const label = formatEquipmentLabel(material) || "Matériel non renseigné";
        const meta = formatEquipmentMeta(material);
        const key = label.trim().toLowerCase();
        const existing = grouped.get(key);

        if (!existing) {
            grouped.set(key, {
                label,
                metaLines: meta ? [meta] : [],
                order: index
            });
            return;
        }

        if (meta && !existing.metaLines.includes(meta)) {
            existing.metaLines.push(meta);
        }
    });

    return Array.from(grouped.values())
        .sort((left, right) => left.order - right.order)
        .map(({ label, metaLines }) => ({ label, metaLines }));
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getMaterialsSummary(materials: Array<{ label: string; metaLines: string[] }>) {
    if (materials.length === 0) return "Matériel non renseigné";
    return materials
        .map((material) => [material.label, ...material.metaLines].filter(Boolean).join(" · "))
        .join(" | ");
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdminTicketsPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [warrantyChoices, setWarrantyChoices] = useState<Record<number, string>>({});
    const [editingWarranty, setEditingWarranty] = useState<Record<number, boolean>>({});
    const [topMedicalLimitInputs, setTopMedicalLimitInputs] = useState<Record<number, TopMedicalLimitInput>>({});
    const [editingTopMedicalLimit, setEditingTopMedicalLimit] = useState<Record<number, boolean>>({});
    const [savingWarrantyId, setSavingWarrantyId] = useState<number | null>(null);
    const [savingTopMedicalId, setSavingTopMedicalId] = useState<number | null>(null);
    const [dismissedWarrantyAlerts, setDismissedWarrantyAlerts] = useState<string[]>([]);

    const fetchReclamations = async (cancelled = false) => {
        setLoading(true);
        try {
            const response = await fetch("/api/reclamations?light=0&includeStoreReview=1&historyLimit=20", {
                cache: "no-store"
            });
            const data = await response.json().catch(() => []);
            if (!cancelled) {
                const list = Array.isArray(data) ? data : [];
                setReclamations(list);
            }
        } catch (error) {
            console.error("Admin tickets fetch error:", error);
            if (!cancelled) {
                setReclamations([]);
            }
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        let cancelled = false;

        void fetchReclamations(cancelled);
        setDismissedWarrantyAlerts(readDismissedWarrantyAlerts());

        return () => {
            cancelled = true;
        };
    }, []);

    const dismissWarrantyAlert = (key: string) => {
        setDismissedWarrantyAlerts((prev) => {
            const next = Array.from(new Set([...prev, key]));
            writeDismissedWarrantyAlerts(next);
            return next;
        });
    };

    const handleWarrantyChange = async (item: Reclamation, nextWarrantyStatus: string) => {
        const normalizedWarrantyStatus = String(nextWarrantyStatus || "").trim();
        setWarrantyChoices((prev) => ({ ...prev, [item.id]: normalizedWarrantyStatus }));
        if (!["UNDER_WARRANTY", "OUT_OF_WARRANTY"].includes(normalizedWarrantyStatus)) return;

        const metadata = getChecklistMetadata(item) as any;
        const merchandiseInfo = metadata?.merchandiseInfo || {};
        setSavingWarrantyId(item.id);
        try {
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: getCurrentUserId(),
                    allowMerchandiseUpdate: true,
                    merchandiseInfo: {
                        ...merchandiseInfo,
                        warrantyStatus: normalizedWarrantyStatus,
                        updatedAt: new Date().toISOString(),
                        updatedByUserId: getCurrentUserId()
                    }
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.error || "Erreur pendant l'enregistrement de la garantie.");
            setEditingWarranty((prev) => ({ ...prev, [item.id]: false }));
            await fetchReclamations(false);
        } catch (error: any) {
            alert(error?.message || "Erreur pendant l'enregistrement de la garantie.");
        } finally {
            setSavingWarrantyId(null);
        }
    };

    const handleTopMedicalLimitSave = async (item: Reclamation) => {
        const warrantyInput = topMedicalLimitInputs[item.id] || {
            contractDate: getTopMedicalContractDateRaw(item),
            duration: getTopMedicalDurationRaw(item)
        };
        const selectedContractDate = String(warrantyInput.contractDate || "").trim();
        const selectedDuration = String(warrantyInput.duration || "").trim();
        const selectedLimitDate = calculateWarrantyLimitDate(selectedContractDate, selectedDuration);
        if (!selectedContractDate || !selectedDuration || !selectedLimitDate) {
            alert("Veuillez renseigner la date du contrat et la durée de garantie Top Medical.");
            return;
        }

        const metadata = getChecklistMetadata(item) as any;
        const merchandiseInfo = metadata?.merchandiseInfo || {};
        const rows = Array.isArray(merchandiseInfo.equipmentMerchandiseItems) ? merchandiseInfo.equipmentMerchandiseItems : [];
        const nextMerchandiseInfo = {
            ...merchandiseInfo,
            topMedicalWarrantyContractDate: selectedContractDate || null,
            topMedicalWarrantyDuration: selectedDuration || null,
            topMedicalWarrantyLimitDate: selectedLimitDate,
            advWarrantyLimitDate: selectedLimitDate,
            equipmentMerchandiseItems: rows.map((row: any) => ({
                ...row,
                topMedicalWarrantyContractDate: selectedContractDate || null,
                topMedicalWarrantyDuration: selectedDuration || null,
                topMedicalWarrantyLimitDate: selectedLimitDate,
                advWarrantyLimitDate: selectedLimitDate
            })),
            updatedAt: new Date().toISOString(),
            updatedByUserId: getCurrentUserId()
        };
        const nextTopMedicalWarrantyLimit = {
            contractDate: selectedContractDate || null,
            duration: selectedDuration || null,
            limitDate: selectedLimitDate
        };

        setSavingTopMedicalId(item.id);
        try {
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: getCurrentUserId(),
                    allowMerchandiseUpdate: true,
                    merchandiseInfo: nextMerchandiseInfo,
                    topMedicalWarrantyLimit: nextTopMedicalWarrantyLimit,
                    metadata: {
                        ...metadata,
                        merchandiseInfo: nextMerchandiseInfo,
                        topMedicalWarrantyLimit: nextTopMedicalWarrantyLimit
                    }
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload?.error || "Erreur pendant l'enregistrement de la date limite Top Medical.");
            setEditingTopMedicalLimit((prev) => ({ ...prev, [item.id]: false }));
            setTopMedicalLimitInputs((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
            await fetchReclamations(false);
        } catch (error: any) {
            alert(error?.message || "Erreur pendant l'enregistrement de la date limite Top Medical.");
        } finally {
            setSavingTopMedicalId(null);
        }
    };

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const sorted = useMemo(
        () =>
            [...reclamations].sort((a, b) => {
                const leftTicketId = Number(a.ticket?.id || Number.MAX_SAFE_INTEGER);
                const rightTicketId = Number(b.ticket?.id || Number.MAX_SAFE_INTEGER);
                if (leftTicketId !== rightTicketId) {
                    return leftTicketId - rightTicketId;
                }

                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            }),
        [reclamations]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const visibleTickets = useMemo(
        () =>
            sorted.filter((item) => {
                const status = String(item.status || "").toUpperCase();
                const metadata = getChecklistMetadata(item) as any;
                const historyEntries = Array.isArray(item?.ticket?.savHistory) ? item.ticket.savHistory : [];
                const ticketStatus = String(item?.ticket?.status || "").toUpperCase();
                const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
                const hasNonRepare = hasNonRepareOutcome(historyEntries);
                const isReadyForAdministrativeClosure = !isAdministrativelyClosed
                    && (ticketStatus === "READY_FOR_DELIVERY" || (ticketStatus === "CLOSED" && hasNonRepare));
                const hasWorkflowTicket = Boolean(item.ticket?.id) && !isAdministrativelyClosed;
                const remainsVisibleInWorkflow = ticketStatus !== "CLOSED" || isReadyForAdministrativeClosure;

                if (!hasWorkflowTicket || !remainsVisibleInWorkflow) {
                    return false;
                }

                if (isReadyForAdministrativeClosure) {
                    return true;
                }

                if (isAdvDecisionPendingStatus(status)) {
                    return true;
                }

                if (isQuoteWorkflowStatus(status)) {
                    return isFacturationSubmittedTicket(metadata) || isClientSubmittedTicket(metadata);
                }

                if (isPostQualificationWorkflowStatus(status) || ticketStatus !== "QUALIFICATION") {
                    return true;
                }

                return false;
            }),
        [sorted]
    );

    const warrantyAlerts = useMemo(
        () =>
            visibleTickets.flatMap((item) => {
                const metadata = getChecklistMetadata(item) as any;
                const supplierWarrantyMonths = getSupplierWarrantyMonths(metadata);
                const topMedicalWarrantyMonths = getTopMedicalWarrantyMonths(item);
                const ticketId = Number(item.ticket?.id || 0);
                const ticketDisplayId = (item.ticket as any)?.ticketReference || (item.ticket as any)?.displayId || ticketId || item.id;
                if (!supplierWarrantyMonths || !topMedicalWarrantyMonths || supplierWarrantyMonths >= topMedicalWarrantyMonths) {
                    return [];
                }

                return [{
                    key: `${item.id}-warranty`,
                    text: `Garantie fournisseur plus courte que la garantie Top Medical pour le ticket #${ticketDisplayId}.`
                }];
            }).filter((alert) => !dismissedWarrantyAlerts.includes(alert.key)),
        [visibleTickets, dismissedWarrantyAlerts]
    );

    if (loading) {
        return <div className={styles.loading}>Chargement des tickets...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.shell}>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Tickets actifs</h2>

                {warrantyAlerts.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.85rem" }}>
                        {warrantyAlerts.map((alert) => (
                            <div key={alert.key} className={styles.listItem} style={{ borderColor: "#f59e0b", background: "#fffbeb", display: "flex", alignItems: "center", gap: "0.55rem" }}>
                                <span className={`${styles.statusBadge} ${styles.statusWarn}`}>Alerte</span>
                                <span style={{ marginLeft: "0.55rem", fontWeight: 700 }}>{alert.text}</span>
                                <button
                                    type="button"
                                    onClick={() => dismissWarrantyAlert(alert.key)}
                                    aria-label="Valider l'alerte"
                                    style={{ marginLeft: "auto", border: "1px solid #86efac", borderRadius: 999, background: "#dcfce7", color: "#166534", fontWeight: 800, padding: "0.28rem 0.7rem", cursor: "pointer" }}
                                >
                                    ✓
                                </button>
                            </div>
                        ))}
                    </div>
                ) : null}

                {visibleTickets.length === 0 ? (
                    <div className={styles.empty}>Aucun ticket actif pour le moment.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date réception</th>
                                    <th>Client</th>
                                    <th>Créé par</th>
                                    <th>Matériel</th>
                                    <th>Urgence</th>
                                    <th>Urgence SAV</th>
                                    <th>Statut</th>
                                    <th>Affecté à</th>
                                    <th>Garantie</th>
                                    <th>Date limite fournisseur</th>
                                    <th>Date limite Top Medical</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleTickets.map((item) => {
                                    const historyEntries = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
                                    const hasNonRepare = hasNonRepareOutcome(historyEntries);
                                    const urgency = getUrgencyFromReclamation(item);
                                    const materials = groupMaterialsByDesignation(getTicketEquipmentItems(item));
                                    const materialSummary = getMaterialsSummary(materials);
                                    const ticketId = Number(item.ticket?.id || 0);
                                    const ticketDisplayId = (item.ticket as any)?.ticketReference || (item.ticket as any)?.displayId || ticketId;
                                    const ticketStatus = String(item.ticket?.status || "").toUpperCase();
                                    const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
                                    const isReadyForAdministrativeClosure = !isAdministrativelyClosed
                                        && (ticketStatus === "READY_FOR_DELIVERY" || (ticketStatus === "CLOSED" && hasNonRepare));
                                    const savUrgencyLevel = getSavUrgencyLevel(item);
                                    const metadata = getChecklistMetadata(item) as any;
                                    const creatorLabel = getTicketCreatorLabel(metadata);
                                    const persistedWarrantyStatus = getPersistedWarrantyStatus(item);
                                    const warrantyChoice = warrantyChoices[item.id] || persistedWarrantyStatus;
                                    const isWarrantyValidated = Boolean(persistedWarrantyStatus);
                                    const isEditingWarranty = Boolean(editingWarranty[item.id]);
                                    const storedTopMedicalContractDate = getTopMedicalContractDateRaw(item);
                                    const storedTopMedicalDuration = getTopMedicalDurationRaw(item);
                                    const storedTopMedicalLimitDate = getTopMedicalLimitDateRaw(item);
                                    const topMedicalInput = topMedicalLimitInputs[item.id] || {
                                        contractDate: storedTopMedicalContractDate,
                                        duration: storedTopMedicalDuration
                                    };
                                    const calculatedTopMedicalLimit = calculateWarrantyLimitDate(topMedicalInput.contractDate, topMedicalInput.duration) || storedTopMedicalLimitDate;
                                    const hasTopMedicalLimit = Boolean(storedTopMedicalLimitDate);
                                    const isEditingTopMedical = Boolean(editingTopMedicalLimit[item.id]);
                                    const showTopMedicalFields = !hasTopMedicalLimit || isEditingTopMedical;
                                    const assignedName = cleanText(item.ticket?.assignedTo?.name);

                                    // Cette partie affiche l interface visible a l ecran.
                                    return (
                                        <Fragment key={item.id}>
                                            <tr>
                                                <td>
                                                    <div className={styles.itemMeta}>{new Date(item.createdAt).toLocaleString("fr-FR")}</div>
                                                    {ticketId > 0 ? (
                                                        <Link href={`/admin/tickets/${ticketId}?vue=historique`} className={styles.itemTitle} style={{ textDecoration: "none", marginTop: "0.35rem", display: "inline-block" }}>
                                                            #{ticketDisplayId}
                                                        </Link>
                                                    ) : null}
                                                </td>
                                                <td>
                                                    <div className={styles.itemTitle}>{cleanText(item.customerName) || "Client non renseigné"}</div>
                                                    <div className={styles.itemMeta}>{cleanText(item.contactEmail) || "-"}</div>
                                                </td>
                                                <td>
                                                    <span className={styles.statusBadge} style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3" }}>
                                                        {creatorLabel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className={styles.itemTitle}>{cleanText(item.deviceModel) || "Matériel non renseigné"}</div>
                                                    <div className={styles.itemMeta}>{materialSummary}</div>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(urgency)]}`}>
                                                        {URGENCY_LABELS[urgency]}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={styles.statusBadge} style={{ background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" }}>
                                                        {savUrgencyLevel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${isReadyForAdministrativeClosure ? styles.statusSuccess : styles.statusWarn}`}>
                                                        {getEtatSavLabel(item.ticket?.status, hasNonRepare)}
                                                    </span>
                                                </td>
                                                <td>
                                                    {assignedName || "-"}
                                                </td>
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch", minWidth: 170 }}>
                                                        <select
                                                            className={styles.select}
                                                            value={warrantyChoice}
                                                            onChange={(event) => void handleWarrantyChange(item, event.target.value)}
                                                            disabled={savingWarrantyId === item.id || (isWarrantyValidated && !isEditingWarranty)}
                                                            style={{ minWidth: "145px", padding: "0.5rem 0.65rem" }}
                                                        >
                                                            <option value="">{savingWarrantyId === item.id ? "Enregistrement..." : "Garantie"}</option>
                                                            <option value="UNDER_WARRANTY">Sous garantie</option>
                                                            <option value="OUT_OF_WARRANTY">Hors garantie</option>
                                                        </select>
                                                        {isWarrantyValidated && !isEditingWarranty ? (
                                                            <button
                                                                className="btn btn-outline"
                                                                type="button"
                                                                onClick={() => setEditingWarranty((prev) => ({ ...prev, [item.id]: true }))}
                                                                disabled={savingWarrantyId === item.id}
                                                            >
                                                                Modifier
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>{getSupplierLimitDate(item)}</td>
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch", minWidth: 210 }}>
                                                        {showTopMedicalFields ? (
                                                            <>
                                                                <input
                                                                    className={styles.input}
                                                                    type="date"
                                                                    value={toInputDate(topMedicalInput.contractDate)}
                                                                    onChange={(event) => setTopMedicalLimitInputs((prev) => ({
                                                                        ...prev,
                                                                        [item.id]: {
                                                                            contractDate: event.target.value,
                                                                            duration: prev[item.id]?.duration ?? topMedicalInput.duration
                                                                        }
                                                                    }))}
                                                                    disabled={savingTopMedicalId === item.id}
                                                                    title="Date du contrat de garantie"
                                                                />
                                                                <input
                                                                    className={styles.input}
                                                                    value={topMedicalInput.duration}
                                                                    onChange={(event) => setTopMedicalLimitInputs((prev) => ({
                                                                        ...prev,
                                                                        [item.id]: {
                                                                            contractDate: prev[item.id]?.contractDate ?? topMedicalInput.contractDate,
                                                                            duration: event.target.value
                                                                        }
                                                                    }))}
                                                                    disabled={savingTopMedicalId === item.id}
                                                                    placeholder="Durée, ex: 12 mois"
                                                                    title="Durée de garantie"
                                                                />
                                                                <div className={styles.itemMeta}>Limite: {formatDateOnly(calculatedTopMedicalLimit)}</div>
                                                                <button
                                                                    className="btn btn-outline"
                                                                    type="button"
                                                                    onClick={() => void handleTopMedicalLimitSave(item)}
                                                                    disabled={savingTopMedicalId === item.id || !calculateWarrantyLimitDate(topMedicalInput.contractDate, topMedicalInput.duration)}
                                                                >
                                                                    {savingTopMedicalId === item.id ? "..." : "Enregistrer"}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className={styles.itemMeta}>Limite: {formatDateOnly(calculatedTopMedicalLimit)}</div>
                                                                <button
                                                                    className="btn btn-outline"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setTopMedicalLimitInputs((prev) => ({
                                                                            ...prev,
                                                                            [item.id]: {
                                                                                contractDate: storedTopMedicalContractDate,
                                                                                duration: storedTopMedicalDuration
                                                                            }
                                                                        }));
                                                                        setEditingTopMedicalLimit((prev) => ({ ...prev, [item.id]: true }));
                                                                    }}
                                                                    disabled={savingTopMedicalId === item.id}
                                                                >
                                                                    Modifier
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {ticketId > 0 ? (
                                                        <>
                                                            <Link className="btn btn-outline" href={`/admin/tickets/${ticketId}?vue=detail`}>
                                                            Détail
                                                            </Link>
                                                            <Link className="btn btn-outline" href={`/admin/tickets/${ticketId}?vue=suivi`} style={{ marginLeft: "0.5rem" }}>
                                                                Suivi
                                                            </Link>
                                                        </>
                                                    ) : (
                                                        <span className={styles.itemMeta}>-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "tickets" de l espace "admin".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
