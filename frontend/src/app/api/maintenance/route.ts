import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        const totalTickets = await prisma.ticket.count();
        const openTickets = await prisma.ticket.count({
            where: {
                status: {
                    not: "CLOSED"
                }
            }
        });
        const equipmentsInMaintenance = await prisma.equipment.count({
            where: {
                status: "MAINTENANCE_REQUIRED"
            }
        });

        const totalEquipments = await prisma.equipment.count();
        const functionalEquipments = await prisma.equipment.count({
            where: {
                status: "OPERATIONAL"
            }
        });

        const availabilityRate = totalEquipments > 0
            ? Math.round((functionalEquipments / totalEquipments) * 100)
            : 100;

        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const interventionsThisMonth = await prisma.maintenance.count({
            where: {
                scheduledDate: {
                    gte: firstDayOfMonth
                },
                status: "COMPLETED"
            }
        });

        const stats = [
            {
                label: "Tickets actifs",
                value: openTickets.toString(),
                trend: "+5%",
                color: "#c1121f", // Primary Blue
            },
            {
                label: "Appareils en Panne",
                value: (totalEquipments - functionalEquipments).toString(),
                trend: "-2%",
                color: "#ef4444", // Red
            },
            {
                label: "Interventions (Mois)",
                value: interventionsThisMonth.toString(),
                trend: "+12%",
                color: "#10b981", // Green
            },
            {
                label: "Taux Disponibilité",
                value: `${availabilityRate}%`,
                trend: "0%",
                color: "#8b5cf6", // Purple
            }
        ];

        // Chart Data: Tickets per day (last 7 days)
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            return d;
        });

        const chartData = await Promise.all(last7Days.map(async (date) => {
            const dayStart = new Date(date.setHours(0, 0, 0, 0));
            const dayEnd = new Date(date.setHours(23, 59, 59, 999));
            const count = await prisma.ticket.count({
                where: {
                    createdAt: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                }
            });
            return {
                name: date.toLocaleDateString('fr-FR', { weekday: 'short' }),
                tickets: count
            };
        }));

        // Distribution by category (Equipment types)
        const typeDistribution = await prisma.equipment.groupBy({
            by: ['type'],
            _count: {
                id: true
            }
        });

        const categoryData = typeDistribution.map((item: any) => ({
            name: item.type,
            value: item._count.id
        }));

        return NextResponse.json({
            stats,
            chartData,
            categoryData
        });
    } catch (error: any) {
        console.error("Stats API error:", error);
        return NextResponse.json({
            stats: [
                { label: "Tickets actifs", value: "0", trend: "0%", color: "#c1121f" },
                { label: "Appareils en Panne", value: "0", trend: "0%", color: "#ef4444" },
                { label: "Interventions (Mois)", value: "0", trend: "0%", color: "#10b981" },
                { label: "Taux Disponibilite", value: "0%", trend: "0%", color: "#8b5cf6" }
            ],
            chartData: [],
            categoryData: [],
            error: error?.message || "Erreur stats"
        });
    }
}




