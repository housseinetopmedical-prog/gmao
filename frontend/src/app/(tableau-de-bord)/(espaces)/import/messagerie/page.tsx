"use client";

/*
Commentaire simple du fichier :
- Espace : import.
- Partie : messagerie.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

const InternalTicketingWorkspace = dynamic(() => import("@/composants/espace-tickets/EspaceEchangesInternes"), {
    loading: () => <div style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>Chargement de la messagerie...</div>,
    ssr: false,
});

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ImportMessagingPage() {
    const searchParams = useSearchParams();
    const initialTicketId = Number(searchParams.get("ticketId") || 0) || null;

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Messagerie</h1>
                </div>
            </div>

            <InternalTicketingWorkspace
                title=""
                subtitle=""
                initialTicketId={initialTicketId}
            />
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "messagerie" de l espace "import".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
