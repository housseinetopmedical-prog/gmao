"use client";

import dynamic from "next/dynamic";

const InternalTicketingWorkspace = dynamic(() => import("@/composants/espace-tickets/EspaceEchangesInternes"), {
    loading: () => <div style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>Chargement de la messagerie...</div>,
    ssr: false,
});

export default function InternalTicketingPage() {
    return (
        <InternalTicketingWorkspace
            title=""
            subtitle=""
        />
    );
}
