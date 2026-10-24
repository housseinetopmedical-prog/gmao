import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        // 1. Nombre de pièces en stock (Total)
        const totalPartsStock = await prisma.part.aggregate({
            _sum: {
                quantityInStock: true
            }
        });

        // 2. Pièces critiques ou en rupture
        const criticalPartsCount = await prisma.part.count({
            where: {
                quantityInStock: {
                    lte: prisma.part.fields.minStock
                }
            }
        });

        const outOfStockCount = await prisma.part.count({
            where: {
                quantityInStock: 0
            }
        });

        // 3. Demandes en attente (Purchase Orders in DEMAND or QUOTATION status)
        const pendingDemandsCount = await prisma.purchase_order.count({
            where: {
                status: {
                    in: ["DEMAND", "QUOTATION"]
                }
            }
        });

        // 4. Tickets bloqués à cause d'une pièce
        const blockedTicketsCount = await prisma.ticket.count({
            where: {
                status: "PENDING_PARTS"
            }
        });

        // 5. Entrées et sorties récentes (Stock Movements)
        const recentMovements = await prisma.stock_movement.findMany({
            take: 10,
            orderBy: {
                date: 'desc'
            },
            include: {
                part: {
                    select: {
                        name: true,
                        reference: true
                    }
                }
            }
        });

        // 6. Alertes (Specific parts that are low or out)
        const stockAlerts = await prisma.part.findMany({
            where: {
                quantityInStock: {
                    lte: prisma.part.fields.minStock
                }
            },
            take: 5,
            orderBy: {
                quantityInStock: 'asc'
            }
        });

        const stats = [
            {
                label: "Pièces en Stock",
                value: (totalPartsStock._sum.quantityInStock || 0).toString(),
                trend: "Global",
                color: "#c1121f", // Blue
                icon: "Package"
            },
            {
                label: "Articles Critiques",
                value: criticalPartsCount.toString(),
                trend: `${outOfStockCount} en rupture`,
                color: "#ef4444", // Red
                icon: "AlertTriangle"
            },
            {
                label: "Demandes en Attente",
                value: pendingDemandsCount.toString(),
                trend: "Approvisionnement",
                color: "#f59e0b", // Orange
                icon: "ShoppingCart"
            },
            {
                label: "Tickets Bloqués",
                value: blockedTicketsCount.toString(),
                trend: "Manque de pièces",
                color: "#8b5cf6", // Purple
                icon: "Clock"
            }
        ];

        return NextResponse.json({
            stats,
            recentMovements,
            stockAlerts,
            summary: {
                totalPartsStock: totalPartsStock._sum.quantityInStock || 0,
                criticalPartsCount,
                outOfStockCount,
                pendingDemandsCount,
                blockedTicketsCount
            }
        });
    } catch (error: any) {
        console.error("Error fetching magasinier stats:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}




