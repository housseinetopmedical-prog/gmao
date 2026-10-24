/**
 * Helper pour l'historique des réclamations
 * Facilite l'enregistrement des actions à chaque étape du workflow
 */

export async function addReclamationHistoryEntry(params: {
    reclamationId: number;
    userId: number;
    action: string;
    note?: string;
}) {
    try {
        const response = await fetch(`/api/reclamations/${params.reclamationId}/history`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: params.action,
                note: params.note || null,
                userId: params.userId
            })
        });

        if (!response.ok) {
            console.error("Failed to add history entry:", await response.json());
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error("Error adding history entry:", error);
        return null;
    }
}

export async function fetchReclamationHistory(reclamationId: number) {
    try {
        const response = await fetch(`/api/reclamations/${reclamationId}/history`);
        
        if (!response.ok) {
            console.error("Failed to fetch history:", await response.json());
            return [];
        }

        const data = await response.json();
        return Array.isArray(data?.history) ? data.history : [];
    } catch (error) {
        console.error("Error fetching history:", error);
        return [];
    }
}

/**
 * Actions d'historique standardisées avec traductions françaises
 */
export const HISTORY_ACTIONS = {
    // Création et réception
    RECLAMATION_CREATED: "Demande d'intervention créée",
    RECLAMATION_RECEIVED: "Demande reçue",
    
    // Vérification ADV
    ADV_VERIFICATION_STARTED: "Vérification ADV démarrée",
    ADV_VERIFICATION_COMPLETED: "Vérification ADV complétée",
    ADV_NOTES_ADDED: "Notes ADV ajoutées",
    
    // Marchandise/Contrat/Garantie
    MERCHANDISE_INFO_ADDED: "Informations marchandise ajoutées",
    MERCHANDISE_INFO_UPDATED: "Informations marchandise modifiées",
    WARRANTY_INFO_ADDED: "Informations garantie ajoutées",
    CONTRACT_INFO_ADDED: "Informations contrat ajoutées",
    
    // Responsable Technique
    TECH_MANAGER_REVIEW_RECEIVED: "Demande reçue par responsable technique",
    UNDER_WARRANTY_DECISION: "Décision : Sous garantie",
    OUT_OF_WARRANTY_DECISION: "Décision : Hors garantie",
    TECH_MANAGER_NOTES_ADDED: "Notes responsable technique ajoutées",
    
    // Devis
    QUOTE_PREPARED: "Devis préparé",
    QUOTE_SENT_TO_CLIENT: "Devis envoyé au client",
    QUOTE_APPROVED_BY_CLIENT: "Devis validé par le client",
    QUOTE_REJECTED_BY_CLIENT: "Devis refusé par le client",
    
    // Décisions finales
    TAKEN_IN_CHARGE: "Prise en charge confirmée",
    NOT_TAKEN_IN_CHARGE: "Non prise en charge",
    
    // Affectation Technicien
    TECHNICIAN_ASSIGNED: "Technicien affecté",
    
    // Processus
    DIAGNOSTIC_STARTED: "Diagnostic démarré",
    PARTS_REQUESTED: "Pièces demandées",
    REPAIR_STARTED: "Réparation démarrée",
    QUALITY_CHECK_COMPLETED: "Contrôle qualité effectué",
    READY_FOR_DELIVERY: "Prêt pour livraison",
    CLOSED: "Demande clôturée"
} as const;

export type HistoryActionType = keyof typeof HISTORY_ACTIONS;

/**
 * Helper pour ajouter l'historique avec action standardisée
 */
export async function logReclamationAction(params: {
    reclamationId: number;
    userId: number;
    action: HistoryActionType;
    details?: string;
}) {
    const actionLabel = HISTORY_ACTIONS[params.action];
    const note = params.details 
        ? `${actionLabel} : ${params.details}`
        : actionLabel;

    return addReclamationHistoryEntry({
        reclamationId: params.reclamationId,
        userId: params.userId,
        action: params.action,
        note: note
    });
}
