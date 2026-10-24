"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : demandes intervention.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { Fragment, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../adv.module.css";
import {
    formatInterventionType,
    getChecklistMetadata,
    getUrgencyFromReclamation,
    getUrgencyToneClass,
    URGENCY_LABELS
} from "@/metier/workflow-adv";
import { extractClientDocuments, getClientVisibleStatus, isFailureMediaAttachment } from "@/metier/workflow-client";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";

const TOP_MEDICAL_LIMIT_STORAGE_KEY = "adv.topMedicalWarrantyLimits.v1";

type TopMedicalWarrantyLimitDraft = {
    contractDate: string;
    duration: string;
    limitDate: string;
};

function getTopMedicalLimitStorageKey(item: { id: number }) {
    return `reclamation-${item.id}`;
}

function readStoredTopMedicalLimits() {
    if (typeof window === "undefined") return {} as Record<string, TopMedicalWarrantyLimitDraft>;
    try {
        const parsed = JSON.parse(localStorage.getItem(TOP_MEDICAL_LIMIT_STORAGE_KEY) || "{}");
        return parsed && typeof parsed === "object" ? parsed as Record<string, TopMedicalWarrantyLimitDraft> : {};
    } catch {
        return {};
    }
}

function saveStoredTopMedicalLimit(item: { id: number }, value: TopMedicalWarrantyLimitDraft) {
    if (typeof window === "undefined") return;
    const existing = readStoredTopMedicalLimits();
    localStorage.setItem(TOP_MEDICAL_LIMIT_STORAGE_KEY, JSON.stringify({
        ...existing,
        [getTopMedicalLimitStorageKey(item)]: value
    }));
}

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
function getTicketCreatorLabel(metadata: any) {
    if (String(metadata?.publicMarketNumber || "").trim()) return "AO";

    const source = String(metadata?.source || "").toUpperCase();
    const submittedByRole = String(metadata?.submittedByRole || "").toUpperCase();

    if (source === "ENTRY_REPAIR_SLIP" || submittedByRole === "RESPONSABLE_FACTURATION") return "Facturation";
    if (source === "CLIENT_FORM" || source === "CLIENT_EDIT" || submittedByRole === "CLIENT") return "Client";
    if (source === "ADV_FORM" || source === "ADV_EDIT" || submittedByRole === "ADV") return "ADV";
    return "-";
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
        "PENDING_ADV_VERIFICATION",
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
function isPostQualificationEditFlow(item: Reclamation) {
    const currentStatus = String(item.status || "").toUpperCase();
    const ticketStatus = String(item?.ticket?.status || "").toUpperCase();
    return [
        "PENDING_STORE_REVIEW",
        "PENDING_ADV_VERIFICATION",
        "PENDING_TECHNICAL_MANAGER_REVIEW",
        "READY_FOR_TECH_MANAGER_ASSIGNMENT",
        "TAKEN_IN_CHARGE",
        "DECISION_OUT_OF_WARRANTY",
        "PENDING_ADV_QUOTE",
        "QUOTE_SENT_TO_CLIENT",
        "QUOTE_APPROVED"
    ].includes(currentStatus) || ticketStatus !== "QUALIFICATION";
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
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

function calculateWarrantyLimitDate(startDate: unknown, warrantyDuration: unknown) {
    const normalizedDate = String(startDate || "").trim();
    const months = parseWarrantyMonths(warrantyDuration);
    if (!normalizedDate || !months) return "";
    const date = new Date(`${normalizedDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

function formatDateFr(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return "-";
    const date = new Date(text.includes("T") ? text : `${text}T00:00:00`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("fr-FR");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getMerchandiseRows(metadata: any) {
    const rows = metadata?.merchandiseInfo?.equipmentMerchandiseItems;
    return Array.isArray(rows) ? rows : [];
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getSupplierWarrantyMonths(metadata: any) {
    const rows = getMerchandiseRows(metadata);
    const rowWarranty = rows
        .map((item: any) => parseWarrantyMonths(item?.warrantyLabel))
        .find((value: number | null) => Boolean(value));
    return rowWarranty || parseWarrantyMonths(metadata?.merchandiseInfo?.warrantyLabel);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getTopMedicalWarrantyMonths(item: Reclamation) {
    const metadata = getChecklistMetadata(item) as any;
    const metadataMonths = parseWarrantyMonths(metadata?.merchandiseInfo?.topMedicalWarrantyDuration);
    if (metadataMonths) return metadataMonths;
    const value = Number((item.ticket as any)?.equipment?.warrantyMonths || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
}

function isFilled(value: unknown) {
    return String(value || "").trim().length > 0;
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isDpInfoLate(item: Reclamation, metadata: any) {
    const status = String(item.status || "").toUpperCase();
    const relevantStatuses = ["PENDING_STORE_REVIEW", "PENDING_ADV_VERIFICATION", "PENDING_TECHNICAL_MANAGER_REVIEW"];
    if (!relevantStatuses.includes(status) || isMerchandiseInfoComplete(metadata)) return false;

    const referenceDate = metadata?.merchandiseInfo?.updatedAt || metadata?.merchandiseInfo?.filledAt || item.updatedAt || item.createdAt;
    const referenceTime = new Date(String(referenceDate || "")).getTime();
    if (!Number.isFinite(referenceTime)) return false;
    return Date.now() - referenceTime > 24 * 60 * 60 * 1000;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getTicketDisplayLabel(item: Reclamation) {
    const ticketId = Number(item.ticket?.id || 0);
    return String((item.ticket as any)?.ticketReference || item.ticket?.displayId || ticketId || item.id);
}

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    createdAt: string;
    updatedAt?: string | null;
    customerName: string;
    contactEmail: string;
    phone?: string | null;
    deviceModel: string;
    serialNumber: string;
    description: string;
    status: string;
    interventionType?: string | null;
    checklist?: string | null;
    attachmentUrl?: string | null;
    ticket?: {
        id?: number;
        displayId?: number;
        ticketReference?: string | null;
        status?: string | null;
        priority?: string | null;
        equipment?: {
            blDate?: string | null;
            warrantyMonths?: number | null;
        } | null;
        assignedTo?: {
            id?: number;
            name?: string;
        } | null;
        savHistory?: Array<{
            action?: string | null;
            note?: string | null;
        }> | null;
    } | null;
};

function priorityToSavUrgencyLevel(priority: string | null | undefined) {
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
    return priorityMatch?.[1] ? priorityToSavUrgencyLevel(priorityMatch[1]) : priorityToSavUrgencyLevel(item.ticket?.priority);
}

function getWarrantyStatusFromHistory(item: Reclamation) {
    const history = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
    const decision = [...history].reverse().find((entry) => String(entry?.action || "") === "ADV_QUALIFICATION");
    const note = String(decision?.note || "").toLowerCase();
    if (note.includes("hors garantie")) return "OUT_OF_WARRANTY";
    if (note.includes("sous garantie")) return "UNDER_WARRANTY";
    return "";
}

function getPersistedWarrantyStatus(item: Reclamation, metadata: any) {
    return String(metadata?.merchandiseInfo?.warrantyStatus || "").trim() || getWarrantyStatusFromHistory(item);
}

function getSupplierWarrantyLimitDate(metadata: any) {
    const rows = getMerchandiseRows(metadata);
    const rowLimit = rows.map((item: any) => cleanText(item?.warrantyLimitDate)).find(Boolean);
    return rowLimit || cleanText(metadata?.merchandiseInfo?.warrantyLimitDate);
}

function getPersistedDepositAgency(metadata: any) {
    return cleanText(metadata?.depositAgency || metadata?.merchandiseInfo?.depositAgency);
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

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvDemandesInterventionPage() {
    const router = useRouter();
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [closingTicketId, setClosingTicketId] = useState<number | null>(null);
    const [warrantyChoices, setWarrantyChoices] = useState<Record<number, string>>({});
    const [editingWarranty, setEditingWarranty] = useState<Record<number, boolean>>({});
    const [depositAgencyChoices, setDepositAgencyChoices] = useState<Record<number, string>>({});
    const [editingDepositAgency, setEditingDepositAgency] = useState<Record<number, boolean>>({});
    const [topMedicalWarrantyInputs, setTopMedicalWarrantyInputs] = useState<Record<number, { contractDate: string; duration: string }>>({});
    const [validatedTopMedicalWarrantyLimits, setValidatedTopMedicalWarrantyLimits] = useState<Record<string, TopMedicalWarrantyLimitDraft>>({});
    const [editingTopMedicalWarranty, setEditingTopMedicalWarranty] = useState<Record<number, boolean>>({});
    const [savingWarrantyId, setSavingWarrantyId] = useState<number | null>(null);
    const [savingDepositAgencyId, setSavingDepositAgencyId] = useState<number | null>(null);
    const [validatingWorkflowId, setValidatingWorkflowId] = useState<number | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [dismissedWarrantyAlerts, setDismissedWarrantyAlerts] = useState<string[]>([]);

    const fetchReclamations = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/reclamations?light=0&historyLimit=20", {
                cache: "no-store"
            });
            const data = await response.json();
            const list = Array.isArray(data) ? data : [];
            setReclamations(list);
        } catch (error) {
            console.error("ADV reclamations fetch error:", error);
            setReclamations([]);
        } finally {
            setLoading(false);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        setCurrentUserId(user?.id ? Number(user.id) : null);
        setValidatedTopMedicalWarrantyLimits(readStoredTopMedicalLimits());
        setDismissedWarrantyAlerts(readDismissedWarrantyAlerts());
        fetchReclamations();
    }, []);

    const dismissWarrantyAlert = (key: string) => {
        setDismissedWarrantyAlerts((prev) => {
            const next = Array.from(new Set([...prev, key]));
            writeDismissedWarrantyAlerts(next);
            return next;
        });
    };

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleAdministrativeClose = async (ticketId: number) => {
        if (!ticketId || !currentUserId || closingTicketId === ticketId) return;

        setClosingTicketId(ticketId);
        try {
            const response = await fetch(`/api/adv/tickets/${ticketId}/administrative-close`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: currentUserId })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Erreur pendant la clôture ADV.");
            }

            await fetchReclamations();
            router.push("/adv/tickets-clotures");
        } catch (error: any) {
            alert(error?.message || "Erreur pendant la clôture ADV.");
        } finally {
            setClosingTicketId(null);
        }
    };

    const handleTopMedicalLimitValidate = async (item: Reclamation) => {
        const metadata = getChecklistMetadata(item) as any;
        const merchandiseInfo = metadata?.merchandiseInfo || {};
        const warrantyInput = topMedicalWarrantyInputs[item.id] || {
            contractDate: String(merchandiseInfo.topMedicalWarrantyContractDate || ""),
            duration: String(merchandiseInfo.topMedicalWarrantyDuration || "")
        };
        const topMedicalWarrantyLimitDate = calculateWarrantyLimitDate(warrantyInput.contractDate, warrantyInput.duration);
        if (!topMedicalWarrantyLimitDate) {
            alert("Veuillez renseigner la date du contrat et la durée de garantie avant de valider la date limite.");
            return;
        }
        setSavingWarrantyId(item.id);

        try {
            const sourceEquipmentMerchandiseItems = Array.isArray(merchandiseInfo.equipmentMerchandiseItems)
                ? merchandiseInfo.equipmentMerchandiseItems
                : [];
            const nextMerchandiseInfo = {
                ...merchandiseInfo,
                topMedicalWarrantyContractDate: warrantyInput.contractDate || null,
                topMedicalWarrantyDuration: warrantyInput.duration || null,
                topMedicalWarrantyLimitDate: topMedicalWarrantyLimitDate,
                advWarrantyLimitDate: topMedicalWarrantyLimitDate,
                equipmentMerchandiseItems: sourceEquipmentMerchandiseItems.map((row: any) => ({
                    ...row,
                    topMedicalWarrantyContractDate: warrantyInput.contractDate || null,
                    topMedicalWarrantyDuration: warrantyInput.duration || null,
                    topMedicalWarrantyLimitDate: topMedicalWarrantyLimitDate,
                    advWarrantyLimitDate: topMedicalWarrantyLimitDate
                })),
                updatedAt: new Date().toISOString(),
                updatedByUserId: currentUserId || 1
            };
            const nextTopMedicalWarrantyLimit = {
                contractDate: warrantyInput.contractDate || null,
                duration: warrantyInput.duration || null,
                limitDate: topMedicalWarrantyLimitDate
            };
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUserId || 1,
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
            if (!response.ok) {
                throw new Error(payload?.error || "Erreur pendant l'enregistrement de la date limite.");
            }

            setReclamations((prev) => prev.map((reclamation) => {
                if (reclamation.id !== item.id) return reclamation;
                let checklist: any = {};
                try {
                    checklist = JSON.parse(String(reclamation.checklist || "{}"));
                } catch {
                    checklist = {};
                }
                const nextMetadata = checklist.metadata || {};
                return {
                    ...reclamation,
                    checklist: JSON.stringify({
                        ...checklist,
                        metadata: {
                            ...nextMetadata,
                            merchandiseInfo: nextMerchandiseInfo,
                            topMedicalWarrantyLimit: nextTopMedicalWarrantyLimit
                        }
                    })
                };
            }));
            const savedLimit = {
                contractDate: warrantyInput.contractDate,
                duration: warrantyInput.duration,
                limitDate: topMedicalWarrantyLimitDate
            };
            saveStoredTopMedicalLimit(item, savedLimit);
            setValidatedTopMedicalWarrantyLimits((prev) => ({
                ...prev,
                [getTopMedicalLimitStorageKey(item)]: savedLimit
            }));
            setEditingTopMedicalWarranty((prev) => ({ ...prev, [item.id]: false }));
            setTopMedicalWarrantyInputs((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
            setEditingTopMedicalWarranty((prev) => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
            await fetchReclamations();
        } catch (error: any) {
            alert(error?.message || "Erreur pendant l'enregistrement de la date limite.");
        } finally {
            setSavingWarrantyId(null);
        }
    };

    const handleDepositAgencyChange = async (item: Reclamation, nextAgency: string) => {
        const normalizedAgency = cleanText(nextAgency);
        setDepositAgencyChoices((prev) => ({ ...prev, [item.id]: normalizedAgency }));
        if (!normalizedAgency) return;

        setSavingDepositAgencyId(item.id);
        try {
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUserId || 1,
                    depositAgency: normalizedAgency
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Erreur pendant l'enregistrement de l'agence de dépôt.");
            }
            setEditingDepositAgency((prev) => ({ ...prev, [item.id]: false }));
            await fetchReclamations();
        } catch (error: any) {
            alert(error?.message || "Erreur pendant l'enregistrement de l'agence de dépôt.");
        } finally {
            setSavingDepositAgencyId(null);
        }
    };

    const handleWorkflowValidate = async (item: Reclamation, warrantyStatusOverride?: string) => {
        if (!currentUserId || validatingWorkflowId === item.id) return;

        const metadata = getChecklistMetadata(item) as any;
        const merchandiseInfo = metadata?.merchandiseInfo || {};
        const selectedDepositAgency = depositAgencyChoices[item.id] || getPersistedDepositAgency(metadata);
        const selectedWarrantyStatus = warrantyStatusOverride || warrantyChoices[item.id] || getPersistedWarrantyStatus(item, metadata);
        const normalizedWarrantyStatus = String(selectedWarrantyStatus || "").trim();
        const hasWarrantyChoice = normalizedWarrantyStatus === "UNDER_WARRANTY" || normalizedWarrantyStatus === "OUT_OF_WARRANTY";
        const localTopMedicalLimit = validatedTopMedicalWarrantyLimits[getTopMedicalLimitStorageKey(item)];
        const persistedTopMedicalLimit = metadata?.topMedicalWarrantyLimit && typeof metadata.topMedicalWarrantyLimit === "object" ? metadata.topMedicalWarrantyLimit : {};
        const selectedTopMedicalLimitDate = String(localTopMedicalLimit?.limitDate || persistedTopMedicalLimit?.limitDate || merchandiseInfo?.topMedicalWarrantyLimitDate || merchandiseInfo?.advWarrantyLimitDate || "").trim();
        if (!selectedDepositAgency) {
            alert("Veuillez sélectionner l'agence de dépôt avant de transmettre le ticket.");
            return;
        }
        if (!hasWarrantyChoice) {
            alert("Veuillez sélectionner la garantie avant de transmettre le ticket.");
            return;
        }
        if (!selectedTopMedicalLimitDate) {
            alert("Veuillez sÃ©lectionner la date limite Top Medical avant de transmettre le ticket.");
            return;
        }
        const nextStatus = "PENDING_STORE_REVIEW";

        setValidatingWorkflowId(item.id);
        try {
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUserId,
                    status: nextStatus,
                    allowMerchandiseUpdate: true,
                    depositAgency: selectedDepositAgency,
                    merchandiseInfo: {
                        ...merchandiseInfo,
                        depositAgency: selectedDepositAgency,
                        ...(hasWarrantyChoice ? { warrantyStatus: normalizedWarrantyStatus } : {}),
                        updatedAt: new Date().toISOString(),
                        updatedByUserId: currentUserId
                    }
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Impossible de valider le ticket.");
            }

            setEditingWarranty((prev) => ({ ...prev, [item.id]: false }));
            await fetchReclamations();
        } catch (error: any) {
            alert(error?.message || "Erreur pendant la validation du ticket.");
        } finally {
            setValidatingWorkflowId(null);
        }
    };

    const handleWarrantyChoiceChange = async (item: Reclamation, nextWarrantyStatus: string) => {
        setWarrantyChoices((prev) => ({ ...prev, [item.id]: nextWarrantyStatus }));

        const normalizedWarrantyStatus = String(nextWarrantyStatus || "").trim();
        if (!["UNDER_WARRANTY", "OUT_OF_WARRANTY"].includes(normalizedWarrantyStatus)) return;

        const metadata = getChecklistMetadata(item) as any;
        const merchandiseInfo = metadata?.merchandiseInfo || {};
        setSavingWarrantyId(item.id);
        try {
            const response = await fetch(`/api/reclamations/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUserId || 1,
                    allowMerchandiseUpdate: true,
                    merchandiseInfo: {
                        ...merchandiseInfo,
                        warrantyStatus: normalizedWarrantyStatus,
                        updatedAt: new Date().toISOString(),
                        updatedByUserId: currentUserId || 1
                    }
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(payload?.error || "Erreur pendant l'enregistrement de la garantie.");
            }
            setEditingWarranty((prev) => ({ ...prev, [item.id]: false }));
            await fetchReclamations();
        } catch (error: any) {
            alert(error?.message || "Erreur pendant l'enregistrement de la garantie.");
        } finally {
            setSavingWarrantyId(null);
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
    const actionable = useMemo(
        () =>
            sorted.filter((item) => {
                const status = String(item.status || "").toUpperCase();
                const metadata = getChecklistMetadata(item) as any;
                const historyEntries = Array.isArray(item?.ticket?.savHistory) ? item.ticket.savHistory : [];
                const ticketStatus = String(item?.ticket?.status || "").toUpperCase();
                const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
                const isReadyForAdministrativeClosure = !isAdministrativelyClosed
                    && (ticketStatus === "READY_FOR_DELIVERY" || (ticketStatus === "CLOSED" && hasNonRepareOutcome(historyEntries)));
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

                if (status === "PENDING_ADV_VERIFICATION" || isPostQualificationWorkflowStatus(status) || ticketStatus !== "QUALIFICATION") {
                    return true;
                }

                return false;
            }),
        [sorted]
    );

    const filteredActionable = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return actionable;

        return actionable.filter((item) => {
            const metadata = getChecklistMetadata(item) as any;
            const materials = groupMaterialsByDesignation(getTicketEquipmentItems(item));
            const searchable = [
                getTicketDisplayLabel(item),
                item.customerName,
                item.contactEmail,
                item.phone,
                item.deviceModel,
                item.serialNumber,
                item.description,
                item.status,
                item.interventionType,
                getClientVisibleStatus(item),
                getMaterialsSummary(materials),
                metadata?.pn,
                metadata?.equipmentName,
                metadata?.brand,
                metadata?.model,
                metadata?.merchandiseInfo?.articleCode,
                metadata?.merchandiseInfo?.warrantyLabel,
                metadata?.entryRepairSlip?.pn,
                metadata?.entryRepairSlip?.designation
            ].join(" ").toLowerCase();

            return searchable.includes(query);
        });
    }, [actionable, searchTerm]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const advAlerts = useMemo(
        () =>
            actionable.flatMap((item) => {
                const metadata = getChecklistMetadata(item) as any;
                const alerts: Array<{ key: string; text: string }> = [];
                const supplierWarrantyMonths = getSupplierWarrantyMonths(metadata);
                const topMedicalWarrantyMonths = getTopMedicalWarrantyMonths(item);
                const ticketLabel = getTicketDisplayLabel(item);

                if (supplierWarrantyMonths && topMedicalWarrantyMonths && supplierWarrantyMonths < topMedicalWarrantyMonths) {
                    alerts.push({
                        key: `${item.id}-warranty`,
                        text: `Garantie fournisseur plus courte que la garantie Top Medical pour le ticket #${ticketLabel}.`
                    });
                }

                return alerts;
            }).filter((alert) => !dismissedWarrantyAlerts.includes(alert.key)),
        [actionable, dismissedWarrantyAlerts]
    );

    if (loading) {
        return <div className={styles.loading}>Chargement des tickets...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.shell}>
            <section className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Tickets à compléter</h2>

                {advAlerts.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.5rem", marginBottom: "0.85rem" }}>
                        {advAlerts.map((alert) => (
                            <div key={alert.key} className={styles.listItem} style={{ borderColor: "#f59e0b", background: "#fffbeb", display: "flex", alignItems: "center", gap: "0.55rem" }}>
                                <span className={`${styles.statusBadge} ${styles.statusWarn}`}>Alerte</span>
                                <span style={{ marginLeft: "0.55rem", fontWeight: 700 }}>{alert.text}</span>
                                <button
                                    className={styles.dismissWarrantyAlert}
                                    type="button"
                                    onClick={() => dismissWarrantyAlert(alert.key)}
                                    aria-label="Valider l'alerte"
                                    style={{ marginLeft: "auto", border: "1px solid #86efac", borderRadius: 999, background: "#dcfce7", color: "#166534", fontWeight: 800, padding: "0.28rem 0.7rem", cursor: "pointer" }}
                                >
                                    ✓
                                </button>
                                <span style={{ marginLeft: "auto", border: "1px solid #86efac", borderRadius: 999, background: "#dcfce7", color: "#166534", fontWeight: 800, padding: "0.28rem 0.7rem" }}>✔</span>
                            </div>
                        ))}
                    </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
                    <input
                        className={styles.input}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Rechercher par ticket, client, SN, matériel..."
                        style={{ maxWidth: "420px" }}
                    />
                </div>

                {filteredActionable.length === 0 ? (
                    <div className={styles.empty}>Aucun ticket à compléter pour le moment.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date et heure de création</th>
                                    <th>Créé par</th>
                                    <th>Client</th>
                                    <th>Matériel à réparer</th>
                                    <th>Type d'intervention</th>
                                    <th>Urgence</th>
                                    <th>Urgence SAV</th>
                                    <th>Statut</th>
                                    <th>Agence de dépôt</th>
                                    <th>Garantie</th>
                                    <th>Date limite garantie Top Medical</th>
                                    <th>Date limite fournisseur</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredActionable.map((item) => {
                                    const currentStatus = String(item.status || "").toUpperCase();
                                    const historyEntries = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
                                    const hasNonRepare = hasNonRepareOutcome(historyEntries);
                                    const urgency = getUrgencyFromReclamation(item);
                                    const savUrgencyLevel = getSavUrgencyLevel(item);
                                    const materials = groupMaterialsByDesignation(getTicketEquipmentItems(item));
                                    const materialSummary = getMaterialsSummary(materials);
                                    const ticketId = Number(item.ticket?.id || 0);
                                    const ticketDisplayId = getTicketDisplayLabel(item);
                                    const isDpEditFlow = isPostQualificationEditFlow(item);
                                    const ticketStatus = String(item.ticket?.status || "").toUpperCase();
                                    const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(historyEntries));
                                    const isReadyForAdministrativeClosure = !isAdministrativelyClosed
                                        && (ticketStatus === "READY_FOR_DELIVERY" || (ticketStatus === "CLOSED" && hasNonRepare));
                                    const showQuoteAction = isQuoteWorkflowStatus(currentStatus);
                                    const showQualificationAction = !isReadyForAdministrativeClosure && (isAdvDecisionPendingStatus(currentStatus) || isDpEditFlow);
                                    const clientVisibleStatus = getClientVisibleStatus(item);
                                    const metadata = getChecklistMetadata(item) as any;
                                    const creatorLabel = getTicketCreatorLabel(metadata);
                                    const persistedDepositAgency = getPersistedDepositAgency(metadata);
                                    const depositAgencyChoice = depositAgencyChoices[item.id] || persistedDepositAgency;
                                    const isDepositAgencyValidated = Boolean(persistedDepositAgency);
                                    const isEditingDeposit = Boolean(editingDepositAgency[item.id]);
                                    const persistedWarrantyStatus = getPersistedWarrantyStatus(item, metadata);
                                    const warrantyChoice = warrantyChoices[item.id] || persistedWarrantyStatus;
                                    const isWarrantyValidated = Boolean(persistedWarrantyStatus);
                                    const isEditingWarranty = Boolean(editingWarranty[item.id]);
                                    const localTopMedicalLimit = validatedTopMedicalWarrantyLimits[getTopMedicalLimitStorageKey(item)];
                                    const persistedTopMedicalLimit = metadata?.topMedicalWarrantyLimit && typeof metadata.topMedicalWarrantyLimit === "object" ? metadata.topMedicalWarrantyLimit : {};
                                    const topMedicalStoredContractDate = String(localTopMedicalLimit?.contractDate || persistedTopMedicalLimit?.contractDate || metadata?.merchandiseInfo?.topMedicalWarrantyContractDate || "");
                                    const topMedicalStoredDuration = String(localTopMedicalLimit?.duration || persistedTopMedicalLimit?.duration || metadata?.merchandiseInfo?.topMedicalWarrantyDuration || "");
                                    const topMedicalPersistedLimitDate = String(localTopMedicalLimit?.limitDate || persistedTopMedicalLimit?.limitDate || metadata?.merchandiseInfo?.topMedicalWarrantyLimitDate || metadata?.merchandiseInfo?.advWarrantyLimitDate || "");
                                    const topMedicalStoredLimitDate = topMedicalPersistedLimitDate || calculateWarrantyLimitDate(topMedicalStoredContractDate, topMedicalStoredDuration);
                                    const isEditingTopMedicalLimit = Boolean(editingTopMedicalWarranty[item.id]);
                                    const topMedicalInput = topMedicalWarrantyInputs[item.id] || {
                                        contractDate: topMedicalStoredContractDate,
                                        duration: topMedicalStoredDuration
                                    };
                                    const topMedicalLimitDate = calculateWarrantyLimitDate(topMedicalInput.contractDate, topMedicalInput.duration)
                                        || topMedicalStoredLimitDate;
                                    const hasValidatedTopMedicalLimit = Boolean(topMedicalStoredLimitDate.trim());
                                    const showTopMedicalFields = !hasValidatedTopMedicalLimit || isEditingTopMedicalLimit;
                                    const showWorkflowValidateAction = !isReadyForAdministrativeClosure
                                        && !showQuoteAction
                                        && Boolean(depositAgencyChoice)
                                        && Boolean(warrantyChoice)
                                        && hasValidatedTopMedicalLimit
                                        && !["PENDING_STORE_REVIEW", "PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE", "CLOSED"].includes(currentStatus);
                                    const hasTopMedicalChange =
                                        topMedicalInput.contractDate !== topMedicalStoredContractDate
                                        || topMedicalInput.duration !== topMedicalStoredDuration;
                                    const supplierWarrantyLimitDate = getSupplierWarrantyLimitDate(metadata);
                                    const dpInfoComplete = isMerchandiseInfoComplete(metadata);
                                    const clientDocuments = extractClientDocuments(item as any, { viewerRole: "ADV" })
                                        .filter((document) => Boolean(document.dataUrl) && !isFailureMediaAttachment(document));

                                    // Cette partie affiche l interface visible a l ecran.
                                    return (
                                        <Fragment key={item.id}>
                                            <tr>
                                                <td>
                                                    <div className={styles.itemMeta}>{new Date(item.createdAt).toLocaleString("fr-FR")}</div>
                                                    {ticketId > 0 ? (
                                                        <Link href={`/adv/suivi-client/${ticketId}`} className={styles.itemTitle} style={{ textDecoration: "none", marginTop: "0.35rem", display: "inline-block" }}>
                                                            #{ticketDisplayId}
                                                        </Link>
                                                    ) : null}
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${styles.statusDanger}`}>
                                                        {creatorLabel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className={styles.itemTitle}>{cleanText(item.customerName) || "Client non renseigné"}</div>
                                                    <div className={styles.itemMeta}>{cleanText(item.contactEmail) || "-"}</div>
                                                </td>
                                                <td>
                                                    <div className={styles.itemTitle}>{cleanText(item.deviceModel) || "Matériel non renseigné"}</div>
                                                    <div className={styles.itemMeta}>{materialSummary}</div>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${String(item.interventionType || "").toUpperCase() === "WORKSHOP" ? styles.statusInfo : styles.statusSuccess}`}>
                                                        {formatInterventionType(item.interventionType)}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(urgency)]}`}>
                                                        {URGENCY_LABELS[urgency]}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${styles.statusInfo}`}>
                                                        {savUrgencyLevel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`${styles.statusBadge} ${isReadyForAdministrativeClosure ? styles.statusSuccess : styles.statusWarn}`}>
                                                        {clientVisibleStatus}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch" }}>
                                                        <select
                                                            className={styles.select}
                                                            value={depositAgencyChoice}
                                                            onChange={(event) => void handleDepositAgencyChange(item, event.target.value)}
                                                            disabled={savingDepositAgencyId === item.id || (isDepositAgencyValidated && !isEditingDeposit)}
                                                            style={{ minWidth: "150px", padding: "0.55rem 0.7rem" }}
                                                        >
                                                            <option value="">{savingDepositAgencyId === item.id ? "Enregistrement..." : "Agence"}</option>
                                                            <option value="Rabat">Rabat</option>
                                                            <option value="Casablanca">Casablanca</option>
                                                            <option value="Fès">Fès</option>
                                                            <option value="Marrakech">Marrakech</option>
                                                        </select>
                                                        {isDepositAgencyValidated && !isEditingDeposit ? (
                                                            <button
                                                                className="btn btn-outline"
                                                                type="button"
                                                                onClick={() => setEditingDepositAgency((prev) => ({ ...prev, [item.id]: true }))}
                                                                disabled={savingDepositAgencyId === item.id}
                                                            >
                                                                Modifier
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch" }}>
                                                        <select
                                                            className={styles.select}
                                                            value={warrantyChoice}
                                                            onChange={(event) => void handleWarrantyChoiceChange(item, event.target.value)}
                                                            disabled={savingWarrantyId === item.id || (isWarrantyValidated && !isEditingWarranty)}
                                                            style={{ minWidth: "150px", padding: "0.55rem 0.7rem" }}
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
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch", minWidth: 210 }}>
                                                        {showTopMedicalFields ? (
                                                            <>
                                                        <input
                                                            className={styles.input}
                                                            type="date"
                                                            value={topMedicalInput.contractDate}
                                                            onChange={(event) => setTopMedicalWarrantyInputs((prev) => ({
                                                                ...prev,
                                                                [item.id]: {
                                                                    contractDate: event.target.value,
                                                                    duration: prev[item.id]?.duration ?? topMedicalInput.duration
                                                                }
                                                            }))}
                                                            disabled={savingWarrantyId === item.id}
                                                            title="Date du contrat de garantie"
                                                        />
                                                        <input
                                                            className={styles.input}
                                                            value={topMedicalInput.duration}
                                                            onChange={(event) => setTopMedicalWarrantyInputs((prev) => ({
                                                                ...prev,
                                                                [item.id]: {
                                                                    contractDate: prev[item.id]?.contractDate ?? topMedicalInput.contractDate,
                                                                    duration: event.target.value
                                                                }
                                                            }))}
                                                            disabled={savingWarrantyId === item.id}
                                                            placeholder="Durée, ex: 12 mois"
                                                            title="Durée de garantie"
                                                        />
                                                        <div className={styles.itemMeta}>Limite: {formatDateFr(topMedicalLimitDate)}</div>
                                                        {topMedicalLimitDate && (hasTopMedicalChange || isEditingTopMedicalLimit || !hasValidatedTopMedicalLimit || savingWarrantyId === item.id) ? (
                                                            <button
                                                                className="btn btn-outline"
                                                                onClick={() => void handleTopMedicalLimitValidate(item)}
                                                                disabled={savingWarrantyId === item.id || !topMedicalLimitDate}
                                                            >
                                                                {savingWarrantyId === item.id ? "Validation..." : "Valider la date limite"}
                                                            </button>
                                                        ) : null}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className={styles.itemMeta}>Limite: {formatDateFr(topMedicalLimitDate)}</div>
                                                                <button
                                                                    className="btn btn-outline"
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setTopMedicalWarrantyInputs((prev) => ({
                                                                            ...prev,
                                                                            [item.id]: {
                                                                                contractDate: topMedicalStoredContractDate,
                                                                                duration: topMedicalStoredDuration
                                                                            }
                                                                        }));
                                                                        setEditingTopMedicalWarranty((prev) => ({ ...prev, [item.id]: true }));
                                                                    }}
                                                                    disabled={savingWarrantyId === item.id}
                                                                >
                                                                    Modifier
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className={styles.itemMeta}>{formatDateFr(supplierWarrantyLimitDate)}</div>
                                                </td>
                                                <td>
                                                    <div className={styles.actions} style={{ alignItems: "stretch" }}>
                                                        {warrantyChoice && clientDocuments.length > 0 ? (
                                                            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                                                                {clientDocuments.map((document, index) => (
                                                                    <a
                                                                        key={`${item.id}-${document.name || "document"}-${index}`}
                                                                        className="btn btn-outline"
                                                                        href={document.dataUrl}
                                                                        download={document.name || `document-client-${index + 1}`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        style={{ textDecoration: "none" }}
                                                                    >
                                                                        {document.name || `Document ${index + 1}`}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                        {showQualificationAction ? (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={() => router.push(`/adv/qualification/${Number(item.ticket?.id || item.id)}`)}
                                                            >
                                                                Compléter
                                                            </button>
                                                        ) : null}
                                                        {showWorkflowValidateAction ? (
                                                            <button
                                                                className="btn btn-primary"
                                                                type="button"
                                                                onClick={() => void handleWorkflowValidate(item)}
                                                                disabled={validatingWorkflowId === item.id || !depositAgencyChoice || !warrantyChoice}
                                                                title={!depositAgencyChoice || !warrantyChoice ? "Veuillez sélectionner l'agence de dépôt et la garantie avant de transmettre le ticket." : undefined}
                                                            >
                                                                {validatingWorkflowId === item.id ? "Validation..." : "Valider"}
                                                            </button>
                                                        ) : null}
                                                        {showQuoteAction && currentStatus !== "QUOTE_SENT_TO_CLIENT" ? (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={() => router.push(`/adv/devis?reclamationId=${item.id}`)}
                                                            >
                                                                Devis à préparer
                                                            </button>
                                                        ) : null}
                                                        {isReadyForAdministrativeClosure && ticketId > 0 ? (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={() => void handleAdministrativeClose(ticketId)}
                                                                disabled={closingTicketId === ticketId}
                                                            >
                                                                {closingTicketId === ticketId ? "Traitement..." : "Traité"}
                                                            </button>
                                                        ) : null}
                                                    </div>
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
- Ce fichier sert a la partie "demandes intervention" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
