import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        const now = new Date();

        // 1. Nouveaux tickets (Statut OPEN)
        const newTicketsCount = await prisma.ticket.count({
            where: { status: "OPEN" }
        });

        // 2. Tickets à qualifier (Statut QUALIFICATION)
        const toQualifyCount = await prisma.ticket.count({
            where: { status: "QUALIFICATION" }
        });

        // 3. Tickets en retard (estimatedEndDate passée et non clôturé)
        const overdueCount = await prisma.ticket.count({
            where: {
                estimatedEndDate: { lt: now },
                status: { not: "CLOSED" }
            }
        });

        // 4. Tickets en attente d'affectation (assignedToId null et non clôturé)
        const unassignedCount = await prisma.ticket.count({
            where: {
                assignedToId: null,
                status: { not: "CLOSED" }
            }
        });

        // 5. Garantie (Calculé à la volée ou basé sur le champ isUnderWarranty)
        // En SQL/Prisma, on peut compter ceux qui ont isUnderWarranty: true
        const underWarrantyCount = await prisma.ticket.count({
            where: { 
                isUnderWarranty: true,
                status: { not: "CLOSED" }
            }
        });

        const outOfWarrantyCount = await prisma.ticket.count({
            where: { 
                isUnderWarranty: false,
                status: { not: "CLOSED" }
            }
        });

        // 6. Tickets avec documents manquants (sous garantie mais pas de BL ou Facture dans l'équipement)
        // L'ADV a besoin d'alertes sur les documents manquants
        const missingDocsCount = await prisma.ticket.count({
            where: {
                isUnderWarranty: true,
                status: { not: "CLOSED" },
                equipment: {
                    blDocumentUrl: null,
                    invoiceUrl: null
                }
            }
        });

        // 6. Réclamations en attente
        const pendingReclamations = await prisma.reclamation.count({
            where: { status: "PENDING" }
        });

        const stats = [
            {
                label: "Nouveaux Tickets",
                value: newTicketsCount.toString(),
                trend: "À traiter",
                color: "#c1121f",
                icon: "AlertCircle"
            },
            {
                label: "À Qualifier",
                value: toQualifyCount.toString(),
                trend: "Attente ADV",
                color: "#7c3aed",
                icon: "FileSearch"
            },
            {
                label: "En Retard",
                value: overdueCount.toString(),
                trend: "Attention !",
                color: "#ef4444",
                icon: "Clock"
            },
            {
                label: "Non Assignés",
                value: unassignedCount.toString(),
                trend: "Affectation",
                color: "#f59e0b",
                icon: "UserPlus"
            },
            {
                label: "Sous Garantie",
                value: underWarrantyCount.toString(),
                trend: `${outOfWarrantyCount} hors g.`,
                color: "#10b981",
                icon: "ShieldCheck"
            },
            {
                label: "Docs Manquants",
                value: missingDocsCount.toString(),
                trend: "Relance requise",
                color: "#eab308",
                icon: "AlertTriangle"
            }
        ];

        return NextResponse.json({
            stats,
            counts: {
                newTickets: newTicketsCount,
                toQualify: toQualifyCount,
                overdue: overdueCount,
                unassigned: unassignedCount,
                underWarranty: underWarrantyCount,
                outOfWarranty: outOfWarrantyCount,
                missingDocs: missingDocsCount,
                pendingReclamations
            }
        });
    } catch (error: any) {
        console.error("Error fetching ADV stats:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}




