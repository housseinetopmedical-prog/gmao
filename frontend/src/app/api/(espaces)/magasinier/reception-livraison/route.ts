import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

export async function GET() {
    try {
        const [movements, orders, parts, technicians, tickets] = await Promise.all([
            prisma.stock_movement.findMany({
                where: {
                    type: {
                        in: ["RECEPTION", "SORTIE"]
                    }
                },
                include: {
                    part: {
                        select: {
                            id: true,
                            name: true,
                            reference: true
                        }
                    },
                    ticket: {
                        select: {
                            id: true,
                            title: true
                        }
                    },
                    technician: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: {
                    date: "desc"
                },
                take: 120
            }),
            prisma.purchase_order.findMany({
                where: {
                    status: {
                        in: ["ORDERED", "SHIPPED", "RECEIVED"]
                    }
                },
                include: {
                    items: {
                        select: {
                            id: true,
                            name: true,
                            ref: true,
                            qty: true,
                            ticketId: true
                        }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 60
            }),
            prisma.part.findMany({
                select: {
                    id: true,
                    name: true,
                    reference: true,
                    quantityInStock: true,
                    minStock: true
                },
                orderBy: {
                    name: "asc"
                }
            }),
            prisma.user.findMany({
                where: {
                    role: "TECHNICIAN"
                },
                select: {
                    id: true,
                    name: true
                },
                orderBy: {
                    name: "asc"
                }
            }),
            prisma.ticket.findMany({
                where: {
                    status: {
                        in: ["PENDING_PARTS", "REPAIR", "DIAGNOSTIC", "QUALITY_TEST"]
                    }
                },
                select: {
                    id: true,
                    title: true,
                    status: true,
                    assignedTo: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: {
                    updatedAt: "desc"
                }
            })
        ]);

        const ticketReferences = await getTicketAnnualReferenceMap([
            ...movements.map((movement) => Number(movement.ticket?.id || 0)),
            ...tickets.map((ticket) => Number(ticket.id))
        ].filter(Boolean));

        return NextResponse.json({
            movements: movements.map((movement) => ({
                ...movement,
                ticket: movement.ticket ? attachTicketAnnualReference(movement.ticket, ticketReferences) : movement.ticket
            })),
            orders,
            parts,
            technicians,
            tickets: tickets.map((ticket) => attachTicketAnnualReference(ticket, ticketReferences))
        });
    } catch (error: any) {
        console.error("Magasinier réception/livraison error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}



