"use client";

/*
Commentaire simple du fichier :
- Espace : import.
- Partie : import.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ImportOrder = {
    id: number;
    status: string;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type OverviewPayload = {
    pendingOrders: ImportOrder[];
    alertOrders: ImportOrder[];
    historyOrders: ImportOrder[];
};

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ImportPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [payload, setPayload] = useState<OverviewPayload>({ pendingOrders: [], alertOrders: [], historyOrders: [] });

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/import/overview", { cache: "no-store" });
                const data = await response.json();
                setPayload({
                    pendingOrders: Array.isArray(data?.pendingOrders) ? data.pendingOrders : [],
                    alertOrders: Array.isArray(data?.alertOrders) ? data.alertOrders : [],
                    historyOrders: Array.isArray(data?.historyOrders) ? data.historyOrders : []
                });
            } catch (error) {
                console.error("Import load error:", error);
                setPayload({ pendingOrders: [], alertOrders: [], historyOrders: [] });
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const pendingCount = useMemo(() => payload.pendingOrders.length, [payload.pendingOrders]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const receivedCount = useMemo(() => {
        const merged = [...payload.alertOrders, ...payload.historyOrders];
        return merged.filter((order, index, array) => array.findIndex((entry) => entry.id === order.id) === index).length;
    }, [payload.alertOrders, payload.historyOrders]);

    if (loading) {
        return <div className={styles.emptyState}>Chargement de l'espace import...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Tableau de bord</h1>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <div className="card" style={{ padding: "1rem" }}>
                    <div className={styles.statLabel}>Demandes en cours</div>
                    <div className={styles.statValue}>{pendingCount}</div>
                </div>
                <div className="card" style={{ padding: "1rem" }}>
                    <div className={styles.statLabel}>Réceptions historisées</div>
                    <div className={styles.statValue}>{receivedCount}</div>
                </div>
            </div>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "import" de l espace "import".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
