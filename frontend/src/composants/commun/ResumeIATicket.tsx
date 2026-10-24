
import { Sparkles } from "lucide-react";

// Ce type décrit les informations IA que le ticket peut contenir.
// Ces valeurs sont enregistrées en base après l'analyse de l'assistant IA.
type AiTicket = {
    // Résumé court de la panne.
    aiSummary?: string | null;
    // Niveau d'urgence proposé par l'IA.
    aiUrgency?: string | null;
    // Causes possibles de la panne.
    aiProbableCauses?: string | null;
    // Pièces que l'IA conseille de vérifier ou prévoir.
    aiSuggestedParts?: string | null;
    // Liste de contrôles rapides proposés par l'IA.
    aiChecklist?: string | null;
};

// Cette fonction convertit une valeur reçue depuis la base en liste simple.
// Elle accepte un tableau, un texte JSON ou un texte séparé par lignes/points-virgules.
function parseList(raw: unknown) {
    // Si la valeur est vide, il n'y a rien à afficher.
    if (!raw) return [];
    // Si la valeur est déjà un tableau, on nettoie chaque élément.
    if (Array.isArray(raw)) return raw.map((item) => String(item || "").trim()).filter(Boolean);
    // Sinon on transforme la valeur en texte propre.
    const text = String(raw || "").trim();
    // Un texte vide donne aussi une liste vide.
    if (!text) return [];
    try {
        // Certains champs sont stockés en JSON, par exemple ["Cause 1", "Cause 2"].
        const parsed = JSON.parse(text);
        // Si le JSON contient une liste, on l'utilise directement après nettoyage.
        if (Array.isArray(parsed)) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    } catch {
        // Si le JSON est invalide, on garde le texte brut et on le découpe plus bas.
    }
    // Dernière solution : découper un texte normal en plusieurs éléments.
    return text
        .split(/\n|;|\u2022/)
        .map((item) => item.replace(/^-/, "").trim())
        .filter(Boolean);
}

// Cette fonction vérifie si le ticket possède au moins une information IA.
// Si tout est vide, le bloc IA ne sera pas affiché.
function hasAiInsights(ticket: AiTicket | null | undefined) {
    return Boolean(
        ticket?.aiSummary ||
        ticket?.aiUrgency ||
        ticket?.aiProbableCauses ||
        ticket?.aiSuggestedParts ||
        ticket?.aiChecklist
    );
}

// Ce petit composant affiche une liste avec un titre.
// Il sert pour les causes, les pièces et la checklist IA.
function Section({ title, items }: { title: string; items: string[] }) {
    // Si la liste est vide, on cache toute la section.
    if (items.length === 0) return null;
    return (
        // Conteneur vertical : titre en haut, liste en bas.
        <div style={{ display: "grid", gap: "0.35rem" }}>
            {/* Titre visible de la section, par exemple "Causes probables". */}
            <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>{title}</div>
            {/* Liste affichée à l'utilisateur. */}
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "#334155", lineHeight: 1.55 }}>
                {items.map((item, index) => (
                    // La clé aide React à suivre chaque ligne de la liste.
                    <li key={`${title}-${index}`}>{item}</li>
                ))}
            </ul>
        </div>
    );
}

// Ce composant affiche le résultat IA déjà enregistré dans un ticket.
// Il est utilisé dans les espaces ADV, responsable technique et technicien.
export default function AiTicketInsights({ ticket, compact = false }: { ticket: AiTicket | null | undefined; compact?: boolean }) {
    // Si le ticket n'a aucun résultat IA, on ne met rien dans la page.
    if (!hasAiInsights(ticket)) return null;

    // On prépare les listes avant de les afficher.
    const probableCauses = parseList(ticket?.aiProbableCauses);
    const suggestedParts = parseList(ticket?.aiSuggestedParts);
    const checklist = parseList(ticket?.aiChecklist);

    return (
        // Bloc bleu clair qui signale visuellement une qualification IA.
        <section
            style={{
                border: "1px solid #bfdbfe",
                borderRadius: "8px",
                background: "#eff6ff",
                padding: compact ? "0.75rem" : "1rem",
                display: "grid",
                gap: compact ? "0.6rem" : "0.85rem"
            }}
        >
            {/* En-tête du bloc : icône, titre et badge d'urgence. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
                {/* Titre de la qualification IA. */}
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", fontWeight: 900, color: "#0f172a" }}>
                    <Sparkles size={16} />
                    Qualification IA SAV
                </div>
                {/* Le badge d'urgence s'affiche seulement si l'IA a proposé une urgence. */}
                {ticket?.aiUrgency ? (
                    <span
                        style={{
                            borderRadius: "999px",
                            padding: "0.2rem 0.6rem",
                            fontSize: "0.78rem",
                            fontWeight: 900,
                            background: /critique|élevé|eleve/i.test(ticket.aiUrgency) ? "#fee2e2" : "#fef3c7",
                            color: /critique|élevé|eleve/i.test(ticket.aiUrgency) ? "#991b1b" : "#92400e"
                        }}
                    >
                        Urgence IA: {ticket.aiUrgency}
                    </span>
                ) : null}
            </div>
            {/* Résumé court de la panne selon l'IA. */}
            {ticket?.aiSummary ? <div style={{ color: "#334155", lineHeight: 1.55 }}>{ticket.aiSummary}</div> : null}
            {/* En mode compact, les listes passent sur une seule colonne. */}
            <div style={{ display: "grid", gap: "0.8rem", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))" }}>
                <Section title="Causes probables" items={probableCauses} />
                <Section title="Pièces probables" items={suggestedParts} />
                <Section title="Checklist SOS IA" items={checklist} />
            </div>
        </section>
    );
}
