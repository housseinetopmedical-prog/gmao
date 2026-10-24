import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

export async function GET() {
    try {
        const pendingReclamations = await prisma.reclamation.findMany({
            where: {
                status: "PENDING_STORE_REVIEW" as any
            },
            select: {
                id: true,
                createdAt: true,
                customerName: true,
                deviceModel: true,
                ticket: {
                    select: {
                        id: true,
                        priority: true
                    }
                }
            },
            orderBy: { createdAt: "asc" }
        });

        const ticketReferences = await getTicketAnnualReferenceMap(
            pendingReclamations.map((reclamation) => Number(reclamation.ticket?.id || 0)).filter(Boolean)
        );
        const alerts = pendingReclamations
            .flatMap((reclamation) => {
                const items: Array<{ id: string; level: string; message: string }> = [];
                const ticketReference = reclamation.ticket?.id ? ticketReferences.get(reclamation.ticket.id) || String(reclamation.ticket.id) : "-";
                if (["HIGH", "CRITICAL"].includes(String(reclamation.ticket?.priority || ""))) {
                    items.push({
                        id: `priority-${reclamation.id}`,
                        level: reclamation.ticket?.priority === "CRITICAL" ? "Ticket critique" : "Ticket élevé",
                        message: `Ticket #${ticketReference} pour ${reclamation.customerName || reclamation.deviceModel || "client non renseigné"}`
                    });
                }

                const createdAt = new Date(reclamation.createdAt).getTime();
                if (Number.isFinite(createdAt) && Date.now() - createdAt >= 24 * 60 * 60 * 1000) {
                    items.push({
                        id: `late-${reclamation.id}`,
                        level: "Vérification en retard",
                        message: `Le ticket #${ticketReference} attend toujours la vérification magasinier.`
                    });
                }

                return items;
            })
            .slice(0, 12);

        return NextResponse.json({
            summary: {
                dossiersARemplir: pendingReclamations.length,
                alertes: pendingReclamations.filter((reclamation) => String(reclamation.ticket?.priority || "").toUpperCase() === "CRITICAL").length
            },
            alerts
        });
    } catch (error: any) {
        console.error("Magasinier dashboard error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}



