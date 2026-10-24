"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

const InternalTicketingWorkspace = dynamic(() => import("@/composants/espace-tickets/EspaceEchangesInternes"), {
    loading: () => <div style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>Chargement de la messagerie...</div>,
    ssr: false,
});

export default function AppelsOffreMessagingPage() {
    const searchParams = useSearchParams();
    const initialTicketId = Number(searchParams.get("ticketId") || 0) || null;

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
