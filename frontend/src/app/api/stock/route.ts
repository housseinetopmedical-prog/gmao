import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET() {
    try {
        const parts = await prisma.part.findMany({
            include: {
                movements: {
                    orderBy: { date: 'desc' },
                    take: 10
                }
            },
            orderBy: { name: 'asc' }
        });
        return NextResponse.json(parts);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, sageCode, sageDesignation, reference, description, price, quantityInStock, minStock, compatibleModels } = body;

        const part = await prisma.part.create({
            data: {
                name,
                sageCode,
                sageDesignation,
                reference,
                description,
                price: parseFloat(price) || 0,
                quantityInStock: parseInt(quantityInStock) || 0,
                minStock: parseInt(minStock) || 5,
                compatibleModels
            }
        });

        // Créer un mouvement de stock initial si la quantité > 0
        if (parseInt(quantityInStock) > 0) {
            await prisma.stock_movement.create({
                data: {
                    partId: part.id,
                    type: "RECEPTION",
                    qty: parseInt(quantityInStock),
                    ref: "Stock Initial",
                    userId: 1 // Admin par défaut pour l'instant
                }
            });
        }

        return NextResponse.json(part, { status: 201 });
    } catch (error: any) {
        console.error("Error creating part:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}



