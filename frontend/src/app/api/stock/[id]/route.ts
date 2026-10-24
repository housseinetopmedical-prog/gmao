import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export async function GET(req: Request, context: any) {
    const params = await context.params;
    try {
        const id = parseInt(params.id);
        const part = await prisma.part.findUnique({
            where: { id },
            include: { movements: { orderBy: { date: 'desc' } } }
        });
        if (!part) return NextResponse.json({ error: "Pièce non trouvée" }, { status: 404 });
        return NextResponse.json(part);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req: Request, context: any) {
    const params = await context.params;
    try {
        const id = parseInt(params.id);
        const body = await req.json();
        const { name, sageCode, sageDesignation, reference, description, price, quantityInStock, minStock, compatibleModels } = body;

        const originalPart = await prisma.part.findUnique({ where: { id } });
        if (!originalPart) return NextResponse.json({ error: "Pièce non trouvée" }, { status: 404 });

        const part = await prisma.part.update({
            where: { id },
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

        // Enregistrer une correction de stock si la quantité a été modifiée manuellement sans mouvement explicite
        const diff = (parseInt(quantityInStock) || 0) - originalPart.quantityInStock;
        if (diff !== 0) {
            await prisma.stock_movement.create({
                data: {
                    partId: id,
                    type: diff > 0 ? "RECEPTION" : "SORTIE",
                    qty: Math.abs(diff),
                    ref: "Correction Manuelle",
                    userId: 1
                }
            });
        }

        return NextResponse.json(part);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request, context: any) {
    const params = await context.params;
    try {
        const id = parseInt(params.id);
        
        // Supprimer d'abord les mouvements
        await prisma.stock_movement.deleteMany({ where: { partId: id } });
        
        await prisma.part.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


