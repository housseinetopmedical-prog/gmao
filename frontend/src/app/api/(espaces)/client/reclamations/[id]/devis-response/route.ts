import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
    req: Request,
    context: any
) {
    const params = await context.params;
    try {
        const { id } = await params;
        const reclamationId = Number(id);

        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID valide requis" }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const { decision, clientId, clientNote } = body;

        if (decision !== "QUOTE_APPROVED" && decision !== "QUOTE_REJECTED") {
            return NextResponse.json(
                { error: "Decision invalide: QUOTE_APPROVED ou QUOTE_REJECTED requis" },
                { status: 400 }
            );
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation || !reclamation.ticket) {
            return NextResponse.json(
                { error: "Demande ou ticket introuvable" },
                { status: 404 }
            );
        }

        const ticket = reclamation.ticket;
        const { metadata, sosAnswers } = parseChecklistPayload(reclamation.checklist);

        const updatedMetadata = {
            ...metadata,
            quote: {
                ...((metadata as any)?.quote || {}),
                clientDecision: decision,
                clientDecisionAt: new Date().toISOString(),
                clientNote: clientNote || ""
            }
        };

        let newStatus = reclamation.status;
        if (decision === "QUOTE_APPROVED") {
            newStatus = "TAKEN_IN_CHARGE";
        } else if (decision === "QUOTE_REJECTED") {
            newStatus = "QUOTE_REJECTED";
        }

        const updatedChecklistJson = stringifyChecklistPayload({
            sosAnswers: sosAnswers || {},
            metadata: updatedMetadata
        });

        const decisionAt = new Date();

        const updated = await prisma.$transaction(async (tx) => {
            const savedReclamation = await tx.reclamation.update({
                where: { id: reclamationId },
                data: {
                    status: newStatus,
                    checklist: updatedChecklistJson
                },
                select: {
                    id: true,
                    status: true
                }
            });

            const actionLabel = decision === "QUOTE_APPROVED"
                ? "CLIENT_QUOTE_APPROVED"
                : "CLIENT_QUOTE_REJECTED";

            await tx.sav_history.create({
                data: {
                    equipmentId: ticket.equipmentId,
                    ticketId: ticket.id,
                    action: actionLabel,
                    note: decision === "QUOTE_APPROVED"
                        ? "Client a valide le devis"
                        : "Client a refuse le devis",
                    userId: clientId || ticket.creatorId
                }
            });

            if (decision === "QUOTE_APPROVED") {
                await tx.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        status: "DIAGNOSTIC",
                        updatedAt: decisionAt
                    }
                });

                await tx.sav_history.create({
                    data: {
                        equipmentId: ticket.equipmentId,
                        ticketId: ticket.id,
                        action: "ADV_DECISION_TAKEN",
                        note: "Devis valide par le client: ticket repris en charge automatiquement et maintenu en diagnostic.",
                        userId: clientId || ticket.creatorId
                    }
                });
            }

            if (decision === "QUOTE_REJECTED") {
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
                        equipmentId: ticket.equipmentId,
                        ticketId: ticket.id,
                        action: "QUOTE_REJECTION_AUTO_CLOSED",
                        note: "Ticket clôturé automatiquement après refus du devis par le client.",
                        userId: clientId || ticket.creatorId
                    }
                });
            }

            return savedReclamation;
        });

        return NextResponse.json({
            success: true,
            message: decision === "QUOTE_APPROVED"
                ? "Devis valide. Le ticket est repris en charge automatiquement par le SAV."
                : "Refus enregistré. Le ticket a été clôturé automatiquement.",
            reclamation: updated
        });
    } catch (error) {
        console.error("Client devis response error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Erreur serveur",
                details: process.env.NODE_ENV === "development" ? String(error) : undefined
            },
            { status: 500 }
        );
    }
}


