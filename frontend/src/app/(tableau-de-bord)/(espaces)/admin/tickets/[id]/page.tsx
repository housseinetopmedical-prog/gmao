"use client";

import { TicketFollowUpWorkspace } from "@/app/(tableau-de-bord)/(espaces)/adv/suivi-client/[ticketId]/page";
import { ResponsableTechniqueTicketDetailContent } from "@/app/(tableau-de-bord)/(espaces)/responsable-technique/tickets/[ticketId]/page";
import { useParams, useSearchParams } from "next/navigation";

export default function AdminTicketDetailPage() {
    const params = useParams<{ id?: string }>();
    const searchParams = useSearchParams();
    const ticketId = Number(params?.id || 0) || null;
    const view = String(searchParams.get("vue") || "detail").trim().toLowerCase();

    if (view === "suivi") {
        return (
            <ResponsableTechniqueTicketDetailContent
                ticketIdOverride={ticketId}
                backHref="/admin/tickets"
                forceFollowUp
            />
        );
    }

    if (view === "historique" || view === "prise-en-charge") {
        return (
            <TicketFollowUpWorkspace
                backHref="/admin/tickets"
                showPieces={false}
            />
        );
    }

    return (
        <ResponsableTechniqueTicketDetailContent
            ticketIdOverride={ticketId}
            backHref="/admin/tickets"
            readOnly
        />
    );
}
