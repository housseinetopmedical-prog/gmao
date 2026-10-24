import { getOrderedSosAnswers, normalizeDocumentUrl, parseChecklistPayload } from "@/metier/workflow-client";
import { formatFallbackStatusLabel } from "@/metier/libelles-statut";

export type AdvStatusTone = "info" | "warn" | "danger" | "success";

export type ReclamationUrgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export const URGENCY_LABELS: Record<ReclamationUrgency, string> = {
    LOW: "Faible",
    MEDIUM: "Moyenne",
    HIGH: "Élevée",
    CRITICAL: "Critique"
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
    OPEN: "Nouveau",
    QUALIFICATION: "Validation",
    PENDING_ADV_VERIFICATION: "Vérification ADV en cours",
    PENDING_STORE_REVIEW: "Attente infos DP",
    PENDING_TECHNICAL_MANAGER_REVIEW: "Analyse responsable technique en cours",
    READY_FOR_TECHNICAL_MANAGER: "Prêt pour décision responsable technique",
    DECISION_UNDER_WARRANTY: "Décision : Sous garantie",
    DECISION_OUT_OF_WARRANTY: "Décision : Hors garantie",
    PENDING_ADV_QUOTE: "Devis à préparer",
    QUOTE_SENT_TO_CLIENT: "Devis envoyé au client",
    QUOTE_APPROVED: "Devis validé par le client",
    QUOTE_REJECTED: "Devis refusé par le client",
    TAKEN_IN_CHARGE: "Prise en charge",
    NOT_TAKEN_IN_CHARGE: "Non prise en charge",
    PENDING_TECHNICIAN_ASSIGNMENT: "Prêt pour affectation technicien",
    DIAGNOSTIC: "Diagnostic",
    PENDING_PARTS: "Attente pièces",
    REPAIR: "Réparation en cours",
    QUALITY_TEST: "Réparation en cours",
    READY_FOR_DELIVERY: "Matériel réparé à livrer",
    CLOSED: "Dossier clôturé"
};

export function formatTicketStatus(status: string | null | undefined): string {
    if (!status) return "En attente";
    return TICKET_STATUS_LABELS[status] || formatFallbackStatusLabel(status);
}

export function getUrgencyFromReclamation(reclamation: any): ReclamationUrgency {
    const parsed = parseChecklistPayload(reclamation?.checklist);
    const raw = String(parsed?.metadata?.urgency || "").toUpperCase();

    if (raw === "LOW" || raw === "MEDIUM" || raw === "HIGH" || raw === "CRITICAL") {
        return raw;
    }

    const ticketPriority = String(reclamation?.ticket?.priority || "").toUpperCase();
    if (ticketPriority === "LOW" || ticketPriority === "MEDIUM" || ticketPriority === "HIGH" || ticketPriority === "CRITICAL") {
        return ticketPriority;
    }

    return "MEDIUM";
}

export function urgencyRank(urgency: ReclamationUrgency): number {
    if (urgency === "CRITICAL") return 4;
    if (urgency === "HIGH") return 3;
    if (urgency === "MEDIUM") return 2;
    return 1;
}

export function getUrgencyToneClass(urgency: ReclamationUrgency): string {
    if (urgency === "CRITICAL") return "urgencyCritical";
    if (urgency === "HIGH") return "urgencyHigh";
    if (urgency === "MEDIUM") return "urgencyMedium";
    return "urgencyLow";
}

export function getReclamationStatusLabel(status: string): string {
    if (status === "VALIDATED") return "Validé";
    if (status === "PENDING_ADV" || status === "PENDING") return "Validation en attente";
    if (status === "PENDING_ADV_VERIFICATION") return "Demande en vérification ADV";
    if (status === "PENDING_STORE_REVIEW") return "Attente infos DP";
    if (status === "PENDING_TECHNICAL_MANAGER_REVIEW") return "En analyse responsable technique";
    if (status === "READY_FOR_TECHNICAL_MANAGER") return "Prêt pour décision responsable technique";
    if (status === "DECISION_UNDER_WARRANTY") return "Décision : Sous garantie";
    if (status === "DECISION_OUT_OF_WARRANTY") return "Décision : Hors garantie";
    if (status === "PENDING_ADV_QUOTE") return "Devis en attente de validation";
    if (status === "QUOTE_SENT_TO_CLIENT") return "Devis envoyé au client";
    if (status === "QUOTE_APPROVED") return "Devis validé par le client";
    if (status === "QUOTE_REJECTED") return "Devis refusé par le client";
    if (status === "PENDING_TECHNICIAN_ASSIGNMENT") return "Prêt pour affectation technicien";
    if (status === "TAKEN_IN_CHARGE") return "Prise en charge";
    if (status === "NOT_TAKEN_IN_CHARGE") return "Non prise en charge";
    if (status === "READY_FOR_TECH_MANAGER_ASSIGNMENT") return "Prêt pour affectation technicien";
    if (status === "QUALIFIED_PENDING_ASSIGNMENT") return "Demande qualifiée";
    if (status === "QUALIFICATION") return "Validation";
    return formatFallbackStatusLabel(status);
}

export function getStatusTone(statusLabel: string): AdvStatusTone {
    const value = String(statusLabel || "").toLowerCase();
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("non prise") || normalized.includes("refus") || normalized.includes("bloque")) return "danger";
    if (normalized.includes("attente") || normalized.includes("piece") || normalized.includes("verification") || normalized.includes("analyse") || normalized.includes("en cours") || normalized.includes("pret pour")) return "warn";
    if (normalized.includes("cloture") || normalized.includes("prise en charge") || normalized.includes("valide") || normalized.includes("approuve")) return "success";
    return "info";
}

export function getChecklistMetadata(reclamation: any) {
    const parsed = parseChecklistPayload(reclamation?.checklist);
    return parsed?.metadata || {};
}

function canonicalAttachmentName(raw: string | null | undefined): string {
    let value = String(raw || "").trim().toLowerCase();
    if (!value) return "";

    const noQuery = value.split("?")[0].split("#")[0];
    const basename = noQuery.split("/").pop() || "";
    value = decodeURIComponent(basename);

    for (let i = 0; i < 3; i += 1) {
        const next = value.replace(/^\d{10,}-[a-z0-9]+-/i, "");
        if (next === value) break;
        value = next;
    }

    return value.replace(/\(\d+\)(?=\.[a-z0-9]+$)/i, "");
}

export function extractClientDocuments(reclamation: any): Array<{
    name: string;
    type?: string;
    title?: string;
    kind: "DOCUMENT" | "MEDIA";
    dataUrl?: string;
}> {
    const parsed = parseChecklistPayload(reclamation?.checklist);
    const checklistAttachments = Array.isArray(parsed?.metadata?.attachments) ? parsed.metadata.attachments : [];

    const fromChecklist = checklistAttachments.map((item) => ({
        name: String(item.name || "Pièce jointe"),
        type: item.type,
        title: item.title,
        kind: (item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT") as "DOCUMENT" | "MEDIA",
        dataUrl: normalizeDocumentUrl(item.dataUrl)
    }));

    const fromMainAttachment = reclamation?.attachmentUrl
        ? [
              {
                  name: "Pièce jointe demande d'intervention",
                  type: undefined,
                  kind: "DOCUMENT" as const,
                  dataUrl: normalizeDocumentUrl(String(reclamation.attachmentUrl))
              }
          ]
        : [];

    const dedup = new Map<string, { name: string; type?: string; kind: "DOCUMENT" | "MEDIA"; dataUrl?: string }>();
    [...fromChecklist, ...fromMainAttachment].forEach((doc) => {
        const canonicalFromUrl = canonicalAttachmentName(doc.dataUrl);
        const canonicalFromName = canonicalAttachmentName(doc.name);
        const normalizedUrl = String(doc.dataUrl || "").trim().toLowerCase();
        const key = canonicalFromUrl
            ? `canonical:${doc.kind}|${canonicalFromUrl}`
            : normalizedUrl.length > 0
                ? `url:${normalizedUrl}`
                : canonicalFromName
                    ? `name:${doc.kind}|${canonicalFromName}`
                    : `meta:${doc.kind}|${doc.type || ""}|${doc.name}`;
        if (!dedup.has(key)) {
            dedup.set(key, doc);
        }
    });

    return Array.from(dedup.values());
}

export function getSosAnswers(reclamation: any): Array<{ key: string; label: string; value: boolean | null }> {
    return getOrderedSosAnswers(reclamation?.checklist);
}

export function formatInterventionType(raw: string | null | undefined): string {
    const value = String(raw || "").toUpperCase();
    if (value === "SITE" || value === "SUR SITE") return "Sur site";
    if (value === "WORKSHOP" || value === "EN ATELIER") return "Atelier";
    return value || "-";
}

export function isLateTicket(ticket: any): boolean {
    if (!ticket?.estimatedEndDate) return false;
    if (ticket?.status === "CLOSED") return false;
    const estimatedEnd = new Date(ticket.estimatedEndDate).getTime();
    if (!Number.isFinite(estimatedEnd)) return false;
    const LATE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
    return Date.now() - estimatedEnd >= LATE_THRESHOLD_MS;
}

export function updatedHoursAgo(ticket: any): number {
    const updatedAt =
        ticket?.updatedAt ? new Date(ticket.updatedAt).getTime() :
            ticket?.createdAt ? new Date(ticket.createdAt).getTime() : Date.now();
    return Math.max(0, Math.round((Date.now() - updatedAt) / (1000 * 60 * 60)));
}

export function reclamationHoursAgo(ticket: any): number {
    const referenceMs =
        ticket?.reclamation?.createdAt ? new Date(ticket.reclamation.createdAt).getTime() :
            ticket?.createdAt ? new Date(ticket.createdAt).getTime() :
                ticket?.updatedAt ? new Date(ticket.updatedAt).getTime() : Date.now();

    if (!Number.isFinite(referenceMs)) return 0;
    return Math.max(0, Math.round((Date.now() - referenceMs) / (1000 * 60 * 60)));
}

const TECHNICIAN_ASSIGNMENT_ACTIONS = new Set([
    "TECH_MANAGER_ASSIGNMENT",
    "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE",
    "TECHNICIAN_ASSIGNED",
    "Technician assignment updated"
]);

function toTimestamp(value: unknown): number | null {
    if (!value) return null;
    const timestamp = new Date(String(value)).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function getLatestTechnicianAssignmentAt(ticket: any): string | null {
    const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];

    const latest = history
        .filter((entry: any) => TECHNICIAN_ASSIGNMENT_ACTIONS.has(String(entry?.action || "")))
        .sort((a: any, b: any) => (toTimestamp(b?.createdAt) || 0) - (toTimestamp(a?.createdAt) || 0))[0];

    return latest?.createdAt ? String(latest.createdAt) : null;
}

export function assignmentHoursAgo(ticket: any): number {
    const assignedAt = getLatestTechnicianAssignmentAt(ticket);
    const assignedMs = toTimestamp(assignedAt);
    if (!assignedMs) return 0;
    return Math.max(0, Math.round((Date.now() - assignedMs) / (1000 * 60 * 60)));
}

export function hasNoUpdateSinceAssignment(ticket: any): boolean {
    const assignedMs = toTimestamp(getLatestTechnicianAssignmentAt(ticket));
    const updatedMs = toTimestamp(ticket?.updatedAt);

    if (!assignedMs || !updatedMs) return false;

    const UPDATE_GRACE_PERIOD_MS = 5 * 60 * 1000;
    return updatedMs - assignedMs <= UPDATE_GRACE_PERIOD_MS;
}

export function needsTechnicianFollowUp(ticket: any): boolean {
    if (!ticket?.assignedToId) return false;
    if (ticket?.status === "CLOSED") return false;
    return assignmentHoursAgo(ticket) >= 24 && hasNoUpdateSinceAssignment(ticket);
}


