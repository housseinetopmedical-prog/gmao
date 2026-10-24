"use client";

/*
Commentaire simple du fichier :
- Espace : client.
- Partie : suivi.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
    Star,
    History,
    Send,
    Loader2,
    CheckCircle2
} from "lucide-react";
import styles from "../client.module.css";
import {
    hasAdvAdministrativeClosure,
    buildClientTimeline,
    getClientVisibleStatus,
    hasSatisfaction,
    isOpenForClient,
    parseChecklistPayload,
    pruneExpiredClientAttachments
} from "@/metier/workflow-client";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type SavHistoryEntry = {
    id: number;
    action: string;
    note?: string | null;
    createdAt: string;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketData = {
    id: number;
    displayId?: number | string | null;
    ticketReference?: string | null;
    status: string;
    createdAt: string;
    closedAt?: string | null;
    interventionType?: string | null;
    satisfactionRate?: number | null;
    savHistory?: SavHistoryEntry[];
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    createdAt: string;
    updatedAt: string;
    status: string;
    deviceModel: string;
    serialNumber: string;
    description: string;
    attachmentUrl?: string | null;
    checklist?: string | null;
    ticket?: TicketData | null;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function statusClass(status: string) {
    const value = status.toLowerCase();
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("non prise") || normalized.includes("non réparé")) return styles.statusDanger;
    if (normalized.includes("attente") || normalized.includes("demande d'intervention recue")) return styles.statusWarn;
    if (normalized.includes("clôture") || normalized.includes("pret")) return styles.statusSuccess;
    return styles.statusInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getTimelineActor(event: { label?: string; actor?: string | null }): "Client" | "Administration des ventes" | "Responsable technique" | "Technicien" | "SAV" {
    const rawActor = String(event?.actor || "").toUpperCase();
    if (rawActor === "CLIENT") return "Client";
    if (rawActor === "ADV") return "Administration des ventes";
    if (rawActor === "RESPONSABLE_TECHNIQUE") return "SAV";
    if (rawActor === "TECHNICIAN" || rawActor === "TECHNICIEN") return "SAV";
    const value = String(event?.label || "").toLowerCase();

    if (value.includes("devis validé") || value.includes("devis refusé") || value.includes("satisfaction envoyée")) {
        return "Client";
    }
    if (value.includes("devis en attente") || value.includes("devis soumis") || value.includes("validation") || value.includes("qualification") || value.includes("décision") || value.includes("administration des ventes")) {
        return "Administration des ventes";
    }
    if (value.includes("mise à jour client")) return "Client";
    return "SAV";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function shouldHideTimelineActor(eventLabel: string) {
    return String(eventLabel || "").toLowerCase().includes("ticket créé");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function actorClass(actor: ReturnType<typeof getTimelineActor>) {
    if (actor === "Client") return styles.statusInfo;
    if (actor === "Administration des ventes") return styles.statusSuccess;
    if (actor === "Responsable technique" || actor === "Technicien") return styles.statusSuccess;
    return styles.statusDanger;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function actorStyle(actor: ReturnType<typeof getTimelineActor>) {
    if (actor === "Client") return { background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe" };
    if (actor === "Administration des ventes") return { background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0" };
    if (actor === "Responsable technique") return { background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" };
    if (actor === "Technicien") return { background: "#cffafe", color: "#155e75", border: "1px solid #a5f3fc" };
    return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatTimelineDetails(detail: unknown) {
    const text = String(detail || "").trim();
    if (!text) return [];

    const comment = text.match(/Commentaire:\s*(.*)$/i)?.[1]?.trim();
    const rows: Array<{ label: string; value: string }> = [];

    if (comment) {
        rows.push({ label: "Commentaire SAV", value: comment });
    }
    if (rows.length === 0) {
        rows.push({ label: "", value: /Nature:/i.test(text) ? "Réparation en cours" : text });
    }
    return rows;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function scoreLabel(score: number) {
    if (score <= 1) return "Insatisfait";
    if (score <= 2) return "Mitigé";
    if (score <= 3) return "Satisfait";
    if (score <= 4) return "Très satisfait";
    return "Excellent";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function valueOrDash(value: unknown) {
    const text = String(value ?? "").trim();
    return text || "-";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function sectorLabel(value: unknown) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "PUBLIC") return "Public";
    if (normalized === "PRIVE" || normalized === "PRIVATE") return "Privé";
    return valueOrDash(value);
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ClientSuiviPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [currentUser, setCurrentUser] = useState<{ id?: number; email?: string }>({});

    const [satisfactionTarget, setSatisfactionTarget] = useState<Reclamation | null>(null);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState("");
    const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
    const [savingSatisfaction, setSavingSatisfaction] = useState(false);
    const [processingQuoteId, setProcessingQuoteId] = useState<number | null>(null);

    const fetchReclamations = async () => {
        setLoading(true);
        try {
            const user = JSON.parse(localStorage.getItem("user") || "{}");
            const email = user?.email ? String(user.email).toLowerCase() : "";
            setCurrentUser({ id: user?.id, email });

            const response = await fetch(`/api/reclamations?light=1&contactEmail=${encodeURIComponent(email)}&historyLimit=16&skipSanitize=1`);
            const data = await response.json();
            setReclamations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Client suivi fetch error:", error);
            setReclamations([]);
        } finally {
            setLoading(false);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        fetchReclamations();
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const filtered = useMemo(() => reclamations.filter(isOpenForClient), [reclamations]);

    const submitSatisfaction = async () => {
        if (!satisfactionTarget || savingSatisfaction) return;
        if (wouldRecommend === null) {
            alert("Veuillez indiquer si vous recommandez le service.");
            return;
        }

        setSavingSatisfaction(true);
        try {
            const response = await fetch(`/api/reclamations/${satisfactionTarget.id}/satisfaction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rating,
                    comment,
                    wouldRecommend,
                    userId: currentUser.id
                })
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || "Impossible d'envoyer la satisfaction.");
                return;
            }

            setSatisfactionTarget(null);
            setComment("");
            setWouldRecommend(null);
            await fetchReclamations();
            alert("Merci, votre retour de satisfaction est enregistré.");
        } catch (error) {
            console.error("Satisfaction submit error:", error);
            alert("Une erreur est survenue.");
        } finally {
            setSavingSatisfaction(false);
        }
    };

    const submitQuoteDecision = async (reclamationId: number, decision: "APPROVE" | "REJECT") => {
        if (processingQuoteId) return;
        const confirmationMessage =
            decision === "APPROVE"
                ? "Confirmez-vous la validation du devis ?"
                : "Confirmez-vous le refus du devis ?";
        if (!window.confirm(confirmationMessage)) return;

        setProcessingQuoteId(reclamationId);
        try {
            const response = await fetch(`/api/reclamations/${reclamationId}/quote-decision`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId: currentUser.id,
                    decision
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                alert(data?.error || "Impossible d'enregistrer votre décision.");
                return;
            }
            await fetchReclamations();
            alert(decision === "APPROVE" ? "Devis validé. Le SAV reprend automatiquement la réparation." : "Devis refusé.");
        } catch (error) {
            console.error("Client quote decision error:", error);
            alert("Une erreur est survenue.");
        } finally {
            setProcessingQuoteId(null);
        }
    };

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.page}>
            <section className={styles.heroCard}>
                <div>
                    <h1 className={styles.heroTitle}>Suivi de ma demande d'intervention</h1>
                </div>
            </section>

            {loading ? (
                <div className={styles.empty}>Chargement du suivi...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>Aucune intervention trouvée.</div>
            ) : (
                filtered.map((item) => {
                    const status = getClientVisibleStatus(item);
                    const timeline = buildClientTimeline(item);
                    const checklistPayload = parseChecklistPayload(item.checklist);
                    const checklistMeta = checklistPayload.metadata || {};
                    const quote = checklistPayload.metadata?.quote;
                    const facturationInvoice = (checklistMeta as any)?.facturationInvoice;
                    const quoteDocuments = pruneExpiredClientAttachments(
                        Array.isArray(quote?.documents) ? quote.documents : [],
                        String(quote?.sentAt || item.updatedAt || item.createdAt || "").trim() || null
                    );
                    const quoteAmount = Number(quote?.amount || 0);
                    const isAdministrativelyClosed = hasAdvAdministrativeClosure(item);
                    const clientName = valueOrDash(
                        [String((checklistMeta as any).firstName || "").trim(), String((checklistMeta as any).lastName || "").trim()]
                            .filter(Boolean)
                            .join(" ")
                    );
                    const clientEmail = valueOrDash((checklistMeta as any).contactEmail || currentUser.email);
                    const clientPhone = valueOrDash((checklistMeta as any).entryRepairSlip?.phone || (checklistMeta as any).phone || (checklistMeta as any).mobilePhone);
                    const clientPhoneFixed = valueOrDash((checklistMeta as any).phoneFixed);
                    const equipmentName = valueOrDash((checklistMeta as any).equipmentName || item.deviceModel);
                    const equipmentSerialNumber = valueOrDash(item.serialNumber);
                    const specialtyValue = (checklistMeta as any).specialty === "AUTRE"
                        ? (checklistMeta as any).specialtyOther
                        : (checklistMeta as any).specialty;

                    // Cette partie affiche l interface visible a l ecran.
                    const ticketNumber = item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id;

                    return (
                        <article key={item.id} className={styles.ticketCard}>
                            <header className={styles.ticketHeader}>
                                <div>
                                    <h2 className={styles.ticketTitle}>Ticket #{ticketNumber}</h2>
                                </div>
                                <span className={`${styles.statusBadge} ${statusClass(status)}`}>{status}</span>
                            </header>

                            <div className={styles.rowActions} style={{ marginTop: "0.75rem", marginBottom: "0.75rem" }}>
                                <Link className="btn btn-outline" href={`/client/demande-intervention?editId=${item.id}`}>
                                    Mettre à jour le ticket
                                </Link>
                            </div>

                            {String(item.status || "") === "QUOTE_SENT_TO_CLIENT" ? (
                                <section className={styles.blockCard}>
                                    <h3 className={styles.blockTitle}>Veuillez valider le devis de réparation</h3>
                                    {quoteAmount > 0 ? <div className={styles.helperText}>Montant proposé: {quoteAmount.toFixed(2)} MAD</div> : null}
                                    {quote?.delay ? <div className={styles.helperText}>Délai estimatif: {String(quote.delay)}</div> : null}
                                    {quote?.comment ? <div className={styles.helperText}>{String(quote.comment)}</div> : null}
                                    {quoteDocuments.length > 0 ? (
                                        <div style={{ marginTop: "0.6rem", display: "grid", gap: "0.45rem" }}>
                                            <div className={styles.helperText} style={{ fontWeight: 700 }}>
                                                Passé un délai de six mois sans prise en charge par le client, le matériel sera considéré comme abandonné et fera l’objet d’une procédure de destruction par Top Medical.
                                            </div>
                                            <div className={styles.helperText} style={{ fontWeight: 700 }}>Cette clause est réputée acceptée par le client à la validation du devis.</div>
                                            {quoteDocuments.map((doc: any, index: number) => (
                                                <a
                                                    key={`${doc.dataUrl || doc.name}-${index}`}
                                                    href={doc.dataUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={styles.notificationLink}
                                                >
                                                    {String(doc.title || "Devis ADV")} - {String(doc.name || "Document")}
                                                </a>
                                            ))}
                                        </div>
                                    ) : null}
                                    <div className={styles.rowActions} style={{ marginTop: "0.5rem" }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => submitQuoteDecision(item.id, "APPROVE")}
                                            disabled={processingQuoteId === item.id}
                                        >
                                            {processingQuoteId === item.id ? "Traitement..." : "Valider"}
                                        </button>
                                        <button
                                            className="btn btn-outline"
                                            onClick={() => submitQuoteDecision(item.id, "REJECT")}
                                            disabled={processingQuoteId === item.id}
                                        >
                                            {processingQuoteId === item.id ? "Traitement..." : "Refuser"}
                                        </button>
                                    </div>
                                </section>
                            ) : null}

                            {facturationInvoice?.dataUrl ? (
                                <section className={styles.blockCard}>
                                    <h3 className={styles.blockTitle}>Facture</h3>
                                    <a
                                        href={String(facturationInvoice.dataUrl)}
                                        download={String(facturationInvoice.name || "facture")}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.notificationLink}
                                    >
                                        {String(facturationInvoice.name || "Télécharger la facture")}
                                    </a>
                                </section>
                            ) : null}

                            <section className={styles.blockCard}>
                                <h3 className={styles.blockTitle}>
                                    <History size={16} style={{ marginRight: "0.3rem", verticalAlign: "text-bottom" }} />
                                    Historique de la prise en charge
                                </h3>
                                <div className={styles.timeline}>
                                    {timeline.map((event) => {
                                        const detailRows = formatTimelineDetails(event.detail);
                                        return (
                                        <div key={event.id} className={styles.timelineItem}>
                                            {!shouldHideTimelineActor(event.label) ? (
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.15rem" }}>
                                                    {(() => {
                                                        const actor = getTimelineActor(event);
                                                        return (
                                                            <span className={styles.statusBadge} style={actorStyle(actor)}>
                                                                {actor}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            ) : null}
                                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.55rem", flexWrap: "wrap" }}>
                                                <div className={styles.timelineLabel}>{event.label}</div>
                                            </div>
                                            {detailRows.length > 0 ? (
                                                <div style={{ display: "grid", gap: "0.12rem", marginTop: "0.2rem" }}>
                                                    {detailRows.map((row, index) => (
                                                        <div key={`${event.id}-detail-${index}`} className={styles.timelineDetail}>
                                                            {row.label ? <strong>{row.label}: </strong> : null}
                                                            {row.value}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                            {event.downloadUrl ? (
                                                <a
                                                    href={event.downloadUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={styles.notificationLink}
                                                >
                                                    {event.downloadLabel || "Télécharger le document"}
                                                </a>
                                            ) : null}
                                            <div className={styles.timelineDate}>{new Date(event.at).toLocaleString()}</div>
                                        </div>
                                    )})}
                                </div>
                            </section>

                            {isAdministrativelyClosed ? (
                                <div className={styles.rowActions}>
                                    {hasSatisfaction(item) ? (
                                        <span className={`${styles.statusBadge} ${styles.statusSuccess}`}>
                                            <CheckCircle2 size={14} style={{ marginRight: "0.3rem" }} />
                                            Satisfaction déjà enregistrée
                                        </span>
                                    ) : (
                                        <button className="btn btn-primary" onClick={() => setSatisfactionTarget(item)}>
                                            <Star size={14} />
                                            Évaluez notre SAV
                                        </button>
                                    )}
                                </div>
                            ) : null}
                        </article>
                    );
                })
            )}

            {satisfactionTarget ? (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modalCard}>
                        <h2 className={styles.sectionTitle}>Enquête de satisfaction</h2>
                        <p className={styles.helperText}>
                            Pour nous aider à améliorer, merci de noter votre niveau de satisfaction de SAV Top Medical pour la demande #{satisfactionTarget.ticket?.ticketReference || satisfactionTarget.ticket?.displayId || satisfactionTarget.ticket?.id || satisfactionTarget.id}.
                        </p>

                        <div className={styles.field}>
                            <label className={styles.label}>Note</label>
                            <div className={styles.ratingGrid}>
                                {Array.from({ length: 5 }).map((_, index) => {
                                    const score = index + 1;
                                    // Cette partie affiche l interface visible a l ecran.
                                    return (
                                        <button
                                            key={score}
                                            type="button"
                                            className={`${styles.ratingBtn} ${rating >= score ? styles.ratingBtnActive : ""}`}
                                            onClick={() => setRating(score)}
                                            aria-label={`${score} étoile${score > 1 ? "s" : ""}`}
                                        >
                                            ★
                                        </button>
                                    );
                                })}
                            </div>
                            <div className={styles.helperText}>Évaluation actuelle: {scoreLabel(rating)}</div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Recommanderiez-vous le service ?</label>
                            <div className={styles.radioRow}>
                                <label className={styles.radioLabel}>
                                    <input type="radio" checked={wouldRecommend === true} onChange={() => setWouldRecommend(true)} /> Oui
                                </label>
                                <label className={styles.radioLabel}>
                                    <input type="radio" checked={wouldRecommend === false} onChange={() => setWouldRecommend(false)} /> Non
                                </label>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label className={styles.label}>Commentaire</label>
                            <textarea
                                className={styles.textarea}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Partagez votre retour sur la prestation"
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                            <button className="btn btn-outline" onClick={() => setSatisfactionTarget(null)}>
                                Fermer
                            </button>
                            <button className="btn btn-primary" onClick={submitSatisfaction} disabled={savingSatisfaction}>
                                {savingSatisfaction ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                                Envoyer
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <style jsx>{`
                @keyframes spin {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }

                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "suivi" de l espace "client".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
