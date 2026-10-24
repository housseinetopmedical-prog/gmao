import { getOrderedSosAnswers } from "@/metier/workflow-client";
import { formatFallbackStatusLabel } from "@/metier/libelles-statut";

export const TECH_STATUS_OPTIONS = [
    "DIAGNOSTIC",
    "REPAIR",
    "READY_FOR_DELIVERY"
] as const;

export const REPAIR_TYPE_OPTIONS = [
    { value: "SUPPLIER_RETURN_WAIT", label: "Attente retour du fournisseur" },
    { value: "LOCAL_PART_PURCHASE", label: "Achat local de pièce détachée" },
    { value: "DP_PART_RETURN", label: "Retour pièce du DP" },
    { value: "SOFTWARE_UPDATE", label: "MAJ logiciel" },
    { value: "SOFTWARE_INSTALLATION", label: "Nouvelle installation / logiciel" },
    { value: "PART_TO_MANUFACTURE", label: "Pièce à fabriquer" }
] as const;

export const TECH_STATUS_LABELS: Record<string, string> = {
    OPEN: "Validation",
    DIAGNOSTIC: "Diagnostic",
    DECISION: "Décision",
    PENDING_PARTS: "Attente pièces",
    REPAIR: "Réparation",
    QUALITY_TEST: "Réparation",
    READY_FOR_DELIVERY: "Matériel réparé à livrer",
    CLOSED: "Clôture administrative ADV",
    NON_REPARE: "Irréparable"
};

export const TECH_PRIORITY_LABELS: Record<string, string> = {
    LOW: "Faible",
    MEDIUM: "Moyenne",
    HIGH: "Élevée",
    CRITICAL: "Critique"
};

export const TECH_PRIORITY_COLORS: Record<string, string> = {
    LOW: "#16a34a",
    MEDIUM: "#f59e0b",
    HIGH: "#ea580c",
    CRITICAL: "#dc2626"
};

export function normalizeSeverityLevel(value: string | null | undefined): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW" || normalized === "MEDIUM" || normalized === "HIGH" || normalized === "CRITICAL") {
        return normalized;
    }
    return null;
}

export function getSeverityBadgeStyle(value: string | null | undefined) {
    const level = normalizeSeverityLevel(value);
    if (level === "CRITICAL") return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" };
    if (level === "HIGH") return { background: "#ffedd5", color: "#c2410c", border: "1px solid #fdba74" };
    if (level === "MEDIUM") return { background: "#fef3c7", color: "#b45309", border: "1px solid #fcd34d" };
    if (level === "LOW") return { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" };
    return { background: "#e2e8f0", color: "#475569", border: "1px solid #cbd5e1" };
}

export function getStatusLabel(status: string | null | undefined): string {
    if (!status) return "Non défini";
    return TECH_STATUS_LABELS[status] || formatFallbackStatusLabel(status);
}

export function normalizeTechProgressStatus(raw: string | null | undefined) {
    if (raw === "PENDING_PARTS") return "REPAIR";
    if (raw === "NON_REPARE") return "NON_REPARE";
    if (raw && TECH_STATUS_OPTIONS.includes(raw as (typeof TECH_STATUS_OPTIONS)[number])) {
        return raw;
    }
    return "DIAGNOSTIC";
}

export function getPriorityLabel(priority: string | null | undefined): string {
    if (!priority) return "Moyenne";
    return TECH_PRIORITY_LABELS[priority] || priority;
}

export function getInterventionLabel(value: string | null | undefined): string {
    if (!value) return "Non précisée";
    const raw = String(value).toUpperCase();
    if (raw === "SITE" || raw === "SUR SITE") return "Sur site";
    if (raw === "WORKSHOP" || raw === "EN ATELIER") return "En atelier";
    return value;
}

function parseDateSafe(value: string | Date | null | undefined): Date | null {
    if (!value) return null;

    if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        const year = value.getFullYear();
        if (year < 1000 || year > 9999) return null;
        return value;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const isoLocal = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (isoLocal) {
        const [, y, m, d, hh, mm, ss] = isoLocal;
        const parsed = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss || "0"));
        if (Number.isNaN(parsed.getTime())) return null;
        const year = parsed.getFullYear();
        if (year < 1000 || year > 9999) return null;
        return parsed;
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    if (year < 1000 || year > 9999) return null;
    return parsed;
}

export function formatDateTime(value: string | Date | null | undefined): string {
    const parsed = parseDateSafe(value);
    if (!parsed) return "-";
    return parsed.toLocaleString("fr-FR");
}

export function formatDate(value: string | Date | null | undefined): string {
    const parsed = parseDateSafe(value);
    if (!parsed) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

export function parseChecklistForTechnician(checklistRaw: unknown): Array<{ label: string; answer: string }> {
    return getOrderedSosAnswers(checklistRaw).map((item) => ({
        label: item.label,
        answer: item.value === true ? "Oui" : item.value === false ? "Non" : "Non renseigné"
    }));
}

const TECHNICIAN_ASSIGNMENT_ACTIONS = new Set([
    "TECH_MANAGER_ASSIGNMENT",
    "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE",
    "TECHNICIAN_ASSIGNED",
    "Technician assignment updated"
]);

function toHistoryTimestamp(value: unknown): number | null {
    if (!value) return null;
    const timestamp = new Date(String(value)).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function getLatestTechnicianAssignmentAt(ticket: any): string | null {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const latest = history
        .filter((entry: any) => TECHNICIAN_ASSIGNMENT_ACTIONS.has(String(entry?.action || "")))
        .sort((a: any, b: any) => (toHistoryTimestamp(b?.createdAt) || 0) - (toHistoryTimestamp(a?.createdAt) || 0))[0];

    return latest?.createdAt ? String(latest.createdAt) : null;
}

export function wasClientUpdateRecordedAfterAssignment(ticket: any): boolean {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const assignmentMs = toHistoryTimestamp(getLatestTechnicianAssignmentAt(ticket));
    if (!assignmentMs) return false;

    return history.some((entry: any) => {
        if (String(entry?.action || "") !== "CLIENT_UPDATE") return false;
        const clientUpdateMs = toHistoryTimestamp(entry?.createdAt);
        return Boolean(clientUpdateMs && clientUpdateMs > assignmentMs);
    });
}

function isQuoteApprovalHistoryAction(action: string) {
    return action === "CLIENT_QUOTE_APPROVED" || action === "QUOTE_CLIENT_APPROVED";
}

function isTechnicalStatusChangeAction(action: string) {
    return action.startsWith("Status changed:");
}

export function getLatestTechnicalStatusChangeAt(ticket: any): string | null {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const latest = history
        .filter((entry: any) => isTechnicalStatusChangeAction(String(entry?.action || "")))
        .sort((a: any, b: any) => (toHistoryTimestamp(b?.createdAt) || 0) - (toHistoryTimestamp(a?.createdAt) || 0))[0];

    return latest?.createdAt ? String(latest.createdAt) : null;
}

export function getTechnicianRepairStatusReferenceAt(ticket: any): string | null {
    return getLatestTechnicalStatusChangeAt(ticket)
        || getLatestTechnicianAssignmentAt(ticket)
        || ticket?.createdAt
        || null;
}

export function hasTechnicianRepairStatusStaleAlert(ticket: any, daysLimit = 7): boolean {
    const normalizedTicketStatus = String(ticket?.status || "").trim().toUpperCase();
    if (["READY_FOR_DELIVERY", "CLOSED", "NON_REPARE"].includes(normalizedTicketStatus)) {
        return false;
    }

    const referenceAt = getTechnicianRepairStatusReferenceAt(ticket);
    const referenceMs = toHistoryTimestamp(referenceAt);
    if (!referenceMs) return false;

    const elapsedMs = Date.now() - referenceMs;
    return elapsedMs > daysLimit * 24 * 60 * 60 * 1000;
}

export function getLatestQuoteApprovalAt(ticket: any): string | null {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const latest = history
        .filter((entry: any) => isQuoteApprovalHistoryAction(String(entry?.action || "")))
        .sort((a: any, b: any) => (toHistoryTimestamp(b?.createdAt) || 0) - (toHistoryTimestamp(a?.createdAt) || 0))[0];

    if (latest?.createdAt) {
        return String(latest.createdAt);
    }

    const reclamationStatus = String(ticket?.reclamation?.status || "").trim().toUpperCase();
    if (reclamationStatus === "QUOTE_APPROVED") {
        return String(ticket?.reclamation?.updatedAt || ticket?.updatedAt || ticket?.createdAt || "") || null;
    }

    return null;
}

export function hasPendingQuoteApprovedAlert(ticket: any): boolean {
    const quoteApprovedAt = getLatestQuoteApprovalAt(ticket);
    const quoteApprovedMs = toHistoryTimestamp(quoteApprovedAt);
    if (!quoteApprovedMs) return false;

    const normalizedTicketStatus = String(ticket?.status || "").trim().toUpperCase();
    if (normalizedTicketStatus === "READY_FOR_DELIVERY" || normalizedTicketStatus === "CLOSED") {
        return false;
    }

    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
    const hasTechnicalWorkAfterQuote = history.some((entry: any) => {
        const action = String(entry?.action || "");
        if (
            action !== "INTERVENTION_LOG"
            && action !== "TECHNICAL_REPORT"
            && action !== "INTERVENTION_VALIDATED"
            && action !== "FINAL_OUTCOME_NON_REPARE"
            && !isTechnicalStatusChangeAction(action)
        ) {
            return false;
        }
        const createdAtMs = toHistoryTimestamp(entry?.createdAt);
        return Boolean(createdAtMs && createdAtMs > quoteApprovedMs);
    });

    return !hasTechnicalWorkAfterQuote;
}

export function canTechnicianModifyRepairStatus(ticket: any): boolean {
    const reclamationStatus = String(ticket?.reclamation?.status || "").trim().toUpperCase();
    const normalizedTicketStatus = String(ticket?.status || "").trim().toUpperCase();

    if (normalizedTicketStatus === "READY_FOR_DELIVERY" || normalizedTicketStatus === "CLOSED") {
        return false;
    }

    return ["QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE"].includes(reclamationStatus)
        || hasPendingQuoteApprovedAlert(ticket);
}

export function getTicketTechnicianDayReferenceAt(ticket: any): string | null {
    return getLatestTechnicianAssignmentAt(ticket) || ticket?.updatedAt || ticket?.createdAt || null;
}

export function computeTechMetrics(tickets: any[]) {
    const now = new Date();
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const openTickets = tickets.filter((ticket) => !["READY_FOR_DELIVERY", "CLOSED"].includes(String(ticket.status || "")));
    const urgences = openTickets.filter((ticket) => ["HIGH", "CRITICAL"].includes(ticket.priority)).length;
    const ticketsToday = openTickets.filter((ticket) => {
        const reference = getTicketTechnicianDayReferenceAt(ticket);
        const referenceMs = reference ? new Date(reference).getTime() : NaN;
        return Number.isFinite(referenceMs) && referenceMs >= startToday.getTime();
    }).length;
    const ticketsSite = openTickets.filter((ticket) => {
        const raw = String(ticket.interventionType || ticket.reclamation?.interventionType || "").toUpperCase();
        return raw === "SITE" || raw === "SUR SITE";
    }).length;
    const ticketsAtelier = openTickets.filter((ticket) => {
        const raw = String(ticket.interventionType || ticket.reclamation?.interventionType || "").toUpperCase();
        return raw === "WORKSHOP" || raw === "EN ATELIER";
    }).length;
    const waitingParts = openTickets.filter((ticket) => ticket.status === "PENDING_PARTS").length;
    const inTest = openTickets.filter((ticket) => ticket.status === "QUALITY_TEST").length;
    const overdue = openTickets.filter((ticket) => ticket.estimatedEndDate && new Date(ticket.estimatedEndDate).getTime() < now.getTime()).length;

    return {
        assigned: openTickets.length,
        urgences,
        ticketsToday,
        ticketsSite,
        ticketsAtelier,
        waitingParts,
        inTest,
        alerts: overdue + urgences
    };
}


