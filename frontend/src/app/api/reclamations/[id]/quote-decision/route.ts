import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

type QuoteDecision = "APPROVE" | "REJECT";

function normalizeDecision(raw: unknown): QuoteDecision | null {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "APPROVE") return "APPROVE";
    if (value === "REJECT") return "REJECT";
    return null;
}

export async function POST(req: Request, context: any) {
    const params = await context.params;

    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID demande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const decision = normalizeDecision(body?.decision);
        const userId = Number(body?.userId || 0) || null;
        const clientComment = String(body?.comment || "").trim();

        if (!decision) {
            return NextResponse.json({ error: "Décision devis invalide." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation || !reclamation.ticket) {
            return NextResponse.json({ error: "Demande ou ticket introuvable." }, { status: 404 });
        }

        const ticket = reclamation.ticket;

        const checklistPayload = parseChecklistPayload(reclamation.checklist);
        const quoteMetadata =
            checklistPayload.metadata && typeof checklistPayload.metadata === "object" && (checklistPayload.metadata as any).quote
                ? { ...((checklistPayload.metadata as any).quote as Record<string, unknown>) }
                : {};

        const decisionStatus = decision === "APPROVE" ? "CLIENT_APPROVED" : "CLIENT_REJECTED";
        const nextStatus = decision === "APPROVE" ? "TAKEN_IN_CHARGE" : "QUOTE_REJECTED";

        const decisionAt = new Date();
        const updatedChecklist = stringifyChecklistPayload({
            ...checklistPayload,
            metadata: {
                ...(checklistPayload.metadata || {}),
                quote: {
                    ...quoteMetadata,
                    status: decisionStatus,
                    clientComment: clientComment || null,
                    clientDecisionAt: decisionAt.toISOString()
                }
            }
        });

        const updatedReclamation = await prisma.$transaction(async (tx) => {
            const savedReclamation = await tx.reclamation.update({
                where: { id: reclamationId },
                data: {
                    status: nextStatus,
                    checklist: updatedChecklist
                }
            });

            await tx.sav_history.create({
                data: {
                    ticketId: ticket.id,
                    equipmentId: ticket.equipmentId,
                    userId: userId || ticket.creatorId,
                    action: decision === "APPROVE" ? "CLIENT_QUOTE_APPROVED" : "CLIENT_QUOTE_REJECTED",
                    note: clientComment || (decision === "APPROVE" ? "Le client a validé le devis." : "Le client a refusé le devis.")
                }
            });

            if (decision === "APPROVE") {
                await tx.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        status: "DIAGNOSTIC",
                        updatedAt: decisionAt
                    }
                });

                await tx.sav_history.create({
                    data: {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: userId || ticket.creatorId,
                        action: "ADV_DECISION_TAKEN",
                        note: "Devis valide par le client: ticket repris en charge automatiquement et maintenu en diagnostic."
                    }
                });
            }

            if (decision === "REJECT") {
                await tx.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        status: "CLOSED",
                        closedAt: decisionAt,
                        updatedAt: decisionAt
                    }
                });

                await tx.sav_history.create({
                    data: {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: userId || ticket.creatorId,
                        action: "QUOTE_REJECTION_AUTO_CLOSED",
                        note: "Ticket clôturé automatiquement après refus du devis par le client."
                    }
                });
            }

            return savedReclamation;
        });

        return NextResponse.json({
            success: true,
            message: decision === "APPROVE"
                ? "Devis valide. Le ticket est repris en charge automatiquement par le SAV."
                : "Refus enregistré. Le ticket a été clôturé automatiquement.",
            reclamation: updatedReclamation
        });
    } catch (error: any) {
        console.error("Client quote decision error:", error);
        return NextResponse.json({ error: error?.message || "Erreur décision devis." }, { status: 500 });
    }
}



