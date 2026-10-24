"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : suivi client.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import Link from "next/link";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, History, MessageSquare } from "lucide-react";
import styles from "../../adv.module.css";
import { formatTicketStatus } from "@/metier/workflow-adv";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { dedupeAndSortHistory, formatTicketHistoryAction, formatTicketHistoryNote, getAdministrativeClosureAt, getTicketHistoryTone } from "@/metier/historique-ticket";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";
import { getStatusLabel } from "@/metier/workflow-technicien";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketSummary = {
    id: number;
    displayId?: number | string | null;
    ticketReference?: string | null;
    title: string;
    status: string;
    savHistory?: HistoryEntry[];
    equipment?: {
        name?: string | null;
        client?: string | null;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type HistoryEntry = {
    id: number;
    action: string;
    note?: string | null;
    createdAt: string;
    user?: {
        id: number;
        name: string;
        role: string;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketDetail = {
    id: number;
    displayId?: number | string | null;
    ticketReference?: string | null;
    title: string;
    status: string;
    createdAt?: string;
    creator?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
    } | null;
    assignedTo?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
        phone?: string | null;
    } | null;
    equipment?: {
        name?: string | null;
        client?: string | null;
        model?: string | null;
        brand?: string | null;
        serialNumber?: string | null;
        code?: string | null;
        location?: string | null;
    } | null;
    savHistory?: HistoryEntry[];
    reclamation?: {
        id: number;
        status?: string | null;
        createdAt?: string | null;
        interventionType?: string | null;
        checklist?: string | null;
        attachmentUrl?: string | null;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type EquipmentDetailItem = {
    key: string;
    designation: string;
    model: string;
    brand: string;
    serialNumber: string;
    pn: string;
    quantity: number;
    articleCode: string;
    location: string;
};

type MerchandiseDetailItem = {
    key: string;
    label: string;
    supplier: string;
    articleCode: string;
    warrantyLabel: string;
    invoiceDate: string;
    shippingDate: string;
    warrantyLimitDate: string;
};

const ACTION_LABELS: Record<string, string> = {
    ADV_DECISION_TAKEN: "Prise en charge SAV",
    ADV_DECISION_REFUS: "Décision ADV: non prise en charge",
    ADV_QUALIFICATION: "Ticket validé",
    ADV_QUALIFICATION_DOCUMENTS: "Documents validation",
    ADV_QUOTE_SENT: "Devis en attente de validation",
    CLIENT_QUOTE_APPROVED: "Devis validé",
    CLIENT_QUOTE_REJECTED: "Devis refusé",
    ADV_NOTIFICATION_TECHNICIAN: "Notification technicien",
    CLIENT_NOTIFICATION: "Notification client",
    CLIENT_UPDATE: "Mise à jour client",
    ADV_UPDATE: "Mise à jour ADV",
    CLIENT_REMINDER: "Relance client",
    MESSAGE: "Message interne",
    COMMENT_CLIENT: "Suivi SAV",
    PART_REQUEST: "Pièce de rechange à importer",
    PART_REQUEST_SENT_TO_IMPORT: "Demande transmise à l'import",
    PART_REQUEST_NOTIFICATION: "Notification demande de pièces",
    IMPORT_ORDER_SHIPPED: "Commande expédiée",
    INTERNAL_SUBTICKET_CREATED: "Sous-ticket pièces créé",
    INTERNAL_SUBTICKET_LINKED: "Sous-ticket pièces lié",
    INTERVENTION_LOG: "Suivi SAV",
    TECHNICAL_REPORT: "Rapport technique",
    INTERNAL_TICKET: "Message interne",
    CLIENT_ADDITIONAL_DOCUMENTS: "Documents complémentaires client"
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function cleanDisplayValue(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (["-", "non renseigne", "non renseigné", "unknown"].includes(normalized)) return "";
    return text;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function valueOrDash(value: unknown) {
    return cleanDisplayValue(value) || "-";
}

function extractStoreReviewNote(value: unknown) {
    const text = cleanDisplayValue(value);
    if (!text) return "";

    if (text.startsWith("{") || text.includes("\"actionType\"") || text.includes("\"merchandiseInfo\"")) {
        try {
            const parsed = JSON.parse(text);
            return cleanDisplayValue(parsed?.note || parsed?.magasinierNote || parsed?.storeNote);
        } catch {
            return "";
        }
    }

    return text;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function translateInternalDestination(value: unknown) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "TECHNICIAN" || normalized === "TECHNICIEN") return "technicien";
    if (normalized === "RESPONSABLE_TECHNIQUE") return "responsable technique";
    if (normalized === "ADV") return "responsable ADV";
    if (normalized === "ADMIN") return "admin";
    if (normalized === "IMPORT") return "import";
    return String(value || "").trim().toLowerCase();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getTicketEquipmentDetails(ticket: TicketDetail | null): EquipmentDetailItem[] {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const merchandiseInfo = (metadata as any).merchandiseInfo || {};
    const entryRepairSlip = (metadata as any).entryRepairSlip || {};
    const locationFallback = cleanDisplayValue(ticket?.equipment?.location)
        || cleanDisplayValue((metadata as any).location)
        || cleanDisplayValue((metadata as any).city)
        || cleanDisplayValue((metadata as any).establishment);
    const items = getTicketEquipmentItems({
        checklist: ticket?.reclamation?.checklist,
        deviceModel: ticket?.equipment?.model || ticket?.equipment?.name,
        serialNumber: ticket?.equipment?.serialNumber,
        equipmentName: ticket?.equipment?.name,
        description: ticket?.title
    });
    const merchandiseItems = Array.isArray(merchandiseInfo.equipmentMerchandiseItems) ? merchandiseInfo.equipmentMerchandiseItems : [];
    const rawSlipItems = Array.isArray(entryRepairSlip.equipmentItems) ? entryRepairSlip.equipmentItems : [];

    if (items.length === 0) {
        const fallbackName = cleanDisplayValue(ticket?.equipment?.name) || cleanDisplayValue(ticket?.equipment?.model) || "Matériel";
        return [{
            key: `equipment-${ticket?.id || 0}-0`,
            designation: fallbackName,
            model: valueOrDash(ticket?.equipment?.model || (metadata as any).model || entryRepairSlip.designation),
            brand: valueOrDash(ticket?.equipment?.brand || (metadata as any).brand),
            serialNumber: valueOrDash(ticket?.equipment?.serialNumber || entryRepairSlip.serialNumber),
            pn: valueOrDash((metadata as any).pn),
            quantity: 1,
            articleCode: valueOrDash(ticket?.equipment?.code || merchandiseInfo.articleCode),
            location: valueOrDash(locationFallback)
        }];
    }

    return items.map((item, index) => {
        const merchandiseEntry = merchandiseItems.find((entry: any) => Number(entry?.materialIndex ?? entry?.index ?? -1) === index) || null;
        const rawSlipEntry = rawSlipItems[index] || null;
        const fallbackName = cleanDisplayValue(item.designation) || cleanDisplayValue(ticket?.equipment?.name) || cleanDisplayValue(ticket?.equipment?.model) || `Matériel ${index + 1}`;
        return {
            key: `equipment-${ticket?.id || 0}-${index}`,
            designation: fallbackName,
            model: valueOrDash(index === 0 ? (ticket?.equipment?.model || (metadata as any).model || rawSlipEntry?.designation) : rawSlipEntry?.designation),
            brand: valueOrDash(index === 0 ? (ticket?.equipment?.brand || (metadata as any).brand) : ((metadata as any).brand || merchandiseEntry?.brand)),
            serialNumber: valueOrDash(item.serialNumber || rawSlipEntry?.serialNumber || (index === 0 ? ticket?.equipment?.serialNumber : "")),
            pn: valueOrDash(item.pn),
            quantity: Number(item.quantity || 1) || 1,
            articleCode: valueOrDash(item.articleCode || (index === 0 ? (ticket?.equipment?.code || merchandiseEntry?.articleCode || merchandiseInfo.articleCode) : (merchandiseEntry?.articleCode || merchandiseInfo.articleCode))),
            location: valueOrDash(locationFallback)
        };
    });
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function replaceReclamationByIntervention(value: string | null | undefined): string {
    return String(value || "")
        .replace(/Réclamation/g, "Intervention")
        .replace(/réclamation/g, "intervention")
        .replace(/Reclamation/g, "Intervention")
        .replace(/reclamation/g, "intervention");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function statusClass(status: string) {
    const value = String(status || "").toLowerCase();
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("non prise") || normalized.includes("refus")) return styles.statusDanger;
    if (normalized.includes("attente") || normalized.includes("verification") || normalized.includes("analyse") || normalized.includes("en cours")) return styles.statusWarn;
    if (normalized.includes("valide") || normalized.includes("repare") || normalized.includes("livr") || normalized.includes("cloture")) return styles.statusSuccess;
    return styles.statusInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function actorRoleLabel(role: string | null | undefined): string {
    const normalized = String(role || "").trim().toUpperCase();
    if (normalized === "CLIENT") return "Client";
    if (normalized === "ADV") return "Responsable ADV";
    if (normalized === "RESPONSABLE_FACTURATION") return "Responsable facturation";
    if (normalized === "RESPONSABLE_TECHNIQUE") return "SAV";
    if (normalized === "RESPONSABLE_APPELS_OFFRE") return "Responsable appels d'offre";
    if (normalized === "IMPORT") return "Import";
    if (normalized === "TECHNICIAN" || normalized === "TECHNICIEN") return "SAV";
    if (normalized === "MAGASINIER") return "Magasinier";
    if (normalized === "ADMIN") return "Admin";
    return "SAV";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function actorRoleStyle(role: string | null | undefined): CSSProperties {
    const normalized = String(role || "").trim().toUpperCase();
    if (normalized === "CLIENT") return { background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" };
    if (normalized === "ADV") return { background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" };
    if (normalized === "MAGASINIER") return { background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" };
    if (normalized === "RESPONSABLE_TECHNIQUE") return { background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" };
    if (normalized === "RESPONSABLE_FACTURATION") return { background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" };
    if (normalized === "TECHNICIAN" || normalized === "TECHNICIEN") return { background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1" };
    return { background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" };
}

function formatDateFr(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString("fr-FR");
}

function getReadOnlyMerchandiseDetails(ticket: TicketDetail | null): MerchandiseDetailItem[] {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const merchandiseInfo = (metadata as any).merchandiseInfo || {};
    const rows = Array.isArray(merchandiseInfo.equipmentMerchandiseItems)
        ? merchandiseInfo.equipmentMerchandiseItems
        : [];

    return rows
        .map((item: any, index: number) => ({
            key: `merchandise-${ticket?.id || 0}-${item?.entryId || index}`,
            label: cleanDisplayValue(item?.label) || `Matériel ${index + 1}`,
            supplier: valueOrDash(item?.supplier || item?.fournisseur),
            articleCode: valueOrDash(item?.articleCode),
            warrantyLabel: valueOrDash(item?.warrantyLabel),
            invoiceDate: formatDateFr(item?.invoiceDate),
            shippingDate: formatDateFr(item?.shippingDate),
            warrantyLimitDate: formatDateFr(item?.warrantyLimitDate)
        }))
        .filter((item: MerchandiseDetailItem) => [item.supplier, item.articleCode, item.warrantyLabel, item.invoiceDate, item.shippingDate, item.warrantyLimitDate].some((value) => value !== "-"));
}

function getStoreReviewNote(ticket: TicketDetail | null) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const note = extractStoreReviewNote((metadata as any)?.storeReview?.note);
    if (note) return note;

    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const latestStoreNote = [...history].reverse().find((entry) => {
        const role = String(entry?.user?.role || "").toUpperCase();
        const action = String(entry?.action || "").toUpperCase();
        return role === "MAGASINIER" || action.startsWith("MAGASINIER_");
    });

    return extractStoreReviewNote(latestStoreNote?.note);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatActorBadge(role: string | null | undefined, name: string | null | undefined) {
    const label = actorRoleLabel(role);
    const normalizedLabel = label.trim().toLowerCase();
    const normalizedName = String(name || "").trim().toLowerCase();
    if (!normalizedName || normalizedName === normalizedLabel) {
        return label;
    }
    return `${label}: ${String(name).trim()}`;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function resolveCreationRole(ticket: TicketDetail | null, fallbackRole: string | null | undefined) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const source = String((metadata as any)?.source || "").trim().toUpperCase();
    const submittedByRole = String((metadata as any)?.submittedByRole || "").trim().toUpperCase();
    const rawRole = ["CLIENT_FORM", "CLIENT_EDIT", "ADV_EDIT"].includes(source)
        ? "CLIENT"
        : submittedByRole
        || (ticket?.reclamation ? String(fallbackRole || "CLIENT") : String(ticket?.creator?.role || fallbackRole || ""))
        || "";
    const normalized = rawRole.trim().toUpperCase();
    return normalized === "ADV" ? "RESPONSABLE_FACTURATION" : normalized;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getCreationHistoryPresentation(ticket: TicketDetail | null, fallbackRole: string | null | undefined) {
    const creatorRole = resolveCreationRole(ticket, fallbackRole);

    return {
        actionLabel: "Ticket créé",
        actorRole: creatorRole,
        actor: actorRoleLabel(creatorRole)
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function resolveInterventionRequestDate(ticket: TicketDetail | null, checklistMeta: any, fallbackCreatedAt?: string | null) {
    return String(
        checklistMeta?.entryRepairSlip?.submittedAt
        || (ticket?.reclamation as any)?.createdAt
        || ticket?.createdAt
        || fallbackCreatedAt
        || ""
    ).trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function timelineToneClass(tone: "success" | "warning" | "danger" | "info") {
    if (tone === "success") return styles.timelineToneSuccess;
    if (tone === "warning") return styles.timelineToneWarning;
    if (tone === "danger") return styles.timelineToneDanger;
    return styles.timelineToneInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function timelineChipClass(tone: "success" | "warning" | "danger" | "info") {
    if (tone === "success") return styles.timelineChipSuccess;
    if (tone === "warning") return styles.timelineChipWarning;
    if (tone === "danger") return styles.timelineChipDanger;
    return styles.timelineChipInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatHistoryAction(action: string) {
    if (action === "Priority updated" || action === "Priorité mise à jour") return "Priorité mise à jour";
    return ACTION_LABELS[action] || formatTicketHistoryAction(action);
}

function getUpdateActorRole(entry: HistoryEntry) {
    const action = String(entry.action || "");
    const role = String(entry.user?.role || "").trim().toUpperCase();
    if (action === "ADV_UPDATE") return "ADV";
    if (action === "CLIENT_UPDATE" && role === "ADV") return "ADV";
    if (action === "CLIENT_UPDATE") return "CLIENT";
    return role;
}

function formatHistoryActionForEntry(entry: HistoryEntry) {
    const action = String(entry.action || "");
    const actorRole = getUpdateActorRole(entry);
    if ((action === "CLIENT_UPDATE" || action === "ADV_UPDATE") && actorRole === "ADV") return "Mise à jour ADV";
    if (action === "CLIENT_UPDATE") return "Mise à jour client";
    return formatHistoryAction(action);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function parseStatusChange(action: string | null | undefined) {
    const normalized = String(action || "").trim();
    const match = normalized.match(/^Status changed\s*:\s*([A-Z_]+)\s*->\s*([A-Z_]+)$/i);
    if (!match) return null;
    return {
        fromRaw: match[1],
        toRaw: match[2],
        from: formatTicketStatus(match[1]),
        to: formatTicketStatus(match[2])
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function toFrenchInternalStatus(raw: string): string {
    const key = String(raw || "").toUpperCase();
    if (key === "OPEN") return "Nouveau";
    if (key === "IN_PROGRESS") return "En cours";
    if (key === "WAITING_REPLY") return "En attente retour";
    if (key === "RESOLVED") return "Résolue";
    return raw;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function toFrenchRepairNature(raw: string | undefined) {
    const key = String(raw || "").trim().toUpperCase();
    if (key === "MAJ") return "MAJ logiciel";
    if (key === "SUPPLIER_RETURN_WAIT") return "Attente retour du fournisseur";
    if (key === "LOCAL_PART_PURCHASE") return "Achat pièce local";
    if (key === "DP_PART_RETURN") return "Retour pièce du DP";
    if (key === "SOFTWARE_UPDATE") return "MAJ logiciel";
    if (key === "SOFTWARE_INSTALLATION") return "MAJ logiciel";
    if (key === "PART_REQUEST") return "Pièce de rechange à importer";
    if (key === "LOCAL_PART_REQUEST") return "Achat local de pièce détachée";
    if (key === "USED_PART") return "Pièce de rechange à utiliser";
    if (key === "PART_TO_MANUFACTURE") return "Pièce à fabriquer";
    if (key === "LABOR") return "Main d'oeuvre";
    return String(raw || "").trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function toFrenchSavProgressStatus(raw: string | undefined) {
    const key = String(raw || "").trim().toUpperCase();
    if (key === "DIAGNOSTIC") return "Diagnostic";
    if (key === "REPAIR") return "Réparation en cours";
    if (key === "PENDING_PARTS") return "Attente pièces";
    if (key === "READY_FOR_DELIVERY") return "Matériel réparé à livrer";
    if (key === "CLOSED") return "Ticket traité par l'administration des ventes";
    if (key === "NON_REPARE") return "Irréparable";
    return String(raw || "").trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function parseLineMap(note: string | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!note) return out;
    const raw = String(note).trim();
    if (!raw) return out;

    raw.split("\n").forEach((line) => {
        const idx = line.indexOf(":");
        if (idx < 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (!key) return;
        out[key] = value;
    });

    return out;
}

function hasMeaningfulComment(value: string | null | undefined): boolean {
    const text = String(value || "").trim();
    return Boolean(text && text !== "-");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function summarizeHistoryComment(note: string | null | undefined) {
    const raw = String(note || "").trim();
    if (!raw) return "";
    try {
        const payload = JSON.parse(raw);
        if (payload && typeof payload === "object") {
            const message = typeof (payload as any).message === "string" ? String((payload as any).message).trim() : "";
            if (message) return message;
        }
    } catch {
        // fallback below
    }
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 180);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function buildSavProgressDisplay(entry: HistoryEntry, fallbackStatus?: string | null) {
    const action = String(entry.action || "");
    const raw = String(entry.note || "").trim();
    const statusChange = parseStatusChange(action);
    const map = parseLineMap(raw);
    const statusLabel = statusChange
        ? toFrenchSavProgressStatus(statusChange.toRaw)
        : toFrenchSavProgressStatus(map["Statut avancement"] || fallbackStatus || "");
    const nature = toFrenchRepairNature(map["Nature de réparation"]);
    const comment = String(map["Commentaire"] || map["Commentaire technique"] || "").trim();
    const freeText = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.includes(":") && !/mise à jour intervention enregistrée/i.test(line));
    const visibleFreeText = /cl[oô]ture administrative/i.test(String(freeText || "")) ? "" : freeText;
    const detail = [
        nature ? `Nature: ${nature}` : "",
        hasMeaningfulComment(comment) ? `Commentaire: ${comment}` : "",
        visibleFreeText && visibleFreeText !== statusLabel && visibleFreeText !== nature && visibleFreeText !== comment ? visibleFreeText : ""
    ].filter(Boolean).join(". ");

    return {
        label: statusLabel || (statusChange ? statusChange.to : ""),
        detail
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatTimelineDetails(detail: unknown) {
    const text = String(detail || "").replace(/Commentaire:\s*-\s*\.?\s*/i, "").trim();
    if (!text) return [];
    const priorityMatch = text.match(/^Priorite\s*:\s*([A-Z_]+)\s*->\s*([A-Z_]+)$/i) || text.match(/^Priorité\s*:\s*([A-Z_]+)\s*->\s*([A-Z_]+)$/i);
    if (priorityMatch) {
        const labels: Record<string, string> = { LOW: "Faible", MEDIUM: "Moyenne", HIGH: "Élevée", CRITICAL: "Critique" };
        return [{ label: "", value: `Priorité : ${labels[priorityMatch[1].toUpperCase()] || priorityMatch[1]} -> ${labels[priorityMatch[2].toUpperCase()] || priorityMatch[2]}` }];
    }

    const repairStatus = text.match(/Nature:\s*(.*?)(?=\s*Commentaire:|$)/i)?.[1]?.replace(/[.;,\s]+$/g, "").trim();
    const comment = text.match(/Commentaire:\s*(.*)$/i)?.[1]?.trim() || "";
    const rows: Array<{ label: string; value: string }> = [];

    if (repairStatus) {
        rows.push({ label: "Statut de réparation", value: repairStatus });
    }
    if (hasMeaningfulComment(comment)) {
        rows.push({ label: "Commentaire", value: comment });
    }
    if (rows.length === 0) {
        rows.push({ label: "", value: text });
    }
    return rows;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeInterventionDateValue(value: string | undefined, mode: "date" | "datetime"): string {
    const raw = String(value || "").trim();
    if (!raw) return "-";

    const lowered = raw.toLowerCase();
    if (lowered === "invalid date" || lowered === "non renseigné") return "-";

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return mode === "date" ? parsed.toLocaleDateString("fr-FR") : parsed.toLocaleString("fr-FR");
    }

    return raw;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatUsedPartPrice(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "-";
    return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function extractReportKey(entry: HistoryEntry): string {
    const raw = String(entry.note || "").trim();
    if (!raw) return "";
    try {
        const payload = JSON.parse(raw);
        if (payload && typeof payload === "object") {
            const reportNumber = typeof (payload as any).reportNumber === "string" ? String((payload as any).reportNumber).trim() : "";
            const pdfUrl = typeof (payload as any).pdfUrl === "string" ? String((payload as any).pdfUrl).trim() : "";
            return reportNumber || pdfUrl;
        }
    } catch {
        const match = raw.match(/RPT-\d{4}-\d+/i);
        if (match?.[0]) return match[0];
    }
    return "";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isReportClientNotification(entry: HistoryEntry): boolean {
    if (String(entry.action || "") !== "CLIENT_NOTIFICATION") return false;
    const raw = String(entry.note || "");
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (lower.includes("rapport") && (lower.includes("pdf") || lower.includes("disponible"))) return true;

    try {
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== "object") return false;
        return Boolean((payload as any).reportNumber || (payload as any).pdfUrl);
    } catch {
        return false;
    }
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function shouldDisplayHistoryEntry(entry: HistoryEntry, reportKeysFromTechnical: Set<string>) {
    const action = String(entry.action || "");
    const note = String(entry.note || "").toLowerCase();
    if (!action) return false;
    if (action === "Priority updated" || action === "Priorité mise à jour") return false;
    if (action.startsWith("MAGASINIER_") || action.includes("STORE_REVIEW")) return false;
    if (action === "ADV_QUALIFICATION_DOCUMENTS") return false;
    if (action === "ADV_MERCHANDISE_VERIFICATION") return false;
    if (action === "ADV_MERCHANDISE_REVIEW") return false;
    if (action === "ADV_VERIFICATION" && note.includes("vérification marchandise adv")) return false;
    if (note.includes("vérification marchandise adv enregistrée")) return false;
    if (action === "PART_REQUEST_NOTIFICATION") return false;
    if (action === "ADV_NOTIFICATION_TECHNICIAN") return false;
    if (action === "CLIENT_NOTIFICATION") return false;
    if (action === "Progress update" && note.includes("rapport final généré automatiquement")) return false;
    if (isReportClientNotification(entry)) {
        const key = extractReportKey(entry);
        if (key && reportKeysFromTechnical.has(key)) return false;
    }
    return true;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatHistoryNote(entry: HistoryEntry) {
    const action = String(entry.action || "");
    const statusChange = parseStatusChange(action);
    const raw = String(entry.note || "").trim();
    if (statusChange) {
        return `Statut du ticket: ${statusChange.from} -> ${statusChange.to}.`;
    }

    if (!raw) return formatTicketHistoryNote(entry) || "";

    if (action === "INTERNAL_TICKET") {
        try {
            const payload = JSON.parse(raw);
            if (!payload || typeof payload !== "object") return "Message interne enregistré.";
            const message = typeof payload.message === "string" ? payload.message.trim() : "";
            const attachmentName = typeof payload.attachmentName === "string" ? payload.attachmentName.trim() : "";
            if (message) return message;
            if (attachmentName) return `Pièce jointe: ${attachmentName}.`;
            return "Message interne enregistré.";
        } catch {
            return "Message interne enregistré.";
        }
    }

    if (action === "ADV_DECISION_TAKEN") return "";

    if (action === "TECHNICAL_REPORT") {
        const reportNumber = extractReportKey(entry);
        return reportNumber
            ? `Rapport technique ${reportNumber} généré et archivé (PDF disponible).`
            : "Rapport technique généré et archivé (PDF disponible).";
    }

    if (action === "CLIENT_NOTIFICATION") {
        if (isReportClientNotification(entry)) {
            const reportNumber = extractReportKey(entry);
            return reportNumber
                ? `Notification client: rapport ${reportNumber} disponible.`
                : "Notification client: rapport disponible.";
        }

        try {
            const payload = JSON.parse(raw);
            if (!payload || typeof payload !== "object") return raw;
            const message = typeof payload.message === "string" ? payload.message.trim() : "";
            const lowerMessage = message.toLowerCase();
            if (lowerMessage.includes("prise en charge") && !lowerMessage.includes("non prise en charge")) {
                return "Notification client: demande d'intervention prise en charge.";
            }
            return message || raw;
        } catch {
            const lowerRaw = raw.toLowerCase();
            if (lowerRaw.includes("prise en charge") && !lowerRaw.includes("non prise en charge")) {
                return "Notification client: demande d'intervention prise en charge.";
            }
            return raw;
        }
    }

    if (action === "CLIENT_UPDATE" || action === "ADV_UPDATE") {
        return "";
    }

    if (action === "ADV_QUALIFICATION") return "";

    if (action === "INTERVENTION_LOG") {
        const map = parseLineMap(raw);
        const dateIntervention = normalizeInterventionDateValue(map["Date d'intervention"], "date");
        const debut = normalizeInterventionDateValue(map["Debut"], "datetime");
        const fin = normalizeInterventionDateValue(map["Fin"], "datetime");
        const nature = toFrenchRepairNature(map["Nature de réparation"]);
        const savStep = toFrenchSavProgressStatus(map["Statut avancement"]);
        const comment = String(map["Commentaire"] || map["Commentaire technique"] || "").trim();
        return [
            savStep || "",
            nature ? `Nature: ${nature}` : "",
            hasMeaningfulComment(comment) ? `Commentaire: ${comment}` : "",
            dateIntervention !== "-" ? `Date: ${dateIntervention}` : "",
            debut !== "-" ? `Début: ${debut}` : "",
            fin !== "-" ? `Fin: ${fin}` : ""
        ]
            .filter((value, index, list) => Boolean(value) && list.indexOf(value) === index)
            .join(". ");
    }

    if (action === "PART_REQUEST") {
        return raw
            .replace(/ via la plateforme/gi, "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join(" | ");
    }

    if (action === "PART_REQUEST_SENT_TO_IMPORT") return "";

    if (action === "Progress update") return "";

    if (action === "CLIENT_ADDITIONAL_DOCUMENTS") {
        try {
            const payload = JSON.parse(raw);
            if (!payload || typeof payload !== "object") return "Documents complémentaires client ajoutés.";
            const message = typeof (payload as any).message === "string" ? String((payload as any).message).trim() : "";
            const attachments = Array.isArray((payload as any).attachments) ? (payload as any).attachments : [];
            if (message) return message;
            if (attachments.length > 0) return `${attachments.length} document(s) complémentaire(s) ajouté(s) par le client.`;
            return "Documents complémentaires client ajoutés.";
        } catch {
            return "Documents complémentaires client ajoutés.";
        }
    }

    if (raw.startsWith("{") && raw.endsWith("}")) {
        try {
            const payload = JSON.parse(raw);
            if (payload && typeof payload === "object") {
                const message = typeof (payload as any).message === "string" ? String((payload as any).message).trim() : "";
                if (message) return message;
                return "";
            }
        } catch {
            // fallback below
        }
    }

    return formatTicketHistoryNote(entry) || "";
}

function formatAssignmentWithoutQuoteNote(entry: HistoryEntry) {
    const raw = String(entry.note || "").trim();
    const technicianMatch =
        raw.match(/Technicien affecté\s*:\s*(.+)$/i)
        || raw.match(/validation du devis\s*:\s*(.+)$/i)
        || raw.match(/devis\s*:\s*(.+)$/i);
    const technicianName = technicianMatch?.[1]?.replace(/\.$/, "").trim();
    return technicianName ? `Technicien affecté : ${technicianName}.` : "Technicien affecté.";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function resolvePreviousStatusLabel(history: HistoryEntry[], currentEntry: HistoryEntry | undefined) {
    const currentIndex = history.findIndex((entry) => entry?.id === currentEntry?.id);
    if (currentIndex <= 0) return "Diagnostic";

    for (let index = currentIndex - 1; index >= 0; index -= 1) {
        const parsed = parseStatusChange(history[index]?.action);
        if (parsed?.to) return parsed.to;
    }

    return "Diagnostic";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function shouldHideClosedStatusAfterNonRepare(entry: HistoryEntry, history: HistoryEntry[]) {
    const action = String(entry.action || "").trim().toUpperCase();
    if (!action.startsWith("STATUS CHANGED:") || !action.endsWith("-> CLOSED")) {
        return false;
    }

    return history.some((candidate) => String(candidate.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketFollowUpWorkspaceProps = {
    backHref?: string;
    piecesLayout?: "cards" | "table";
    showPieces?: boolean;
};

export function TicketFollowUpWorkspace({ backHref = "/adv/tickets", piecesLayout = "cards", showPieces = true }: TicketFollowUpWorkspaceProps) {
    const params = useParams<{ ticketId?: string; id?: string }>();
    const searchParams = useSearchParams();
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketSummary[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
    const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const forcedTicketId = useMemo(() => {
        const rawParam = params?.ticketId ?? params?.id;
        const paramValue = Array.isArray(rawParam) ? rawParam[0] : rawParam;
        const value = Number(paramValue || searchParams.get("ticketId"));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [params, searchParams]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/tickets?light=1", { cache: "no-store" });
            const data = await response.json();
            const list = (Array.isArray(data) ? data : []).filter((ticket: TicketSummary) => {
                const isAdministrativelyClosed = Boolean(getAdministrativeClosureAt(ticket.savHistory || []));
                const isClosed = String(ticket.status || "").trim().toUpperCase() === "CLOSED";
                return !isAdministrativelyClosed && !isClosed;
            });
            setTickets(list);
            setSelectedTicketId((prev) => {
                if (forcedTicketId !== null) {
                    return forcedTicketId;
                }
                return prev && list.some((item: TicketSummary) => item.id === prev) ? prev : list[0]?.id ?? null;
            });
        } catch (error) {
            console.error("ADV suivi client tickets error:", error);
            setTickets([]);
            setSelectedTicketId(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchTicketDetail = async (ticketId: number) => {
        try {
            const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
            const data = await response.json();
            setSelectedTicket(data);
        } catch (error) {
            console.error("ADV suivi detail error:", error);
            setSelectedTicket(null);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        fetchTickets();
    }, [forcedTicketId]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        if (selectedTicketId) {
            fetchTicketDetail(selectedTicketId);
        } else {
            setSelectedTicket(null);
        }
    }, [selectedTicketId]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const checklistMeta = useMemo(() => parseChecklistPayload(selectedTicket?.reclamation?.checklist).metadata || {}, [selectedTicket?.reclamation?.checklist]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const advFollowUpInterventionLogsLocked = useMemo(() => {
        const merchandiseInfo = (checklistMeta as any)?.merchandiseInfo || {};
        const warrantyStatus = String(merchandiseInfo?.warrantyStatus || "").toUpperCase();
        const reclamationStatus = String((selectedTicket?.reclamation as any)?.status || "").toUpperCase();
        return warrantyStatus === "OUT_OF_WARRANTY" && reclamationStatus !== "QUOTE_APPROVED" && reclamationStatus !== "TAKEN_IN_CHARGE";
    }, [checklistMeta, selectedTicket?.reclamation]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const fullHistory = useMemo(() => {
        const all = Array.isArray(selectedTicket?.savHistory) ? selectedTicket?.savHistory : [];
        const reportKeysFromTechnical = new Set<string>(
            all
                .filter((entry) => String(entry.action || "") === "TECHNICAL_REPORT")
                .map((entry) => extractReportKey(entry))
                .filter((value: string) => value.length > 0)
        );
        const filtered = all.filter((entry) => shouldDisplayHistoryEntry(entry, reportKeysFromTechnical));
        return dedupeAndSortHistory(
            filtered.filter((entry) => !(advFollowUpInterventionLogsLocked && String(entry.action || "") === "INTERVENTION_LOG")),
            "asc"
        );
    }, [advFollowUpInterventionLogsLocked, selectedTicket?.savHistory]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const rawHistory = useMemo(
        () => dedupeAndSortHistory(Array.isArray(selectedTicket?.savHistory) ? selectedTicket.savHistory : [], "asc"),
        [selectedTicket?.savHistory]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const visibleHistory = useMemo(() => {
        const creationPresentation = getCreationHistoryPresentation(
            selectedTicket || null,
            String((checklistMeta as any)?.submittedByRole || "").trim().toUpperCase() || "CLIENT"
        );
        const syntheticCreationDate = resolveInterventionRequestDate(
            selectedTicket || null,
            checklistMeta,
            fullHistory[0]?.createdAt
        ) || new Date().toISOString();
        const ticketStatus = String(selectedTicket?.status || "").toUpperCase();
        const reclamationStatus = String((selectedTicket?.reclamation as any)?.status || "").toUpperCase();
        const hasConfirmedQuoteApproval = rawHistory.some((entry) => {
            const action = String(entry.action || "").trim().toUpperCase();
            return action === "CLIENT_QUOTE_APPROVED" || action === "QUOTE_CLIENT_APPROVED";
        });
        const qualificationCompletedByStatus = ["DIAGNOSTIC", "DECISION", "PENDING_PARTS", "REPAIR", "QUALITY_TEST", "READY_FOR_DELIVERY", "CLOSED"].includes(ticketStatus)
            || ["PENDING_STORE_REVIEW", "PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED", "TAKEN_IN_CHARGE", "QUOTE_REJECTED"].includes(reclamationStatus);
        const qualificationLogged = qualificationCompletedByStatus && fullHistory.some((entry) => {
            const action = String(entry.action || "");
            return action === "ADV_QUALIFICATION" || /^Status changed\s*:\s*[A-Z_]+\s*->\s*QUALIFICATION$/i.test(action);
        });
        const qualificationReached = qualificationLogged
            || qualificationCompletedByStatus;
        const diagnosticLogged = fullHistory.some((entry) => {
            const action = String(entry.action || "");
            const statusChange = parseStatusChange(action);
            const lineMap = parseLineMap(entry.note);
            return statusChange?.toRaw === "DIAGNOSTIC"
                || action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
                || String(lineMap["Statut avancement"] || "").trim().toUpperCase() === "DIAGNOSTIC";
        });
        const diagnosticReached = ["DIAGNOSTIC", "DECISION", "PENDING_PARTS", "REPAIR", "QUALITY_TEST", "READY_FOR_DELIVERY", "CLOSED"].includes(ticketStatus)
            || ["PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE", "QUOTE_REJECTED"].includes(reclamationStatus);
        const syntheticQualificationDate = fullHistory.find((entry) => {
            const action = String(entry.action || "");
            return action === "ADV_QUALIFICATION" || /^Status changed\s*:\s*[A-Z_]+\s*->\s*QUALIFICATION$/i.test(action);
        })?.createdAt || new Date(new Date(syntheticCreationDate).getTime() + 1000).toISOString();
        const assignmentDate = fullHistory.find((entry) => String(entry.action || "").toLowerCase().includes("assignment"))?.createdAt;
        const syntheticDiagnosticDate = fullHistory.find((entry) => {
            const action = String(entry.action || "");
            const statusChange = parseStatusChange(action);
            const lineMap = parseLineMap(entry.note);
            return statusChange?.toRaw === "DIAGNOSTIC"
                || action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
                || String(lineMap["Statut avancement"] || "").trim().toUpperCase() === "DIAGNOSTIC";
        })?.createdAt || new Date(new Date(assignmentDate || syntheticQualificationDate).getTime() + 1000).toISOString();
        const commentByHistoryEntryId = new Map<string, string>();
        const linkedCommentEntryIds = new Set<string>();
        fullHistory.forEach((entry, index) => {
            if (String(entry.action || "") !== "COMMENT_CLIENT") return;
            const comment = summarizeHistoryComment(entry.note);
            if (!comment) return;
            const commentAt = new Date(String(entry.createdAt || "")).getTime();
            if (!Number.isFinite(commentAt)) return;

            let bestEntryId = "";
            let bestDistance = Number.POSITIVE_INFINITY;
            fullHistory.forEach((candidate, candidateIndex) => {
                if (candidateIndex === index) return;
                const action = String(candidate.action || "");
                const isProgressEntry = action === "INTERVENTION_LOG" || action === "Progress update" || Boolean(parseStatusChange(action));
                if (!isProgressEntry) return;
                const candidateAt = new Date(String(candidate.createdAt || "")).getTime();
                if (!Number.isFinite(candidateAt)) return;
                const distance = Math.abs(candidateAt - commentAt);
                if (distance > 30 * 60 * 1000 || distance >= bestDistance) return;
                bestEntryId = String(candidate.id || "");
                bestDistance = distance;
            });

            if (!bestEntryId) return;
            commentByHistoryEntryId.set(bestEntryId, comment);
            linkedCommentEntryIds.add(String(entry.id));
        });

        const rows = [
            ...[{
                key: `created-${selectedTicket?.id || "ticket"}`,
                createdAt: syntheticCreationDate,
                tone: "info" as const,
                note: "",
                actor: creationPresentation.actor,
                actorRole: creationPresentation.actorRole,
                actionLabel: creationPresentation.actionLabel
            }],
            ...(qualificationReached && !qualificationLogged ? [{
                key: `validation-${selectedTicket?.id || "ticket"}`,
                createdAt: syntheticQualificationDate,
                tone: "success" as const,
                note: "",
                actor: actorRoleLabel("ADV"),
                actorRole: "ADV",
                actionLabel: "Ticket validé"
            }] : []),
            ...(diagnosticReached && !diagnosticLogged ? [{
                key: `diagnostic-${selectedTicket?.id || "ticket"}`,
                createdAt: syntheticDiagnosticDate,
                tone: "info" as const,
                note: "",
                actor: actorRoleLabel("SAV"),
                actorRole: "SAV",
                actionLabel: "Diagnostic"
            }] : []),
            ...fullHistory
                .filter((entry) => !shouldHideClosedStatusAfterNonRepare(entry, rawHistory))
                .filter((entry) => !(String(entry.action || "") === "ADV_QUALIFICATION" && !qualificationReached))
                .filter((entry) => !(String(entry.action || "") === "COMMENT_CLIENT" && linkedCommentEntryIds.has(String(entry.id))))
                .map((entry) => {
                const action = String(entry.action || "");
                const isIncorrectQuoteAssignment = !hasConfirmedQuoteApproval
                    && (action === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE" || action === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT");
                const statusChange = parseStatusChange(action);
                const isStatusChange = Boolean(statusChange);
                const isNonRepareOutcome = action === "FINAL_OUTCOME_NON_REPARE";
                const isSavProgress = action === "INTERVENTION_LOG" || action === "Progress update" || isStatusChange;
                const progressDisplay = isSavProgress ? buildSavProgressDisplay(entry, selectedTicket?.status) : null;
                const linkedComment = commentByHistoryEntryId.get(String(entry.id || ""));
                const progressDetail = [
                    progressDisplay?.detail || "",
                    hasMeaningfulComment(linkedComment) && !String(progressDisplay?.detail || "").toLowerCase().includes("commentaire:")
                        ? `Commentaire: ${linkedComment}`
                        : ""
                ].filter(Boolean).join(". ");
                return {
                    key: String(entry.id),
                    entry,
                    createdAt: entry.createdAt,
                    tone: getTicketHistoryTone(action),
                    note: isIncorrectQuoteAssignment
                        ? formatAssignmentWithoutQuoteNote(entry)
                        : progressDisplay
                        ? progressDetail
                        : isNonRepareOutcome
                        ? `${resolvePreviousStatusLabel(rawHistory, entry)} -> ${getStatusLabel("NON_REPARE")}.`
                        : String(formatHistoryNote(entry) || "").replace(/^Statut du ticket:\s*/i, ""),
                    actor: action === "CLIENT_UPDATE" || action === "ADV_UPDATE"
                        ? actorRoleLabel(getUpdateActorRole(entry))
                        : ["ADV_QUALIFICATION", "ADV_QUALIFICATION_DOCUMENTS"].includes(action)
                        ? actorRoleLabel("ADV")
                        : formatActorBadge(entry.user?.role, entry.user?.name),
                    actorRole: action === "CLIENT_UPDATE" || action === "ADV_UPDATE" ? getUpdateActorRole(entry) : entry.user?.role,
                    actionLabel: isIncorrectQuoteAssignment
                        ? formatHistoryActionForEntry({ ...entry, action: "TECH_MANAGER_ASSIGNMENT" })
                        : progressDisplay?.label || (isNonRepareOutcome ? getStatusLabel("NON_REPARE") : formatHistoryActionForEntry(entry))
                };
            })
        ];
        const hasVisibleDiagnostic = rows.some((item) => String(item.actionLabel || "").toLowerCase().includes("diagnostic"));
        const firstAssignment = rows.find((item) => String(item.actionLabel || "").toLowerCase().includes("affectation"));
        if (!hasVisibleDiagnostic && firstAssignment && diagnosticReached) {
            rows.push({
                key: `diagnostic-after-assignment-${selectedTicket?.id || "ticket"}`,
                createdAt: new Date(new Date(firstAssignment.createdAt).getTime() + 1000).toISOString(),
                tone: "info" as const,
                note: "",
                actor: actorRoleLabel("SAV"),
                actorRole: "SAV",
                actionLabel: "Diagnostic"
            });
        }
        return rows.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    }, [checklistMeta, fullHistory, rawHistory, selectedTicket, selectedTicket?.id]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const repairEntries = useMemo(() => {
        const technicalDiagnosis = (checklistMeta as any).technicalDiagnosis || {};
        return Array.isArray(technicalDiagnosis.repairEntries)
            ? technicalDiagnosis.repairEntries.filter((item: any) => item && [
                item.partsToReplace,
                item.designation,
                item.nature,
                item.quantity,
                item.supplierCode,
                item.sageCode,
                item.costPrice,
                item.purchasePrice,
                item.exportPrice,
                item.exportCurrency,
                item.salePriceTtc,
                item.importRequestRef,
                item.supplierReference,
                item.sageReference,
                item.partsToRepair,
                item.purchasedComponentsPrice,
                item.partsToFabricate,
                item.softwareUpdate,
                item.softwareInstallation
            ].some((value) => String(value ?? "").trim() !== ""))
            : [];
    }, [checklistMeta]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const usedParts = useMemo(() => {
        const technicalDiagnosis = (checklistMeta as any).technicalDiagnosis || {};
        return Array.isArray(technicalDiagnosis.usedParts)
            ? technicalDiagnosis.usedParts.filter((item: any) => item && (String(item.name || "").trim() || item.price !== undefined))
            : [];
    }, [checklistMeta]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const equipmentItems = useMemo(
        () => getTicketEquipmentDetails(selectedTicket),
        [selectedTicket]
    );
    const merchandiseDetails = useMemo(
        () => getReadOnlyMerchandiseDetails(selectedTicket),
        [selectedTicket]
    );
    const storeReviewNote = useMemo(() => getStoreReviewNote(selectedTicket), [selectedTicket]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    if (loading) {
        return <div className={styles.empty}>Chargement du détail ticket...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.shell}>
            <section className={forcedTicketId ? styles.content : styles.twoCol}>
            {!forcedTicketId ? (
                <article className={styles.sectionCard}>
                    <h2 className={styles.sectionTitle}>Détail ticket</h2>
                    {tickets.length === 0 ? (
                        <div className={styles.empty}>Aucun ticket disponible.</div>
                    ) : (
                        <ul className={styles.list}>
                            {tickets.map((ticket) => (
                                <li
                                    key={ticket.id}
                                    className={styles.listItem}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedTicketId(ticket.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelectedTicketId(ticket.id);
                                        }
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        borderColor: selectedTicketId === ticket.id ? "var(--primary-blue)" : undefined
                                    }}
                                >
                                    <div className={styles.itemMain}>
                                        <div className={styles.itemTitle}>Ticket #{ticket.ticketReference || ticket.displayId || ticket.id}</div>
                                        <span className={`${styles.statusBadge} ${statusClass(formatTicketStatus(ticket.status))}`}>{formatTicketStatus(ticket.status)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>
            ) : null}

            <article className={styles.sectionCard}>
                {!selectedTicket ? (
                    <div className={styles.empty}>Sélectionne un ticket pour afficher le détail ticket.</div>
                ) : (
                    <>
                        {forcedTicketId ? (
                            <div style={{ marginBottom: "0.85rem" }}>
                                <Link href={backHref} className="btn btn-outline">
                                    <ArrowLeft size={15} style={{ marginRight: "0.4rem", verticalAlign: "text-bottom" }} />
                                    Retour aux tickets
                                </Link>
                            </div>
                        ) : null}

                        <h2 className={styles.sectionTitle}>
                            <MessageSquare size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                            Ticket #{selectedTicket.ticketReference || selectedTicket.displayId || selectedTicket.id}
                        </h2>

                        {showPieces && (repairEntries.length > 0 || usedParts.length > 0) ? (
                            <section className={styles.listItem} style={{ marginTop: "0.75rem" }}>
                                <div className={styles.itemTitle}>Tableau des pièces et autres</div>
                                {piecesLayout === "table" ? (
                                    <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.65rem" }}>
                                        {repairEntries.length > 0 ? (
                                            <div className={styles.tableWrap}>
                                                <table className={styles.table}>
                                                    <thead>
                                                        <tr>
                                                            <th>Matériel</th>
                                                            <th>Nature</th>
                                                            <th>Description</th>
                                                            <th>Quantité</th>
                                                            <th>Code fournisseur</th>
                                                            <th>Code Sage</th>
                                                            <th>Prix de revient</th>
                                                            <th>Prix d'achat</th>
                                                            <th>Prix de vente TTC</th>
                                                            <th>Référence import</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {repairEntries.map((entry: any, index: number) => (
                                                            <tr key={`adv-repair-entry-table-${index}`}>
                                                                <td>{cleanDisplayValue(entry.equipmentLabel) || "-"}</td>
                                                                <td>{cleanDisplayValue(toFrenchRepairNature(entry.nature)) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.designation || entry.partsToReplace || entry.partsToRepair || entry.partsToFabricate || entry.softwareUpdate || entry.softwareInstallation) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.quantity) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.supplierCode || entry.supplierReference) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.sageCode || entry.sageReference) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.costPrice ?? entry.purchasedComponentsPrice) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.purchasePrice) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.salePriceTtc) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.importRequestRef) || "-"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : null}
                                        {usedParts.length > 0 ? (
                                            <div className={styles.tableWrap}>
                                                <table className={styles.table}>
                                                    <thead>
                                                        <tr>
                                                            <th>Pièce utilisée</th>
                                                            <th>Matériel</th>
                                                            <th>PN</th>
                                                            <th>Prix</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {usedParts.map((entry: any, index: number) => (
                                                            <tr key={`adv-used-part-table-${index}`}>
                                                                <td>{cleanDisplayValue(entry.name) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.equipmentLabel) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.equipmentPn) || "-"}</td>
                                                                <td>{cleanDisplayValue(entry.price) || "-"}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div style={{ display: "grid", gap: "0.8rem", marginTop: "0.65rem" }}>
                                        {repairEntries.map((entry: any, index: number) => (
                                            <RepairActivityCard key={`adv-repair-entry-${index}`} entry={entry} index={index} />
                                        ))}
                                        {usedParts.map((entry: any, index: number) => (
                                            <UsedPartActivityCard key={`adv-used-part-${index}`} entry={entry} index={index} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        ) : null}

                        <section className={styles.listItem} style={{ marginTop: "0.75rem" }}>
                            <div className={styles.itemTitle}>
                                <History size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                                Historique de la prise en charge
                            </div>
                                <div className={styles.timeline} style={{ marginTop: "0.6rem" }}>
                                    {visibleHistory.map((item) => {
                                        // Cette partie affiche l interface visible a l ecran.
                                        const detailRows = formatTimelineDetails(item.note);
                                        return (
                                        <div key={item.key} className={styles.timelineItem}>
                                            {item.actor && !String(item.key || "").startsWith("created-") ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.15rem" }}>
                                                    <span className={styles.statusBadge} style={actorRoleStyle(item.actorRole)}>
                                                        {item.actor}
                                                    </span>
                                                </div>
                                            ) : null}
                                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.55rem", flexWrap: "wrap" }}>
                                                {item.actionLabel ? <div className={styles.timelineTitle}>{item.actionLabel}</div> : null}
                                            </div>
                                            {detailRows.length > 0 ? (
                                                <div style={{ display: "grid", gap: "0.12rem", marginTop: "0.2rem" }}>
                                                    {detailRows.map((row, index) => (
                                                        <div key={`${item.key}-detail-${index}`} className={styles.timelineMeta} style={{ marginTop: 0 }}>
                                                            {row.label ? <strong>{row.label}: </strong> : null}
                                                            {row.value}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            <div className={styles.timelineMeta}>
                                                <span>{new Date(item.createdAt).toLocaleString("fr-FR")}</span>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                        </section>

                    </>
                )}
            </article>
            </section>
        </div>
    );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.65rem", background: "#f8fafc" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginBottom: "0.2rem" }}>{title}</div>
            <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{children || "-"}</div>
        </div>
    );
}

function OptionalInfoCard({ title, value }: { title: string; value: unknown }) {
    const displayValue = cleanDisplayValue(value);
    if (!displayValue) return null;
    return <InfoCard title={title}>{displayValue}</InfoCard>;
}

function getRepairEntryDescription(entry: any) {
    return cleanDisplayValue(
        entry?.designation
        || entry?.partsToReplace
        || entry?.partsToRepair
        || entry?.partsToFabricate
        || entry?.softwareUpdate
        || entry?.softwareInstallation
    );
}

function DetailValue({ label, value, wide = false }: { label: string; value: unknown; wide?: boolean }) {
    const displayValue = cleanDisplayValue(value);
    if (!displayValue) return null;
    return (
        <div
            style={{
                border: "1px solid #ead4d7",
                borderRadius: "8px",
                background: "#ffffff",
                padding: "0.5rem 0.6rem",
                gridColumn: wide ? "span 2" : undefined,
                minHeight: "52px"
            }}
        >
            <div style={{ color: "#5f4b4f", fontSize: "0.78rem", marginBottom: "0.25rem" }}>{label}</div>
            <div style={{ fontWeight: 800, color: "#111111", lineHeight: 1.35, wordBreak: "break-word" }}>{displayValue}</div>
        </div>
    );
}

function RepairActivityCard({ entry, index }: { entry: any; index: number }) {
    const nature = cleanDisplayValue(toFrenchRepairNature(entry?.nature)) || "Activité";
    const description = getRepairEntryDescription(entry);

    return (
        <article style={{ border: "1px solid #1f1f1f", borderRadius: "10px", overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.55rem", flexWrap: "wrap", padding: "0.55rem 0.7rem", borderBottom: "1px solid #ead4d7", background: "#fffafa" }}>
                <div>
                    <div style={{ fontWeight: 800, color: "#111111" }}>Activité {index + 1}</div>
                    {description ? <div className={styles.itemMeta}>{description}</div> : null}
                </div>
            </div>
            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", padding: "0.6rem" }}>
                <DetailValue label="Nature de l'activité" value={nature} />
                <DetailValue label="Description de la prestation" value={description} wide />
                <DetailValue label="Quantité" value={entry?.quantity} />
                <DetailValue label="Code fournisseur" value={entry?.supplierCode || entry?.supplierReference} />
                <DetailValue label="Code Sage" value={entry?.sageCode || entry?.sageReference} />
                <DetailValue label="Export price" value={entry?.exportPrice} />
                <DetailValue label="Devise export" value={entry?.exportCurrency} />
                <DetailValue label="Référence import" value={entry?.importRequestRef} />
            </div>
        </article>
    );
}

function UsedPartActivityCard({ entry, index }: { entry: any; index: number }) {
    return (
        <article style={{ border: "1px solid #1f1f1f", borderRadius: "10px", overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", padding: "0.75rem 0.85rem", borderBottom: "1px solid #ead4d7", background: "#fffafa" }}>
                <div style={{ fontWeight: 800, color: "#111111" }}>Pièce utilisée {index + 1}</div>
                <span className={`${styles.statusBadge} ${styles.statusInfo}`}>Pièce de rechange à utiliser</span>
            </div>
            <div style={{ display: "grid", gap: "0.65rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", padding: "0.85rem" }}>
                <DetailValue label="Pièce" value={entry?.name} />
                <DetailValue label="Matériel à réparer" value={entry?.equipmentLabel} />
                <DetailValue label="PN" value={entry?.equipmentPn} />
                <DetailValue label="Prix" value={entry?.price} />
            </div>
        </article>
    );
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvSuiviClientPage() {
    return <TicketFollowUpWorkspace />;
}
/*
Resume simple :
- Ce fichier sert a la partie "suivi client" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
