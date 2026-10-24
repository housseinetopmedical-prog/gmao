import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

function normalizeRating(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed < 1 || parsed > 5) return null;
    return Math.round(parsed);
}

export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "ID reclamation invalide" }, { status: 400 });
        }

        const body = await req.json();
        const rating = normalizeRating(body.rating);
        const comment = typeof body.comment === "string" ? body.comment.trim() : "";
        const wouldRecommend = typeof body.wouldRecommend === "boolean" ? body.wouldRecommend : null;
        const userIdFromBody = Number(body.userId);

        if (rating === null) {
            return NextResponse.json({ error: "La note doit etre comprise entre 1 et 5" }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: {
                ticket: {
                    include: {
                        savHistory: {
                            select: { action: true }
                        }
                    }
                }
            }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Reclamation introuvable" }, { status: 404 });
        }

        if (!reclamation.ticket) {
            return NextResponse.json({ error: "Aucun ticket lie a cette reclamation" }, { status: 400 });
        }

        const administrativeClosureValidated = Array.isArray(reclamation.ticket.savHistory)
            && reclamation.ticket.savHistory.some((entry) => entry.action === "INTERVENTION_VALIDATED" || entry.action === "SATISFACTION_REQUESTED");

        if (!administrativeClosureValidated) {
            return NextResponse.json({ error: "La satisfaction est disponible uniquement après clôture" }, { status: 400 });
        }

        const userId = Number.isFinite(userIdFromBody) && userIdFromBody > 0 ? userIdFromBody : reclamation.ticket.creatorId;
        const summary = [
            `Note: ${rating}/5`,
            wouldRecommend === null ? "" : `Recommande le service: ${wouldRecommend ? "Oui" : "Non"}`,
            comment ? `Commentaire: ${comment}` : ""
        ]
            .filter(Boolean)
            .join(" | ");

        await prisma.ticket.update({
            where: { id: reclamation.ticket.id },
            data: { satisfactionRate: rating }
        });

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: { satisfactionRate: rating }
        });

        const satisfactionEntry = await prisma.sav_history.create({
            data: {
                ticketId: reclamation.ticket.id,
                equipmentId: reclamation.ticket.equipmentId,
                userId,
                action: "SATISFACTION_CLIENT",
                note: summary
            },
            include: {
                user: { select: { id: true, name: true, role: true } }
            }
        });

        return NextResponse.json({
            success: true,
            satisfaction: satisfactionEntry
        });
    } catch (error: any) {
        console.error("Satisfaction submit error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


