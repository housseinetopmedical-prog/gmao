// Liste les mots trop génériques qui ne doivent pas influencer fortement la comparaison de pannes.
const STOP_WORDS = new Set([
    // Ignore les mots de liaison français qui reviennent souvent dans les descriptions.
    "avec",
    // Ignore un mot courant qui décrit rarement la panne elle-même.
    "dans",
    // Ignore un mot de contexte temporel trop fréquent.
    "depuis",
    // Ignore un déterminant français très commun.
    "des",
    // Ignore un déterminant français très commun.
    "une",
    // Ignore un déterminant français très commun.
    "les",
    // Ignore un mot de liaison très courant.
    "pour",
    // Ignore un mot fréquent qui ne suffit pas à caractériser une panne.
    "plus",
    // Ignore un mot de liaison très courant.
    "sur",
    // Ignore un verbe très fréquent.
    "est",
    // Ignore une négation trop générale.
    "pas",
    // Ignore un pronom relatif fréquent.
    "qui",
    // Ignore un pronom relatif fréquent.
    "que",
    // Ignore un mot de liaison fréquent.
    "aux",
    // Ignore un mot anglais fréquent si des descriptions contiennent de l'anglais.
    "the",
    // Ignore un mot anglais fréquent si des descriptions contiennent de l'anglais.
    "and",
    // Ignore un mot courant qui peut apparaître dans beaucoup de phrases.
    "sans",
    // Ignore un repère temporel qui n'identifie pas la panne.
    "apres",
    // Ignore un repère temporel qui n'identifie pas la panne.
    "avant",
    // Ignore le mot client car il ne décrit pas le symptôme technique.
    "client",
    // Ignore le mot équipement car il est trop général.
    "equipement",
    // Ignore le mot matériel car il est trop général.
    "materiel",
    // Ignore le mot machine car il est trop général.
    "machine",
    // Ignore le mot appareil car il est trop général.
    "appareil",
    // Ignore le mot intervention car il décrit le workflow, pas la panne.
    "intervention",
    // Ignore le mot demande car il décrit le workflow, pas la panne.
    "demande",
    // Ignore le mot ticket car il décrit le workflow, pas la panne.
    "ticket"
]);

// Définit le nombre total minimal d'occurrences pour considérer une panne comme récurrente.
const MIN_TOTAL_OCCURRENCES_FOR_RECURRENT = 4;

// Décrit une ancienne panne similaire trouvée pour un ticket donné.
export type RecurrentFailureMatch = {
    // Garde l'identifiant du ticket similaire.
    ticketId: number;
    // Garde la référence annuelle affichée du ticket similaire.
    ticketReference?: string | null;
    // Garde le numéro affichable si l'API l'a déjà préparé.
    displayId?: number | string | null;
    // Garde le titre du ticket similaire.
    title: string;
    // Garde le statut du ticket similaire.
    status: string;
    // Garde la date de création du ticket similaire.
    createdAt: string | Date;
    // Garde éventuellement la date de clôture du ticket similaire.
    closedAt?: string | Date | null;
    // Garde le texte analysé pour expliquer ou auditer la similarité.
    description: string;
    // Garde le score de similarité calculé entre 0 et 1.
    similarity: number;
};

// Décrit le résultat complet de l'analyse de récurrence pour un ticket.
export type RecurrentFailureAnalysis = {
    // Indique si la panne atteint le seuil de récurrence.
    isRecurrent: boolean;
    // Compte les tickets précédents similaires au ticket courant.
    repetitionCount: number;
    // Compte le ticket courant plus les tickets précédents similaires.
    totalOccurrences: number;
    // Liste les dernières dates d'intervention utiles à afficher.
    lastInterventionDates: Array<string | Date>;
    // Liste les tickets similaires retenus.
    matches: RecurrentFailureMatch[];
    // Contient le message prêt à afficher si la panne est récurrente.
    message: string | null;
};

// Définit seulement les champs dont l'analyse a besoin, sans dépendre d'un modèle Prisma complet.
type TicketLike = {
    // Identifiant obligatoire du ticket.
    id: number;
    // Référence annuelle optionnelle du ticket.
    ticketReference?: string | null;
    // Numéro affichable optionnel du ticket.
    displayId?: number | string | null;
    // Titre optionnel du ticket.
    title?: string | null;
    // Description optionnelle du ticket.
    description?: string | null;
    // Statut optionnel du ticket.
    status?: string | null;
    // Date de création optionnelle du ticket.
    createdAt?: string | Date | null;
    // Date de clôture optionnelle du ticket.
    closedAt?: string | Date | null;
    // Identifiant optionnel du matériel lié au ticket.
    equipmentId?: number | null;
    // Objet matériel optionnel quand il est inclus dans la requête.
    equipment?: {
        // Modèle optionnel du matériel.
        model?: string | null;
    } | null;
    // Demande d'intervention optionnelle associée au ticket.
    reclamation?: {
        // Description client ou ADV de la panne.
        description?: string | null;
        // Checklist JSON qui peut contenir des métadonnées utiles.
        checklist?: string | null;
        // Modèle ou désignation saisi côté demande.
        deviceModel?: string | null;
    } | null;
};

// Normalise un texte pour que les comparaisons soient stables malgré accents, casse et ponctuation.
function normalizeText(value: unknown) {
    // Convertit toute valeur reçue en chaîne de caractères sûre.
    return String(value || "")
        // Sépare les accents des lettres pour pouvoir les supprimer ensuite.
        .normalize("NFD")
        // Supprime les accents afin que "écran" et "ecran" soient comparables.
        .replace(/[\u0300-\u036f]/g, "")
        // Passe tout en minuscules pour ignorer la casse.
        .toLowerCase()
        // Remplace la ponctuation par des espaces pour garder seulement les mots.
        .replace(/[^a-z0-9]+/g, " ")
        // Réduit les espaces multiples en un seul espace.
        .replace(/\s+/g, " ")
        // Supprime les espaces au début et à la fin.
        .trim();
}

// Extrait la description de panne stockée dans la checklist JSON quand elle existe.
function parseChecklistFailureDescription(rawChecklist: unknown) {
    // Retourne vide si la checklist n'est pas une chaîne JSON exploitable.
    if (!rawChecklist || typeof rawChecklist !== "string") return "";
    // Protège la lecture JSON contre les anciennes valeurs mal formées.
    try {
        // Convertit la chaîne JSON en objet JavaScript.
        const parsed = JSON.parse(rawChecklist);
        // Récupère les métadonnées si elles existent.
        const metadata = parsed?.metadata || {};
        // Prend d'abord la description du bon d'entrée, sinon une description générique.
        return String(metadata?.entryRepairSlip?.failureDescription || metadata?.failureDescription || "").trim();
    } catch {
        // Retourne vide si le JSON est invalide.
        return "";
    }
}

// Extrait le modèle matériel stocké dans la checklist JSON quand il existe.
function parseChecklistModel(rawChecklist: unknown) {
    // Retourne vide si la checklist n'est pas une chaîne JSON exploitable.
    if (!rawChecklist || typeof rawChecklist !== "string") return "";
    // Protège la lecture JSON contre les anciennes valeurs mal formées.
    try {
        // Convertit la chaîne JSON en objet JavaScript.
        const parsed = JSON.parse(rawChecklist);
        // Récupère les métadonnées si elles existent.
        const metadata = parsed?.metadata || {};
        // Choisit le meilleur libellé disponible pour identifier le modèle matériel.
        return String(
            // Utilise le modèle direct s'il est présent.
            metadata?.model
            // Sinon utilise la désignation du bon d'entrée.
            || metadata?.entryRepairSlip?.designation
            // Sinon utilise le nom matériel historique.
            || metadata?.equipmentName
            // Sinon retourne vide.
            || ""
        ).trim();
    } catch {
        // Retourne vide si le JSON est invalide.
        return "";
    }
}

// Calcule une clé normalisée du modèle matériel pour regrouper les tickets liés au même type d'équipement.
function getMaterialModelKey(ticket: TicketLike) {
    // Normalise la première valeur de modèle trouvée entre matériel, demande et checklist.
    return normalizeText(
        // Priorité au modèle présent dans l'objet equipment.
        ticket?.equipment?.model
        // Sinon on prend le modèle saisi dans la demande.
        || ticket?.reclamation?.deviceModel
        // Sinon on tente d'extraire le modèle depuis la checklist.
        || parseChecklistModel(ticket?.reclamation?.checklist)
    );
}

// Construit le texte complet de panne utilisé par l'algorithme de similarité.
export function getFailureText(ticket: TicketLike) {
    // Assemble les différentes sources de description disponibles.
    return [
        // Ajoute la description issue de la checklist si elle existe.
        parseChecklistFailureDescription(ticket?.reclamation?.checklist),
        // Ajoute la description de la demande d'intervention.
        ticket?.reclamation?.description,
        // Ajoute la description directe du ticket.
        ticket?.description,
        // Ajoute le titre comme dernier signal textuel.
        ticket?.title
    ]
        // Convertit chaque valeur en texte propre.
        .map((value) => String(value || "").trim())
        // Supprime les valeurs vides.
        .filter(Boolean)
        // Fusionne tous les morceaux en une seule phrase.
        .join(" ");
}

// Découpe un texte en mots importants pour comparer deux pannes.
function tokenize(text: string) {
    // Normalise le texte avant de le découper.
    return normalizeText(text)
        // Découpe le texte normalisé mot par mot.
        .split(" ")
        // Garde les mots assez longs et retire les mots trop génériques.
        .filter((word) => word.length >= 4 && !STOP_WORDS.has(word));
}

// Retourne les mots uniques d'un texte pour éviter de compter deux fois le même mot.
function uniqueWords(text: string) {
    // Transforme la liste de mots en Set puis revient en tableau.
    return Array.from(new Set(tokenize(text)));
}

// Calcule une similarité de Jaccard entre deux listes de mots.
function jaccardSimilarity(left: string[], right: string[]) {
    // Si l'une des listes est vide, aucune similarité fiable n'est possible.
    if (left.length === 0 || right.length === 0) return 0;
    // Transforme la liste de droite en Set pour tester rapidement les mots communs.
    const rightSet = new Set(right);
    // Compte les mots de gauche qui existent aussi à droite.
    const intersection = left.filter((word) => rightSet.has(word)).length;
    // Compte le nombre total de mots distincts entre les deux listes.
    const union = new Set([...left, ...right]).size;
    // Retourne le ratio intersection/union si l'union existe.
    return union > 0 ? intersection / union : 0;
}

// Détecte les cas où deux descriptions se ressemblent fortement même si le score Jaccard est moyen.
function hasStrongPhraseMatch(left: string, right: string) {
    // Normalise la première description.
    const normalizedLeft = normalizeText(left);
    // Normalise la deuxième description.
    const normalizedRight = normalizeText(right);
    // Si l'une des descriptions est vide, on ne peut pas conclure.
    if (!normalizedLeft || !normalizedRight) return false;
    // Si une description longue contient exactement l'autre, on considère la correspondance forte.
    if (normalizedLeft.length >= 18 && normalizedRight.includes(normalizedLeft)) return true;
    // Teste aussi l'inclusion dans l'autre sens.
    if (normalizedRight.length >= 18 && normalizedLeft.includes(normalizedRight)) return true;

    // Découpe la première description en mots importants.
    const leftTokens = tokenize(left);
    // Découpe la deuxième description en Set pour accélérer la comparaison.
    const rightTokens = new Set(tokenize(right));
    // Compte les mots importants partagés.
    const sharedImportantWords = leftTokens.filter((word) => rightTokens.has(word)).length;
    // Considère la phrase proche si au moins trois mots importants sont communs.
    return sharedImportantWords >= 3;
}

// Analyse un ticket par rapport à d'autres tickets liés au même matériel ou au même modèle.
export function analyzeRecurrentFailure(ticket: TicketLike, equipmentTickets: TicketLike[]): RecurrentFailureAnalysis {
    // Récupère le texte de panne du ticket courant.
    const currentText = getFailureText(ticket);
    // Transforme ce texte en mots uniques pour calculer les similarités.
    const currentWords = uniqueWords(currentText);
    // Utilise la date du ticket courant, ou maintenant si la date manque.
    const currentCreatedAt = ticket.createdAt ? new Date(ticket.createdAt).getTime() : Date.now();

    // Cherche les anciens tickets dont le texte ressemble à celui du ticket courant.
    const matches = equipmentTickets
        // Retire le ticket courant pour ne pas le comparer avec lui-même.
        .filter((candidate) => Number(candidate?.id) !== Number(ticket?.id))
        // Ne garde que les tickets créés avant ou au même moment que le ticket courant.
        .filter((candidate) => {
            // Convertit la date candidate en timestamp si elle existe.
            const candidateCreatedAt = candidate.createdAt ? new Date(candidate.createdAt).getTime() : 0;
            // Accepte les anciens tickets, et tolère les dates absentes pour ne pas perdre d'information historique.
            return !Number.isFinite(currentCreatedAt) || !candidateCreatedAt || candidateCreatedAt <= currentCreatedAt;
        })
        // Calcule un score de similarité pour chaque candidat.
        .map((candidate) => {
            // Récupère le texte de panne du candidat.
            const candidateText = getFailureText(candidate);
            // Calcule le score Jaccard entre mots importants.
            const similarity = jaccardSimilarity(currentWords, uniqueWords(candidateText));
            // Détecte une correspondance forte par phrase ou mots importants.
            const phraseMatch = hasStrongPhraseMatch(currentText, candidateText);
            // Retourne un objet normalisé pour l'affichage et le tri.
            return {
                // Convertit l'identifiant en nombre.
                ticketId: Number(candidate.id),
                // Garde la référence annuelle si elle est disponible.
                ticketReference: candidate.ticketReference || null,
                // Garde le numéro affichable si disponible.
                displayId: candidate.displayId || null,
                // Fournit un titre lisible même si le titre manque.
                title: String(candidate.title || "Ticket sans titre"),
                // Normalise le statut en chaîne.
                status: String(candidate.status || ""),
                // Garde la date de création ou une chaîne vide.
                createdAt: candidate.createdAt || "",
                // Garde la date de clôture ou null.
                closedAt: candidate.closedAt || null,
                // Garde le texte analysé.
                description: candidateText,
                // Remonte le score à 0.6 si la phrase est fortement similaire.
                similarity: phraseMatch ? Math.max(similarity, 0.6) : similarity
            };
        })
        // Garde uniquement les tickets dont la similarité dépasse le seuil retenu.
        .filter((match) => match.similarity >= 0.32)
        // Trie les résultats du plus récent au plus ancien.
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    // Compte les anciennes pannes similaires trouvées.
    const repetitionCount = matches.length;
    // Prépare les trois dernières dates utiles à afficher.
    const lastInterventionDates = matches
        // Limite l'affichage à trois dates.
        .slice(0, 3)
        // Préfère la date de clôture si elle existe, sinon la date de création.
        .map((match) => match.closedAt || match.createdAt)
        // Supprime les dates vides.
        .filter(Boolean);

    // Ajoute le ticket courant aux répétitions pour obtenir le total d'occurrences.
    const totalOccurrences = repetitionCount + 1;

    // Retourne l'analyse complète au format attendu par les écrans.
    return {
        // La panne est récurrente uniquement si le total atteint le seuil métier.
        isRecurrent: totalOccurrences >= MIN_TOTAL_OCCURRENCES_FOR_RECURRENT,
        // Expose le nombre de tickets précédents similaires.
        repetitionCount,
        // Expose le total ticket courant inclus.
        totalOccurrences,
        // Expose les dernières dates d'intervention.
        lastInterventionDates,
        // Limite les tickets similaires à cinq pour éviter de surcharger l'interface.
        matches: matches.slice(0, 5),
        // Prépare un message uniquement si la panne est réellement récurrente.
        message: totalOccurrences >= MIN_TOTAL_OCCURRENCES_FOR_RECURRENT
            // Message affiché dans les interfaces métier.
            ? `Ticket récurrent : cette panne a déjà été signalée ${totalOccurrences} fois sur ce même matériel.`
            // Pas de message si le seuil n'est pas atteint.
            : null
    };
}

// Ajoute l'analyse de récurrence à une liste complète de tickets.
export function attachRecurrentFailureAnalysis<T extends TicketLike>(tickets: T[]): Array<T & { recurrentFailure: RecurrentFailureAnalysis }> {
    // Prépare un regroupement par identifiant matériel.
    const byEquipment = new Map<number, T[]>();
    // Prépare un regroupement par modèle matériel normalisé.
    const byModel = new Map<string, T[]>();

    // Parcourt tous les tickets pour construire les regroupements.
    tickets.forEach((ticket) => {
        // Convertit l'identifiant matériel en nombre.
        const equipmentId = Number(ticket.equipmentId || 0);
        // Ajoute le ticket au groupe matériel si l'identifiant existe.
        if (equipmentId) {
            // Conserve les anciens tickets du groupe et ajoute le ticket courant.
            byEquipment.set(equipmentId, [...(byEquipment.get(equipmentId) || []), ticket]);
        }

        // Calcule la clé modèle normalisée du ticket.
        const modelKey = getMaterialModelKey(ticket);
        // Ajoute le ticket au groupe modèle si la clé existe.
        if (modelKey) {
            // Conserve les anciens tickets du groupe et ajoute le ticket courant.
            byModel.set(modelKey, [...(byModel.get(modelKey) || []), ticket]);
        }
    });

    // Retourne une nouvelle liste de tickets enrichis par leur analyse de récurrence.
    return tickets.map((ticket) => {
        // Récupère l'identifiant matériel du ticket courant.
        const equipmentId = Number(ticket.equipmentId || 0);
        // Récupère la clé modèle du ticket courant.
        const modelKey = getMaterialModelKey(ticket);
        // Combine les tickets du même matériel et ceux du même modèle.
        const relatedTickets = [
            // Ajoute les tickets du même matériel si disponibles.
            ...(equipmentId ? byEquipment.get(equipmentId) || [] : []),
            // Ajoute les tickets du même modèle si disponibles.
            ...(modelKey ? byModel.get(modelKey) || [] : [])
        ]
            // Supprime les doublons éventuels quand un ticket est dans les deux groupes.
            .filter((candidate, index, all) => all.findIndex((item) => Number(item.id) === Number(candidate.id)) === index);

        // Retourne le ticket original plus son analyse.
        return {
            // Conserve toutes les propriétés existantes du ticket.
            ...ticket,
            // Ajoute l'analyse de panne récurrente calculée sur les tickets liés.
            recurrentFailure: analyzeRecurrentFailure(ticket, relatedTickets)
        };
    });
}
