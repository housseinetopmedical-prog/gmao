import { formatFallbackStatusLabel } from "@/metier/libelles-statut";

type HistoryEntryLike = {
    id?: number | null;
    action?: string | null;
    note?: string | null;
    createdAt?: string | null;
    user?: {
        id?: number | null;
        name?: string | null;
        role?: string | null;
    } | null;
};

// Cette table traduit les statuts techniques en mots plus clairs pour l'utilisateur.
const STATUS_LABELS: Record<string, string> = {
    OPEN: "Nouveau",
    QUALIFICATION: "Validation",
    PENDING_ADV_VERIFICATION: "Vérification ADV en cours",
    PENDING_STORE_REVIEW: "Attente infos DP",
    PENDING_TECHNICAL_MANAGER_REVIEW: "Analyse responsable technique en cours",
    READY_FOR_TECH_MANAGER_ASSIGNMENT: "Prêt pour affectation technicien",
    DECISION_UNDER_WARRANTY: "Décision sous garantie",
    DECISION_OUT_OF_WARRANTY: "Décision hors garantie",
    PENDING_ADV_QUOTE: "Devis à préparer",
    QUOTE_SENT_TO_CLIENT: "Devis soumis au client",
    QUOTE_APPROVED: "Devis approuvé par le client",
    QUOTE_REJECTED: "Devis refusé par le client",
    TAKEN_IN_CHARGE: "Prise en charge de la réparation",
    NOT_TAKEN_IN_CHARGE: "Non prise en charge",
    PENDING_TECHNICIAN_ASSIGNMENT: "Affectation technicien",
    DIAGNOSTIC: "Diagnostic",
    DECISION: "Décision",
    PENDING_PARTS: "Attente pièces",
    REPAIR: "Réparation",
    QUALITY_TEST: "Réparation",
    READY_FOR_DELIVERY: "Matériel réparé à livrer",
    CLOSED: "Dossier clôturé",
    NON_REPARE: "Irréparable"
};

// Nettoie certains caractères cassés dans les textes.
function cleanFrenchText(value: string) {
    return String(value || "")
        .replace(/\uFFFD/g, "");
}

// Récupère l'historique quel que soit l'endroit où il est stocké dans l'objet reçu.
function getHistoryRows(input: any): HistoryEntryLike[] {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input?.savHistory)) return input.savHistory;
    if (Array.isArray(input?.ticket?.savHistory)) return input.ticket.savHistory;
    return [];
}

export function hasTechnicalReportInHistory(input: any): boolean {
    return getHistoryRows(input).some((entry) => String(entry?.action || "") === "TECHNICAL_REPORT");
}

// Transforme un code de statut en texte lisible.
function getStatusLabel(raw: string | null | undefined) {
    const value = String(raw || "").trim().toUpperCase();
    return STATUS_LABELS[value] || formatFallbackStatusLabel(value);
}

// Essaie de lire un texte JSON sans faire planter l'application.
function parseJson(raw: string) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Reformule un message fournisseur pour qu'il soit compréhensible dans l'historique.
function formatSupplierEmailNote(raw: string, direction: "sent" | "received") {
    const payload = parseJson(raw);
    if (!payload || typeof payload !== "object") return "";

    const orderRef = String((payload as any).orderRef || "").trim();
    const supplier = String((payload as any).supplier || "").trim();
    const supplierEmail = String((payload as any).supplierEmail || "").trim();
    const subject = String((payload as any).subject || "").replace(/^(re|tr|fw|fwd)\s*:\s*/i, "").trim();
    const bodyText = String((payload as any).bodyText || "").replace(/\s+/g, " ").trim();
    const attachments = Array.isArray((payload as any).attachments) ? (payload as any).attachments.length : 0;

    const lines = [
        direction === "received" ? "E-mail fournisseur reçu." : "E-mail envoyé au fournisseur.",
        orderRef ? `Commande: ${orderRef}.` : "",
        supplier ? `Fournisseur: ${supplier}.` : supplierEmail ? `Fournisseur: ${supplierEmail}.` : "",
        subject ? `Objet: ${subject}.` : "",
        bodyText ? `Message: ${bodyText.slice(0, 140)}${bodyText.length > 140 ? "..." : ""}` : "",
        attachments > 0 ? `Pièce jointe: ${attachments}.` : ""
    ];

    return lines.filter(Boolean).join(" ");
}

// Reformule le lancement d'une commande import sous forme de phrase simple.
function parseImportOrderLaunchNote(raw: string) {
    const payload = parseJson(raw);
    if (!payload || typeof payload !== "object") return "";

    const expectedDate = normalizeDateValue(String((payload as any).expectedDate || ""), "date");
    const items = Array.isArray((payload as any).items) ? (payload as any).items : [];
    const itemsLabel = items
        .map((item: any) => {
            const name = String(item?.name || "Pièce").trim();
            const ref = String(item?.ref || "").trim();
            const qty = Math.max(1, Number(item?.qty || 1) || 1);
            return ref ? `${name} (${ref}) x${qty}` : `${name} x${qty}`;
        })
        .filter(Boolean)
        .join(", ");

    return [
        "Commande import lancée.",
        expectedDate !== "-" ? `Date prévisionnelle: ${expectedDate}.` : "",
        itemsLabel ? `Pièces: ${itemsLabel}.` : ""
    ].filter(Boolean).join(" ");
}

function parseImportOrderShipmentNote(raw: string) {
    const payload = parseJson(raw);
    if (!payload || typeof payload !== "object") return "";

    const expectedDate = normalizeDateValue(String((payload as any).expectedDate || ""), "date");
    const items = Array.isArray((payload as any).items) ? (payload as any).items : [];
    const itemsLabel = items
        .map((item: any) => {
            const name = String(item?.name || "Pièce").trim();
            const ref = String(item?.ref || "").trim();
            const qty = Math.max(1, Number(item?.qty || 1) || 1);
            return ref ? `${name} (${ref}) x${qty}` : `${name} x${qty}`;
        })
        .filter(Boolean)
        .join(", ");

    return [
        "Commande import expédiée.",
        expectedDate !== "-" ? `Date prévisionnelle: ${expectedDate}.` : "",
        itemsLabel ? `Pièces: ${itemsLabel}.` : ""
    ].filter(Boolean).join(" ");
}

function parseLineMap(note: string | null | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    const raw = String(note || "").trim();
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

function getHistoryMinuteKey(entry: HistoryEntryLike) {
    return new Date(String(entry.createdAt || Date.now())).toISOString().slice(0, 16);
}

function getLineMapValue(map: Record<string, string>, labels: string[]) {
    for (const label of labels) {
        if (map[label]) return map[label];
    }
    return "";
}

function canMergePartRequestHistory(requestEntry: HistoryEntryLike, importEntry: HistoryEntryLike) {
    if (String(requestEntry?.action || "") !== "PART_REQUEST") return false;
    if (String(importEntry?.action || "") !== "PART_REQUEST_SENT_TO_IMPORT") return false;
    if (String(requestEntry?.user?.name || "") !== String(importEntry?.user?.name || "")) return false;
    if (getHistoryMinuteKey(requestEntry) !== getHistoryMinuteKey(importEntry)) return false;

    const requestMap = parseLineMap(requestEntry?.note);
    const importMap = parseLineMap(importEntry?.note);
    const requestUrgency = getLineMapValue(requestMap, ["Urgence"]);
    const importUrgency = getLineMapValue(importMap, ["Urgence"]);
    const requestJustification = getLineMapValue(requestMap, ["Justification"]);
    const importJustification = getLineMapValue(importMap, ["Justification"]);

    return requestUrgency === importUrgency && requestJustification === importJustification;
}

function mergePartRequestHistoryEntries<T extends HistoryEntryLike>(entries: T[]): T[] {
    const consumed = new Set<number>();
    const merged: T[] = [];

    entries.forEach((entry, index) => {
        const entryId = Number(entry?.id || 0);
        if (entryId && consumed.has(entryId)) return;

        if (String(entry?.action || "") === "PART_REQUEST_SENT_TO_IMPORT") {
            const requestMatch = entries.find((candidate, candidateIndex) => {
                if (candidateIndex === index) return false;
                const candidateId = Number(candidate?.id || 0);
                if (candidateId && consumed.has(candidateId)) return false;
                return canMergePartRequestHistory(candidate, entry);
            });

            if (requestMatch) {
                const requestId = Number(requestMatch?.id || 0);
                if (requestId) consumed.add(requestId);

                const requestMap = parseLineMap(requestMatch?.note);
                const importMap = parseLineMap(entry?.note);
                const mergedNote = [
                    "Demande de pièces enregistrée puis transmise au service import.",
                    (() => {
                        const value = getLineMapValue(requestMap, ["Pièce", "Piece"]);
                        return value ? `Pièce: ${value}` : "";
                    })(),
                    (() => {
                        const value = getLineMapValue(requestMap, ["Référence", "Reference"]);
                        return value ? `Référence: ${value}` : "";
                    })(),
                    (() => {
                        const value = getLineMapValue(requestMap, ["Quantité", "Quantite"]);
                        return value ? `Quantité: ${value}` : "";
                    })(),
                    (() => {
                        const value = getLineMapValue(importMap, ["Référence d'approvisionnement", "Reference d'approvisionnement", "Référence", "Reference"]);
                        return value ? `Référence d'approvisionnement: ${value}` : "";
                    })(),
                    (() => {
                        const value = getLineMapValue(requestMap, ["Urgence"]) || getLineMapValue(importMap, ["Urgence"]);
                        return value ? `Urgence: ${value}` : "";
                    })(),
                    (() => {
                        const value = getLineMapValue(requestMap, ["Justification"]) || getLineMapValue(importMap, ["Justification"]);
                        return value ? `Justification: ${value}` : "";
                    })()
                ].filter(Boolean).join("\n");

                merged.push({
                    ...entry,
                    note: mergedNote
                });
                return;
            }
        }

        if (String(entry?.action || "") === "PART_REQUEST") {
            const importMatch = entries.find((candidate, candidateIndex) => {
                if (candidateIndex === index) return false;
                const candidateId = Number(candidate?.id || 0);
                if (candidateId && consumed.has(candidateId)) return false;
                return canMergePartRequestHistory(entry, candidate);
            });

            if (importMatch) {
                if (entryId) consumed.add(entryId);
                return;
            }
        }

        merged.push(entry);
    });

    return merged;
}

function normalizeDateValue(value: string | undefined, mode: "date" | "datetime") {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
        return mode === "date" ? parsed.toLocaleDateString("fr-FR") : parsed.toLocaleString("fr-FR");
    }
    return raw;
}

function buildAssignmentNote(raw: string, fallback: string) {
    const payload = parseJson(raw);
    const message = payload && typeof payload === "object" && typeof (payload as any).message === "string"
        ? String((payload as any).message).trim()
        : "";
    if (message) return message;

    const technicianMatch =
        raw.match(/Technicien affecté automatiquement\s*:\s*(.+)$/i)
        || raw.match(/Technicien affecté\s*:\s*(.+)$/i)
        || raw.match(/Technicien assigne\s*:\s*(.+)$/i);

    if (technicianMatch?.[1]) {
        return `Technicien affecté : ${technicianMatch[1].trim()}.`;
    }

    return raw.startsWith("{") ? fallback : raw;
}

function extractAssignedTechnicianName(raw: string | null | undefined): string {
    const text = String(raw || "").trim();
    if (!text) return "";

    const technicianMatch =
        text.match(/Technicien affecté automatiquement\s*:\s*(.+)$/i)
        || text.match(/Technicien affecté\s*:\s*(.+)$/i)
        || text.match(/Technicien assigne\s*:\s*(.+)$/i);

    return technicianMatch?.[1]?.trim() || "";
}

function canMergeAssignmentHistory(baseEntry: HistoryEntryLike, detailEntry: HistoryEntryLike) {
    const baseAction = String(baseEntry?.action || "");
    const detailAction = String(detailEntry?.action || "");
    const validPair =
        (baseAction === "TECH_MANAGER_ASSIGNMENT" && detailAction === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT")
        || (baseAction === "TECH_MANAGER_ASSIGNMENT" && detailAction === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC")
        || (baseAction === "TECH_MANAGER_ASSIGNMENT" && detailAction === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT")
        || (baseAction === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE" && detailAction === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT");

    if (!validPair) return false;
    if (String(baseEntry?.user?.name || "") !== String(detailEntry?.user?.name || "")) return false;
    return getHistoryMinuteKey(baseEntry) === getHistoryMinuteKey(detailEntry);
}

function buildMergedAssignmentEntry<T extends HistoryEntryLike>(baseEntry: T, detailEntry: T): T {
    const detailAction = String(detailEntry?.action || "");
    const technicianName = extractAssignedTechnicianName(baseEntry?.note) || extractAssignedTechnicianName(detailEntry?.note);

    let mergedNote = "Technicien affecté.";
    if (detailAction === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT") {
        mergedNote = technicianName
            ? `Ticket sous garantie affecté au technicien: ${technicianName}.`
            : "Ticket sous garantie affecté au technicien.";
    } else if (detailAction === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC") {
        mergedNote = technicianName
            ? `Ticket hors garantie affecté au technicien pour diagnostic: ${technicianName}.`
            : "Ticket hors garantie affecté au technicien pour diagnostic.";
    } else if (detailAction === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT") {
        mergedNote = technicianName
            ? `Ticket affecté au technicien après validation du devis: ${technicianName}.`
            : "Ticket affecté au technicien après validation du devis.";
    }

    return {
        ...detailEntry,
        note: mergedNote
    };
}

function mergeAssignmentHistoryEntries<T extends HistoryEntryLike>(entries: T[]): T[] {
    const consumed = new Set<number>();
    const merged: T[] = [];

    entries.forEach((entry, index) => {
        const entryId = Number(entry?.id || 0);
        if (entryId && consumed.has(entryId)) return;

        const action = String(entry?.action || "");
        if (
            action === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT"
            || action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
            || action === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT"
        ) {
            const baseMatch = entries.find((candidate, candidateIndex) => {
                if (candidateIndex === index) return false;
                const candidateId = Number(candidate?.id || 0);
                if (candidateId && consumed.has(candidateId)) return false;
                return canMergeAssignmentHistory(candidate, entry);
            });

            if (baseMatch) {
                const baseId = Number(baseMatch?.id || 0);
                if (baseId) consumed.add(baseId);
                merged.push(buildMergedAssignmentEntry(baseMatch, entry));
                return;
            }
        }

        if (action === "TECH_MANAGER_ASSIGNMENT" || action === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE") {
            const detailMatch = entries.find((candidate, candidateIndex) => {
                if (candidateIndex === index) return false;
                const candidateId = Number(candidate?.id || 0);
                if (candidateId && consumed.has(candidateId)) return false;
                return canMergeAssignmentHistory(entry, candidate);
            });

            if (detailMatch) {
                if (entryId) consumed.add(entryId);
                return;
            }
        }

        merged.push(entry);
    });

    return merged;
}

function formatTicketHistoryActionRaw(action: string | null | undefined): string {
    const value = String(action || "");
    if (!value) return "Événement ticket";
    if (value === "TICKET_CREATED") return "Création";
    if (value === "AO_MARKET_THREAD_TICKET_CREATED") return "Ticket support marché créé";
    if (value.startsWith("Status changed:")) return "Changement de statut";
    if (value === "Progress update") return "Mise à jour d'avancement";
    if (value === "INTERVENTION_LOG") return "Suivi intervention";
    if (value === "TECHNICAL_REPORT") return "Rapport technique";
    if (value === "ADV_QUOTE_SENT") return "Devis soumis au client";
    if (value === "CLIENT_QUOTE_APPROVED" || value === "QUOTE_CLIENT_APPROVED") return "Devis approuvé par le client";
    if (value === "CLIENT_QUOTE_REJECTED" || value === "QUOTE_CLIENT_REJECTED") return "Devis refusé par le client";
    if (value === "QUOTE_REJECTION_AUTO_CLOSED") return "Clôture automatique après refus du devis";
    if (value === "TECH_MANAGER_UNDER_WARRANTY") return "Décision sous garantie";
    if (value === "TECH_MANAGER_OUT_OF_WARRANTY") return "Décision hors garantie";
    if (value === "TECH_MANAGER_ASSIGNMENT") return "Affectation technicien";
    if (value === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE" || value === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT") {
        return "Affectation après devis validé";
    }
    if (value === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT") return "Affectation sous garantie";
    if (value === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC") return "Diagnostic";
    if (value === "MAGASINIER_CONTRACT_REVIEW") return "Info DP";
    if (value === "MAGASINIER_CONTRACT_REVIEW_SAVED") return "Info DP";
    if (value === "MAGASINIER_CONTRACT_REVIEW_RETURNED") return "Info DP retourné";
    if (value === "MAGASINIER_CONTRACT_REVIEW_VALIDATED") return "Info DP validé";
    if (value === "MERCHANDISE_INFO_COMPLETED") return "Informations marchandise";
    if (value === "ADV_MERCHANDISE_REVIEW") return "Vérification marchandise ADV";
    if (value === "REPORT_RECEIVED") return "Rapport reçu";
    if (value === "DOCUMENTS_VALIDATED") return "Documents validés";
    if (value === "INTERVENTION_VALIDATED") return "Fin d'intervention validée";
    if (value === "ADV_DECISION_TAKEN") return "Prise en charge de la réparation";
    if (value === "ADV_DECISION_REFUS") return "Refus ADV";
    if (value === "CLIENT_NOTIFICATION") return "Notification client";
    if (value === "CLIENT_UPDATE") return "Mise à jour client";
    if (value === "CLIENT_ADDITIONAL_DOCUMENTS") return "Documents client";
    if (value === "PART_REQUEST") return "Demande de pièces";
    if (value === "PART_REQUEST_SENT_TO_IMPORT") return "Attente pièce import";
    if (value === "PART_REQUEST_SENT_TO_STORE") return "Demande transmise au magasinier";
    if (value === "IMPORT_ORDER_LAUNCHED") return "Commande lancée";
    if (value === "IMPORT_ORDER_SHIPPED") return "Commande expédiée";
    if (value === "IMPORT_REQUEST_RECEIVED") return "Pièce import arrivée";
    if (value === "MAGASINIER_PART_REQUEST_STATUS") return "Validation demande magasinier";
    if (value === "COMMENT_CLIENT") return "Commentaire SAV";
    if (value === "CLIENT_ACCOUNT_CREATED") return "Compte client créé";
    if (value === "SATISFACTION_REQUESTED") return "Demande de satisfaction";
    if (value === "SATISFACTION_CLIENT") return "Satisfaction client";
    if (value === "ADMIN_CLOSURE_COMPLETED") return "Ticket traité par l'administration des ventes";
    if (value === "EXIT_REPAIR_SLIP_DOWNLOADED") return "Bon de sortie téléchargé";
    if (value === "FINAL_OUTCOME_NON_REPARE") return "Résultat final";
    if (value === "URGENCY_LEVEL_LOCKED") return "Niveau d'urgence enregistré";
    if (value === "ADV_QUALIFICATION") return "Validation ticket";
    if (value === "ADV_QUALIFICATION_DOCUMENTS") return "Documents ADV";
    if (value === "SUPPLIER_EMAIL_SENT") return "E-mail fournisseur envoyé";
    if (value === "SUPPLIER_EMAIL_RECEIVED") return "E-mail fournisseur reçu";
    return value;
}

function formatTicketHistoryNoteRaw(entry: HistoryEntryLike): string {
    const action = String(entry?.action || "");
    const raw = String(entry?.note || "").trim();

    if (action === "TICKET_CREATED") return "";
    if (action === "AO_MARKET_THREAD_TICKET_CREATED") return raw || "Ticket support auto-créé pour le marché.";
    if (action === "SUPPLIER_EMAIL_SENT") return formatSupplierEmailNote(raw, "sent");
    if (action === "SUPPLIER_EMAIL_RECEIVED") return formatSupplierEmailNote(raw, "received");

    if (!raw) {
        if (action === "SATISFACTION_REQUESTED") return "";
        if (action === "ADMIN_CLOSURE_COMPLETED") return "";
        if (action === "TECH_MANAGER_ASSIGNMENT") return "Technicien affecté.";
        if (action === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT") return "Ticket affecté au technicien sous garantie.";
        if (action === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE" || action === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT") {
            return "Ticket affecté au technicien après validation du devis.";
        }
        return "";
    }

    if (action.startsWith("Status changed:")) {
        const match = action.match(/^Status changed:\s*([A-Z_]+)\s*->\s*([A-Z_]+)$/i);
        if (!match) return "Statut du ticket mis à jour.";
        return `${getStatusLabel(match[1])} -> ${getStatusLabel(match[2])}`;
    }

    if (action === "TECHNICAL_REPORT") {
        return "Rapport technique final généré et archivé.";
    }

    if (action === "INTERVENTION_LOG") {
        const map = parseLineMap(raw);
        const dateIntervention = normalizeDateValue(map["Date d'intervention"], "date");
        const debut = normalizeDateValue(map["Debut"], "datetime");
        const fin = normalizeDateValue(map["Fin"], "datetime");
        const statut = map["Statut avancement"] || "-";
        return [
            dateIntervention !== "-" ? `Date: ${dateIntervention}` : "",
            debut !== "-" ? `Début: ${debut}` : "",
            fin !== "-" ? `Fin: ${fin}` : "",
            statut !== "-" ? `Statut: ${statut}` : ""
        ].filter(Boolean).join(". ") || "Mise à jour intervention enregistrée.";
    }

    if (action === "CLIENT_NOTIFICATION") {
        const payload = parseJson(raw);
        const message = payload && typeof payload === "object" && typeof (payload as any).message === "string"
            ? String((payload as any).message).trim()
            : "";
        if (message) return message;
        if (raw.toLowerCase().includes("rapport")) return "Notification client: rapport disponible.";
        return "Notification client envoyée.";
    }

    if (action === "CLIENT_UPDATE") return "Le client a mis à jour sa demande d'intervention.";

    if (action === "CLIENT_ADDITIONAL_DOCUMENTS") {
        const payload = parseJson(raw);
        const attachments = payload && typeof payload === "object" && Array.isArray((payload as any).attachments)
            ? (payload as any).attachments
            : [];
        if (attachments.length > 0) return `${attachments.length} document(s) complémentaire(s) ajouté(s) par le client.`;
        return "Documents complémentaires ajoutés par le client.";
    }

    if (action === "ADV_QUALIFICATION") return "";
    if (action === "ADV_QUOTE_SENT") return "";
    if (action === "CLIENT_QUOTE_APPROVED" || action === "QUOTE_CLIENT_APPROVED") return "";
    if (action === "CLIENT_QUOTE_REJECTED" || action === "QUOTE_CLIENT_REJECTED") return "Le client a refusé le devis.";
    if (action === "QUOTE_REJECTION_AUTO_CLOSED") return "";
    if (action === "TECH_MANAGER_UNDER_WARRANTY") return "Demande validée sous garantie.";
    if (action === "TECH_MANAGER_OUT_OF_WARRANTY") return "Demande transmise à l'ADV pour devis hors garantie.";

    if (
        action === "TECH_MANAGER_ASSIGNMENT"
        || action === "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE"
        || action === "TECH_MANAGER_POST_QUOTE_ASSIGNMENT"
    ) {
        return buildAssignmentNote(raw, "Technicien affecté.");
    }

    if (action === "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT") {
        return buildAssignmentNote(raw, "Ticket affecté au technicien sous garantie.");
    }

    if (action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC") return "";

    if (
        action === "MAGASINIER_CONTRACT_REVIEW"
        || action === "MAGASINIER_CONTRACT_REVIEW_SAVED"
        || action === "MAGASINIER_CONTRACT_REVIEW_RETURNED"
        || action === "MAGASINIER_CONTRACT_REVIEW_VALIDATED"
    ) {
        return "";
    }

    if (action === "MERCHANDISE_INFO_COMPLETED") return "Informations marchandise complétées.";
    if (action === "ADV_MERCHANDISE_REVIEW") return "Vérification marchandise ADV enregistrée.";
    if (action === "REPORT_RECEIVED") return "Le rapport technique a été reçu par l'ADV.";
    if (action === "DOCUMENTS_VALIDATED") return "Les documents ont été validés par l'ADV.";
    if (action === "INTERVENTION_VALIDATED") return "";
    if (action === "ADV_DECISION_TAKEN") return "";
    if (action === "ADV_DECISION_REFUS") return "Demande non prise en charge par l'ADV.";
    if (action === "PART_REQUEST") return "Demande de pièces enregistrée.";
    if (action === "PART_REQUEST_SENT_TO_IMPORT") return "";
    if (action === "PART_REQUEST_SENT_TO_STORE") return "";
    if (action === "MAGASINIER_PART_REQUEST_STATUS") return "";
    if (action === "IMPORT_ORDER_LAUNCHED") return parseImportOrderLaunchNote(raw) || "Commande import lancée.";
    if (action === "IMPORT_ORDER_SHIPPED") return parseImportOrderShipmentNote(raw) || "Commande import expédiée.";
    if (action === "IMPORT_REQUEST_RECEIVED") return "";
    if (action === "SATISFACTION_REQUESTED") return "";
    if (action === "SATISFACTION_CLIENT") return "Satisfaction client enregistrée.";
    if (action === "ADMIN_CLOSURE_COMPLETED") return "";
    if (action === "EXIT_REPAIR_SLIP_DOWNLOADED") return "Bon de sortie téléchargé par la facturation.";
    if (action === "FINAL_OUTCOME_NON_REPARE") return "Intervention terminée : équipement non réparé.";
    if (action === "URGENCY_LEVEL_LOCKED") return raw.replace(/Niveau d'urgence\s*:/i, "Niveau d'urgence :");
    if (action === "Progress update") return "";
    if (action === "Priority updated" || action === "Priorité mise à jour") {
        return (raw || "Priorité mise à jour.").replace(/^Priorite:/i, "Priorité :");
    }

    if (action === "CLIENT_ACCOUNT_CREATED") {
        const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (emailMatch?.[0]) return `Compte client créé et envoyé à ${emailMatch[0]}.`;
        return "Compte client créé et transmis au client.";
    }

    const compact = raw.replace(/\s+/g, " ").trim();
    return compact.length > 180 ? `${compact.slice(0, 180).trim()}...` : compact;
}

export function formatTicketHistoryAction(action: string | null | undefined): string {
    return cleanFrenchText(formatTicketHistoryActionRaw(action));
}

export function formatTicketHistoryNote(entry: HistoryEntryLike): string {
    return cleanFrenchText(formatTicketHistoryNoteRaw(entry));
}

export function getTicketHistoryTone(action: string | null | undefined): "success" | "warning" | "danger" | "info" {
    const value = String(action || "").trim().toUpperCase();
    if (
        value === "TECHNICAL_REPORT"
        || value === "REPORT_RECEIVED"
        || value === "DOCUMENTS_VALIDATED"
        || value === "INTERVENTION_VALIDATED"
        || value === "ADMIN_CLOSURE_COMPLETED"
        || value === "EXIT_REPAIR_SLIP_DOWNLOADED"
        || value === "SATISFACTION_CLIENT"
        || value === "CLIENT_ACCOUNT_CREATED"
    ) {
        return "success";
    }
    if (
        value === "CLIENT_QUOTE_REJECTED"
        || value === "QUOTE_CLIENT_REJECTED"
        || value === "QUOTE_REJECTION_AUTO_CLOSED"
        || value === "ADV_DECISION_REFUS"
        || value === "FINAL_OUTCOME_NON_REPARE"
        || value === "NOT_TAKEN_IN_CHARGE"
    ) {
        return "danger";
    }
    if (
        value === "PART_REQUEST"
        || value === "IMPORT_ORDER_LAUNCHED"
        || value === "IMPORT_ORDER_SHIPPED"
        || value === "IMPORT_REQUEST_RECEIVED"
        || value === "MAGASINIER_CONTRACT_REVIEW"
        || value === "MAGASINIER_CONTRACT_REVIEW_SAVED"
        || value === "MAGASINIER_CONTRACT_REVIEW_RETURNED"
        || value === "MAGASINIER_CONTRACT_REVIEW_VALIDATED"
        || value === "MERCHANDISE_INFO_COMPLETED"
        || value === "ADV_MERCHANDISE_REVIEW"
        || value === "SATISFACTION_REQUESTED"
        || value.startsWith("STATUS CHANGED:")
    ) {
        return "warning";
    }
    return "info";
}

export function dedupeAndSortHistory<T extends HistoryEntryLike>(entries: T[], direction: "asc" | "desc" = "asc"): T[] {
    const dedup = new Map<string, T>();
    const sorted = mergeAssignmentHistoryEntries(mergePartRequestHistoryEntries([...entries]))
        .filter((entry) => String(entry?.action || "") !== "BON_ENTREE_FACTURATION_CREATED")
        .sort((a, b) => new Date(String(a.createdAt || 0)).getTime() - new Date(String(b.createdAt || 0)).getTime());
    sorted.forEach((entry) => {
        const minute = getHistoryMinuteKey(entry);
        const action = String(entry.action || "");
        const note = formatTicketHistoryNote(entry).replace(/\s+/g, " ").trim().toLowerCase();
        const key = `${minute}|${action}|${note}|${String(entry.user?.name || "")}`;
        if (!dedup.has(key)) dedup.set(key, entry);
    });
    const rows = Array.from(dedup.values());
    return direction === "desc" ? rows.reverse() : rows;
}

export function getAdministrativeClosureAt(input: any): string | null {
    const history = getHistoryRows(input);
    const explicitMatch = history
        .filter((entry) => String(entry?.action || "") === "ADMIN_CLOSURE_COMPLETED")
        .sort((a, b) => new Date(String(b?.createdAt || 0)).getTime() - new Date(String(a?.createdAt || 0)).getTime())[0];
    if (explicitMatch?.createdAt) return String(explicitMatch.createdAt);

    const legacyNoteMatch = history
        .filter((entry) => /cl[oô]ture administrative/i.test(String(entry?.note || "")))
        .sort((a, b) => new Date(String(b?.createdAt || 0)).getTime() - new Date(String(a?.createdAt || 0)).getTime())[0];
    if (legacyNoteMatch?.createdAt) return String(legacyNoteMatch.createdAt);

    const status = String(input?.status || input?.ticket?.status || "").trim().toUpperCase();
    const closedAt = input?.closedAt || input?.ticket?.closedAt;
    if (status === "CLOSED" && closedAt) return String(closedAt);

    return null;
}

export function hasHistoryGraceExpired(input: any, days = 7): boolean {
    const closureAt = getAdministrativeClosureAt(input);
    if (!closureAt) return false;
    const closureMs = new Date(closureAt).getTime();
    if (!Number.isFinite(closureMs)) return false;
    return Date.now() - closureMs >= days * 24 * 60 * 60 * 1000;
}

export function hasSatisfactionRecorded(input: any): boolean {
    const history = getHistoryRows(input);
    return history.some((entry) => String(entry?.action || "") === "SATISFACTION_CLIENT");
}


