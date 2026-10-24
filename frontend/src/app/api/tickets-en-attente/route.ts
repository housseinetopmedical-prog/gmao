import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        // Obtenir les tickets qui sont en attente de pièces ou qui ont des articles d'achat liés
        const ticketsWithParts = await prisma.ticket.findMany({
            where: {
                OR: [
                    { status: "PENDING_PARTS" },
                    { purchaseItems: { some: {} } }
                ]
            },
            include: {
                equipment: {
                    select: { name: true, brand: true, model: true }
                },
                purchaseItems: {
                    include: {
                        order: {
                            select: { 
                                ref: true, 
                                status: true, 
                                sourceType: true, 
                                expectedDate: true 
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });

        // Pour chaque ticket, vérifier la disponibilité en stock des pièces mentionnées (par nom/réf)
        const enrichedTickets = await Promise.all(ticketsWithParts.map(async (ticket) => {
            const items = await Promise.all(ticket.purchaseItems.map(async (item) => {
                // Essayer de trouver la pièce correspondante dans le stock par référence ou nom
                const stockPart = await prisma.part.findFirst({
                    where: {
                        OR: [
                            { reference: item.ref || "" },
                            { name: item.name }
                        ]
                    }
                });

                return {
                    ...item,
                    inStock: stockPart ? stockPart.quantityInStock : 0,
                    isAvailable: stockPart ? stockPart.quantityInStock >= item.qty : false,
                    stockPartId: stockPart ? stockPart.id : null
                };
            }));

            return {
                ...ticket,
                purchaseItems: items
            };
        }));

        return NextResponse.json(enrichedTickets);
    } catch (error: any) {
        console.error("Error fetching pending tickets:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}



