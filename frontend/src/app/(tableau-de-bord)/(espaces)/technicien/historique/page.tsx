"use client";

/*
Commentaire simple du fichier :
- Espace : technicien.
- Partie : historique.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import styles from "../technicien.module.css";
import { getInterventionLabel } from "@/metier/workflow-technicien";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketHistoryEntry = {
    action?: string | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type TicketItem = {
    id: number;
    title: string;
    status: string;
    updatedAt?: string | null;
    interventionType?: string | null;
    equipment?: {
        name?: string | null;
        serialNumber?: string | null;
        client?: string | null;
    } | null;
    reclamation?: {
        interventionType?: string | null;
    } | null;
    savHistory?: TicketHistoryEntry[];
};

const TICKETS_REFRESH_MS = 10000;

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function isNonRepareTicket(ticket: TicketItem) {
    const history = Array.isArray(ticket.savHistory) ? ticket.savHistory : [];
    return history.some((entry) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function HistoriqueTechnicienPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [tickets, setTickets] = useState<TicketItem[]>([]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const raw = localStorage.getItem("user");
        const user = raw ? JSON.parse(raw) : {};

        if (!user?.id) {
            setTickets([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        const loadTickets = async (showLoader = false) => {
            if (showLoader) setLoading(true);
            try {
                const res = await fetch(`/api/tickets?assignedToId=${user.id}`, { cache: "no-store" });
                const data = await res.json();
                if (!cancelled) {
                    setTickets(Array.isArray(data) ? data : []);
                }
            } catch (error) {
                console.error("Technician history load error:", error);
                if (!cancelled) {
                    setTickets([]);
                }
            } finally {
                if (showLoader && !cancelled) setLoading(false);
            }
        };

        void loadTickets(true);
        const intervalId = window.setInterval(() => {
            void loadTickets(false);
        }, TICKETS_REFRESH_MS);

        // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
        const handleFocusRefresh = () => {
            if (document.visibilityState === "visible") {
                void loadTickets(false);
            }
        };
        window.addEventListener("focus", handleFocusRefresh);
        document.addEventListener("visibilitychange", handleFocusRefresh);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
            window.removeEventListener("focus", handleFocusRefresh);
            document.removeEventListener("visibilitychange", handleFocusRefresh);
        };
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const historicalTickets = useMemo(
        () =>
            tickets
                .filter((ticket) => {
                    const status = String(ticket.status || "").toUpperCase();
                    return status === "READY_FOR_DELIVERY" || status === "CLOSED" || isNonRepareTicket(ticket);
                })
                .sort((a, b) => new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime()),
        [tickets]
    );

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.sectionCard}>
            {loading ? (
                <div className={styles.empty}>Chargement de l'historique...</div>
            ) : historicalTickets.length === 0 ? (
                <div className={styles.empty}>Aucun ticket archivé pour le moment.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Ticket</th>
                                <th>Client</th>
                                <th>Matériel</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historicalTickets.map((ticket) => (
                                <tr key={ticket.id}>
                                    <td>
                                        <span className={styles.ticketLink}>
                                            #{(ticket as any).displayId || ticket.id}
                                        </span>
                                    </td>
                                    <td>{ticket.equipment?.client || "-"}</td>
                                    <td>
                                        {ticket.equipment?.name || "-"}
                                        <div className={styles.helper}>SN: {ticket.equipment?.serialNumber || "-"}</div>
                                    </td>
                                    <td>{getInterventionLabel(ticket.interventionType || ticket.reclamation?.interventionType)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "historique" de l espace "technicien".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
