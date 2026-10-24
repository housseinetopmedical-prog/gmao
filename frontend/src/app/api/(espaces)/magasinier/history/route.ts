import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        const [contractHistory, partRequestHistory, stockMovements, orders, internalExchanges] = await Promise.all([
            prisma.sav_history.findMany({
                where: {
                    action: {
                        in: [
                            "MAGASINIER_CONTRACT_REVIEW_SAVED",
                            "MAGASINIER_CONTRACT_REVIEW_RETURNED",
                            "MAGASINIER_CONTRACT_REVIEW_VALIDATED",
                            "MAGASINIER_CONTRACT_REVIEW"
                        ]
                    }
                },
                include: {
                    ticket: {
                        select: { id: true, title: true }
                    },
                    user: {
                        select: { id: true, name: true, role: true }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 60
            }),
            prisma.sav_history.findMany({
                where: {
                    action: {
                        in: ["PART_REQUEST", "PART_REQUEST_SENT_TO_STORE", "MAGASINIER_PART_REQUEST_STATUS"]
                    }
                },
                include: {
                    ticket: {
                        select: { id: true, title: true }
                    },
                    user: {
                        select: { id: true, name: true, role: true }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 80
            }),
            prisma.stock_movement.findMany({
                include: {
                    part: {
                        select: { id: true, name: true, reference: true }
                    },
                    ticket: {
                        select: { id: true, title: true }
                    },
                    technician: {
                        select: { id: true, name: true }
                    }
                },
                orderBy: {
                    date: "desc"
                },
                take: 80
            }),
            prisma.purchase_order.findMany({
                include: {
                    creator: {
                        select: { id: true, name: true, role: true }
                    },
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
                    updatedAt: "desc"
                },
                take: 80
            }),
            prisma.message_ticket_interne.findMany({
                include: {
                    expediteur: {
                        select: { id: true, name: true, role: true }
                    },
                    ticketInterne: {
                        select: {
                            threadId: true,
                            sujet: true,
                            destination: true,
                            statut: true,
                            ticket: {
                                select: { id: true, title: true }
                            }
                        }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                },
                take: 60
            })
        ]);

        return NextResponse.json({
            contractHistory,
            partRequestHistory,
            stockMovements,
            orders,
            internalExchanges
        });
    } catch (error: any) {
        console.error("Magasinier history error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}


