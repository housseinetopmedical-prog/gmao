import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { getRequestUserContext } from "@/metier/utilisateur-requete";

export async function GET(req: Request, context: any) {
    const params = await context.params;

    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID de demande invalide." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: { select: { id: true } } }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
        }

        const ticketId = reclamation.ticket?.id;
        if (!ticketId) {
            return NextResponse.json({ history: [] });
        }

        // Récupérer l'historique du ticket (sav_history)
        const history = await prisma.sav_history.findMany({
            where: {
                ticketId: ticketId
            },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                action: true,
                note: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                }
            }
        });

        return NextResponse.json({
            history: history.map((item) => ({
                id: item.id,
                action: item.action,
                note: item.note,
                timestamp: item.createdAt,
                user: item.user ? {
                    id: item.user.id,
                    name: item.user.name,
                    role: item.user.role
                } : null
            }))
        });
    } catch (error: any) {
        console.error("Error fetching reclamation history:", error);
        return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
    }
}

export async function POST(req: Request, context: any) {
    const params = await context.params;

    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID de demande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const { action, note, userId } = body;

        if (!action || typeof action !== "string" || !action.trim()) {
            return NextResponse.json({ error: "Action requise." }, { status: 400 });
        }

        if (!userId || Number.isNaN(Number(userId))) {
            return NextResponse.json({ error: "Utilisateur requis." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: { select: { id: true, equipmentId: true } } }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
        }

        if (!reclamation.ticket) {
            return NextResponse.json({ error: "Pas de ticket associé." }, { status: 400 });
        }

        // Créer l'entrée d'historique
        const historyEntry = await prisma.sav_history.create({
            data: {
                ticketId: reclamation.ticket.id,
                equipmentId: reclamation.ticket.equipmentId,
                userId: Number(userId),
                action: action.trim(),
                note: note ? String(note).trim() : null
            },
            select: {
                id: true,
                action: true,
                note: true,
                createdAt: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            entry: {
                id: historyEntry.id,
                action: historyEntry.action,
                note: historyEntry.note,
                timestamp: historyEntry.createdAt,
                user: historyEntry.user
            }
        });
    } catch (error: any) {
        console.error("Error creating history entry:", error);
        return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
    }
}


