"use client";

/*
Commentaire simple du fichier :
- Espace : import.
- Partie : historique receptions.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useState } from "react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ImportOrder = {
    id: number;
    ref: string;
    status: string;
    receivedDate: string | null;
    ticket?: {
        id: number;
        title: string;
    } | null;
    equipment?: {
        name?: string | null;
        serialNumber?: string | null;
        client?: string | null;
    } | null;
    items: Array<{
        id: number;
        name: string;
        qty: number;
    }>;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function replaceReclamationByIntervention(value: string | null | undefined) {
    return String(value || "")
        .replace(/Réclamation/g, "Intervention")
        .replace(/réclamation/g, "intervention")
        .replace(/Reclamation/g, "Intervention")
        .replace(/reclamation/g, "intervention");
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ImportHistoryPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [historyOrders, setHistoryOrders] = useState<ImportOrder[]>([]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/import/overview", { cache: "no-store" });
                const data = await response.json().catch(() => ({}));
                const merged = [
                    ...(Array.isArray(data?.alertOrders) ? data.alertOrders : []),
                    ...(Array.isArray(data?.historyOrders) ? data.historyOrders : [])
                ];
                const uniqueOrders = merged.filter((order, index, array) => array.findIndex((entry) => entry.id === order.id) === index);
                setHistoryOrders(uniqueOrders);
            } catch (error) {
                console.error("Import history load error:", error);
                setHistoryOrders([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    if (loading) {
        return <div className={styles.emptyState}>Chargement de l'historique des réceptions...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Historique</h1>
                </div>
            </div>

            <section className="card">
                {historyOrders.length === 0 ? (
                    <div className={styles.emptyState}>Aucune réception enregistrée dans l'historique.</div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>Référence</th>
                                    <th>Client</th>
                                    <th>Matériel</th>
                                    <th>Ticket</th>
                                    <th>Pièces</th>
                                    <th>Date de réception</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyOrders.map((order) => (
                                    <tr key={order.id}>
                                        <td>{order.ref}</td>
                                        <td>{order.equipment?.client || "-"}</td>
                                        <td>
                                            {order.equipment?.name || "-"}
                                            <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem" }}>SN: {order.equipment?.serialNumber || "-"}</div>
                                        </td>
                                        <td>{order.ticket ? `#${(order.ticket as any).ticketReference || (order.ticket as any).displayId || order.ticket.id}` : "-"}</td>
                                        <td>{order.items.map((item) => `${item.name} x${item.qty}`).join(", ")}</td>
                                        <td>{order.receivedDate ? new Date(order.receivedDate).toLocaleDateString("fr-FR") : "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "historique receptions" de l espace "import".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
