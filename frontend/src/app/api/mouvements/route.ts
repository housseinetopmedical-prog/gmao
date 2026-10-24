import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

export async function GET() {
    try {
        const movements = await prisma.stock_movement.findMany({
            include: {
                part: {
                    select: { name: true, reference: true, sageCode: true }
                },
                ticket: {
                    select: { id: true, title: true }
                },
                technician: {
                    select: { name: true }
                }
            },
            orderBy: { date: 'desc' }
        });
        const ticketReferences = await getTicketAnnualReferenceMap(
            movements.map((movement) => Number(movement.ticket?.id || 0)).filter(Boolean)
        );
        const payload = movements.map((movement) => ({
            ...movement,
            ticket: movement.ticket ? attachTicketAnnualReference(movement.ticket, ticketReferences) : movement.ticket
        }));
        return NextResponse.json(payload);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            partId, 
            type, 
            qty, 
            ref, 
            userId, 
            supplier, 
            sourceType, 
            documentUrl, 
            ticketId, 
            technicianId,
            fromLocation,
            toLocation 
        } = body;

        // Start transaction to update stock and create movement
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create the movement
            const movement = await tx.stock_movement.create({
                data: {
                    partId: parseInt(partId),
                    type,
                    qty: parseInt(qty),
                    ref,
                    userId: parseInt(userId) || 1,
                    supplier,
                    sourceType,
                    documentUrl,
                    ticketId: ticketId ? parseInt(ticketId) : null,
                    technicianId: technicianId ? parseInt(technicianId) : null,
                    fromLocation,
                    toLocation
                }
            });

            // 2. Update the part's stock level (only for reception and withdrawal)
            if (type !== "TRANSFER") {
                const stockUpdate = type === "RECEPTION" ? { increment: parseInt(qty) } : { decrement: parseInt(qty) };
                
                await tx.part.update({
                    where: { id: parseInt(partId) },
                    data: {
                        quantityInStock: stockUpdate
                    }
                });
            }

            return movement;
        });

        return NextResponse.json(result, { status: 201 });
    } catch (error: any) {
        console.error("Error creating movement:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


