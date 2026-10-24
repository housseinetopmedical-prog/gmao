const GENERIC_STATUS_LABELS: Record<string, string> = {
    VALIDATED: "Validé",
    OPEN: "Ouvert",
    IN_PROGRESS: "En cours",
    WAITING_REPLY: "En attente de réponse",
    RESOLVED: "Résolu",
    DEMAND: "Demande reçue",
    QUOTATION: "Devis import",
    ORDERED: "Commande lancée",
    SHIPPED: "Expédiée",
    RECEIVED: "Marchandise reçue",
    CHECKED: "Contrôlée",
    CONSUMED: "Consommée"
};

export function formatFallbackStatusLabel(raw: string | null | undefined): string {
    const normalized = String(raw || "").trim().toUpperCase();
    if (!normalized) return "Statut inconnu";

    if (GENERIC_STATUS_LABELS[normalized]) {
        return GENERIC_STATUS_LABELS[normalized];
    }

    return normalized
        .split(/[_-]+/g)
        .filter(Boolean)
        .map((part) => {
            const lower = part.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}
