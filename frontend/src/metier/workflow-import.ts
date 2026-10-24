import { formatFallbackStatusLabel } from "@/metier/libelles-statut";

export type ImportPurchaseStatus = "DEMAND" | "QUOTATION" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CHECKED" | "CONSUMED";

export const IMPORT_STATUS_LABELS: Record<ImportPurchaseStatus, string> = {
    DEMAND: "Demande reçue",
    QUOTATION: "Devis import",
    ORDERED: "Commande lancée",
    SHIPPED: "Commande expédiée",
    RECEIVED: "Marchandise reçue",
    CHECKED: "Contrôlée",
    CONSUMED: "Consommée"
};

export function getImportStatusLabel(status: string | null | undefined) {
    const value = String(status || "").trim().toUpperCase() as ImportPurchaseStatus;
    return IMPORT_STATUS_LABELS[value] || formatFallbackStatusLabel(value);
}

export function formatImportReference(value: string | null | undefined) {
    const ref = String(value || "").trim();
    return ref.replace(/^DA-/i, "DI-") || "-";
}

export function isImportReceivedAlertActive(receivedDate: string | Date | null | undefined, options?: { now?: Date; ticketClosed?: boolean; visitPassed?: boolean }) {
    if (options?.ticketClosed || options?.visitPassed) return false;
    if (!receivedDate) return false;

    const date = receivedDate instanceof Date ? receivedDate : new Date(receivedDate);
    if (Number.isNaN(date.getTime())) return false;

    const now = options?.now || new Date();
    const elapsedMs = now.getTime() - date.getTime();
    if (elapsedMs < 0) return false;

    return true;
}
