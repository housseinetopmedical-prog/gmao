import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { sendSatisfactionRequestEmail } from "@/metier/emails";

function hasNonRepareOutcome(history: Array<{ action?: string | null }> | null | undefined) {
    return Array.isArray(history)
        && history.some((entry) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

function hasAdministrativeClosure(history: Array<{ action?: string | null }> | null | undefined) {
    return Array.isArray(history)
        && history.some((entry) => {
            const action = String(entry?.action || "");
            return action === "SATISFACTION_REQUESTED" || action === "INTERVENTION_VALIDATED" || action === "ADMIN_CLOSURE_COMPLETED";
        });
}

export async function POST(req: Request, context: any) {
    const params = await context.params;

    try {
        const ticketId = Number(params?.id);
        if (!Number.isFinite(ticketId) || ticketId <= 0) {
            return NextResponse.json({ error: "Ticket invalide." }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const advUserId = Number(body?.userId);
        if (!Number.isFinite(advUserId) || advUserId <= 0) {
            return NextResponse.json({ error: "Utilisateur ADV invalide." }, { status: 400 });
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                savHistory: {
                    select: { action: true },
                    orderBy: { createdAt: "asc" }
                },
                reclamation: {
                    select: {
                        id: true,
                        customerName: true,
                        contactEmail: true
                    }
                }
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
        }

        if (!ticket.reclamation) {
            return NextResponse.json({ error: "Réclamation liée introuvable." }, { status: 400 });
        }

        if (hasAdministrativeClosure(ticket.savHistory)) {
            return NextResponse.json({
                success: true,
                alreadyClosed: true,
                emailSent: false,
                emailError: null,
                message: "La clôture ADV a déjà été enregistrée pour ce ticket."
            });
        }

        const nonRepare = hasNonRepareOutcome(ticket.savHistory);
        const canAdministrativelyClose = ticket.status === "READY_FOR_DELIVERY" || (ticket.status === "CLOSED" && nonRepare);

        if (!canAdministrativelyClose) {
            return NextResponse.json(
                { error: "Ce ticket n'est pas dans un état clôturable par l'ADV." },
                { status: 400 }
            );
        }

        const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const normalizedOrigin = origin.replace(/\/$/, "");
        const loginUrl = `${normalizedOrigin}/login`;
        const trackingUrl = `${normalizedOrigin}/client/suivi`;
        const contactEmail = String(ticket.reclamation.contactEmail || "").trim().toLowerCase();
        const customerName = String(ticket.reclamation.customerName || "Client").trim() || "Client";

        await prisma.$transaction(async (tx) => {
            if (ticket.status !== "CLOSED") {
                await tx.ticket.update({
                    where: { id: ticket.id },
                    data: {
                        status: "CLOSED",
                        closedAt: new Date(),
                        updatedAt: new Date()
                    }
                });

                await tx.sav_history.create({
                    data: {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: advUserId,
                        action: `Status changed: ${ticket.status} -> CLOSED`,
                        note: ""
                    }
                });

                await tx.equipment.update({
                    where: { id: ticket.equipmentId },
                    data: {
                        status: nonRepare ? "MAINTENANCE_REQUIRED" : "OPERATIONAL",
                        lastMaintenance: new Date()
                    }
                }).catch(() => null);
            }

            await tx.sav_history.createMany({
                data: [
                    {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: advUserId,
                        action: "SATISFACTION_REQUESTED",
                        note: "Demande de satisfaction envoyée automatiquement au client."
                    },
                    {
                        ticketId: ticket.id,
                        equipmentId: ticket.equipmentId,
                        userId: advUserId,
                        action: "ADMIN_CLOSURE_COMPLETED",
                        note: ""
                    }
                ]
            });
        });

        let emailSent = false;
        let emailError: string | null = null;

        if (contactEmail) {
            try {
                await sendSatisfactionRequestEmail({
                    to: contactEmail,
                    name: customerName,
                    reclamationId: ticket.reclamation.id,
                    loginUrl,
                    trackingUrl
                });
                emailSent = true;
            } catch (error: any) {
                emailError = error?.message || "E-mail de satisfaction non envoyé.";
            }
        } else {
            emailError = "Aucun e-mail client disponible pour envoyer la demande de satisfaction.";
        }

        return NextResponse.json({
            success: true,
            alreadyClosed: false,
            emailSent,
            emailError,
            message: emailSent
                ? "Ticket clôturé et demande de satisfaction envoyée au client."
                : "Ticket clôturé. La demande de satisfaction est disponible côté client, mais l'e-mail n'a pas pu être envoyé."
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur lors de la clôture ADV." }, { status: 500 });
    }
}


