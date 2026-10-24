"use client";

/*
Commentaire simple du fichier :
- Espace : client.
- Partie : historique.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { Download, Filter } from "lucide-react";
import styles from "../client.module.css";
import {
    buildClientTimeline,
    getClientVisibleStatus,
    hasSatisfaction,
    isHistoryItem
} from "@/metier/workflow-client";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    status: string;
    createdAt: string;
    updatedAt: string;
    customerName: string;
    deviceModel: string;
    serialNumber: string;
    description: string;
    attachmentUrl?: string | null;
    checklist?: string | null;
    ticket?: {
        id: number;
        displayId?: number | string | null;
        ticketReference?: string | null;
        status: string;
        createdAt: string;
        closedAt?: string | null;
        satisfactionRate?: number | null;
        savHistory?: Array<{
            id: number;
            action: string;
            note?: string | null;
            createdAt: string;
        }>;
    } | null;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getClientReportPdfUrl(item: Reclamation): string | null {
    const timeline = buildClientTimeline(item);
    const latestPdf = [...timeline].reverse().find((event) => {
        const url = String(event.downloadUrl || "");
        if (!url) return false;
        return /\.pdf($|[?#])/i.test(url) || String(event.downloadLabel || "").toLowerCase().includes("pdf");
    });

    return latestPdf?.downloadUrl || null;
}

function satisfactionStars(item: Reclamation) {
    const rating = Number(item.ticket?.satisfactionRate || 0);
    if (!hasSatisfaction(item) || rating <= 0) return <span className={styles.helperText}>Non renseigné</span>;

    return (
        <span aria-label={`${rating} étoile${rating > 1 ? "s" : ""} sur 5`} style={{ display: "inline-flex", gap: "0.12rem", fontSize: "1rem" }}>
            {Array.from({ length: 5 }).map((_, index) => (
                <span key={index} style={{ color: index < rating ? "#fbbc04" : "#d1d5db" }}>★</span>
            ))}
        </span>
    );
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ClientHistoriquePage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);

    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const email = user?.email ? String(user.email).toLowerCase() : "";

        fetch(`/api/reclamations?light=1&contactEmail=${encodeURIComponent(email)}&historyLimit=20&skipSanitize=1`)
            .then((res) => res.json())
            .then((data) => {
                const list = Array.isArray(data) ? data : [];
                setReclamations(list);
            })
            .catch((error) => {
                console.error("Client historique fetch error:", error);
                setReclamations([]);
            })
            .finally(() => setLoading(false));
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const historyItems = useMemo(() => reclamations.filter(isHistoryItem), [reclamations]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const filtered = useMemo(() => {
        return historyItems.filter((item) => {
            const text = `${item.deviceModel} ${item.serialNumber} ${item.id}`.toLowerCase();
            const status = getClientVisibleStatus(item);
            const date = new Date(item.createdAt);
            const lowerDate = dateFrom ? new Date(dateFrom) : null;
            const upperDate = dateTo ? new Date(dateTo) : null;
            if (upperDate) {
                upperDate.setHours(23, 59, 59, 999);
            }

            const matchQuery = text.includes(query.toLowerCase().trim());
            const matchStatus = statusFilter === "ALL" || status === statusFilter;
            const matchLower = lowerDate ? date >= lowerDate : true;
            const matchUpper = upperDate ? date <= upperDate : true;

            return matchQuery && matchStatus && matchLower && matchUpper;
        });
    }, [historyItems, query, statusFilter, dateFrom, dateTo]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const statusOptions = useMemo(() => {
        const values = Array.from(new Set(historyItems.map((item) => getClientVisibleStatus(item))));
        return values.sort();
    }, [historyItems]);

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.page}>
            <section className={styles.heroCard}>
                <div>
                    <h1 className={styles.heroTitle}>Demandes archivées</h1>
                </div>
            </section>

            <section className={styles.filters}>
                <div className={styles.field}>
                    <label className={styles.label}>
                        <Filter size={13} style={{ marginRight: "0.25rem", verticalAlign: "text-bottom" }} />
                        Recherche matériel / demande
                    </label>
                    <input
                        className={styles.input}
                        placeholder="Ex: Moniteur, SN-2026..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Statut</label>
                    <select className={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="ALL">Tous les statuts</option>
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                </div>
                <div className={styles.field}>
                    <label className={styles.label}>Période</label>
                    <div className={styles.fieldGrid2}>
                        <input className={styles.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                        <input className={styles.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                </div>
            </section>

            {loading ? (
                <div className={styles.empty}>Chargement de l'historique...</div>
            ) : filtered.length === 0 ? (
                <div className={styles.empty}>Aucune intervention historique pour ces filtres.</div>
            ) : (
                filtered.map((item) => {
                    const reportPdfUrl = getClientReportPdfUrl(item);

                    // Cette partie affiche l interface visible a l ecran.
                    const ticketNumber = item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id;

                    return (
                        <article key={item.id} className={styles.ticketCard}>
                            <header className={styles.ticketHeader}>
                                <div>
                                    <h2 className={styles.ticketTitle}>Ticket #{ticketNumber}</h2>
                                    <div className={styles.helperText}>
                                        Ticket créé le: {new Date(item.createdAt).toLocaleString("fr-FR")}. Ticket clôturé le: {item.ticket?.closedAt ? new Date(item.ticket.closedAt).toLocaleString("fr-FR") : new Date(item.updatedAt).toLocaleString("fr-FR")}.
                                    </div>
                                </div>
                            </header>

                            <div className={styles.ticketMetaRow}>
                                <div className={styles.ticketMetaBlock}>
                                    <div className={styles.metaLabel}>Matériel</div>
                                    <div className={styles.metaValue}>{item.deviceModel || "-"}</div>
                                </div>
                                <div className={styles.ticketMetaBlock}>
                                    <div className={styles.metaLabel}>SN</div>
                                    <div className={styles.metaValue}>{item.serialNumber || "-"}</div>
                                </div>
                                <div className={styles.ticketMetaBlock}>
                                    <div className={styles.metaLabel}>Niveau de satisfaction</div>
                                    <div className={styles.metaValue}>{satisfactionStars(item)}</div>
                                </div>
                            </div>

                            <div className={styles.rowActions}>
                                {reportPdfUrl ? (
                                    <a className="btn btn-outline" href={reportPdfUrl} target="_blank" rel="noopener noreferrer">
                                        <Download size={14} />
                                        Télécharger le rapport final (PDF)
                                    </a>
                                ) : null}
                            </div>
                        </article>
                    );
                })
            )}
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "historique" de l espace "client".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
