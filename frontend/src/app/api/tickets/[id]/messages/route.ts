import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

// POST /api/tickets/[id]/messages
export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id: ticketId } = await params;
        const body = await req.json();
        const { message, userId, action = "MESSAGE" } = body;
        const requestedAction = typeof action === "string" ? action : "MESSAGE";

        if (!message || !userId) {
            return NextResponse.json({ error: "Message ou utilisateur manquant." }, { status: 400 });
        }

        const [ticket, sender] = await Promise.all([
            prisma.ticket.findUnique({ where: { id: Number(ticketId) } }),
            prisma.user.findUnique({ where: { id: Number(userId) }, select: { id: true, role: true, name: true } })
        ]);

        if (!ticket) return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
        if (!sender) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });

        // Client can read comments in suivi but cannot reply.
        if (sender.role === "CLIENT") {
            return NextResponse.json(
                { error: "Client replies are disabled for technician comments" },
                { status: 403 }
            );
        }

        const allowedByRole: Record<string, string[]> = {
            TECHNICIAN: [
                "MESSAGE",
                "INTERVENTION_LOG",
                "TECHNICAL_REPORT",
                "PART_REQUEST",
                "URGENCY_LEVEL_LOCKED",
                "FINAL_OUTCOME_NON_REPARE"
            ],
            ADV: [
                "MESSAGE",
                "COMMENT_CLIENT",
                "INTERVENTION_LOG",
                "TECHNICAL_REPORT",
                "PART_REQUEST",
                "FINAL_OUTCOME_NON_REPARE",
                "CLIENT_UPDATE",
                "CLIENT_REMINDER",
                "CLIENT_NOTIFICATION",
                "CLIENT_SUMMARY_SENT",
                "SATISFACTION_REQUESTED",
                "REPORT_RECEIVED",
                "DOCUMENTS_VALIDATED",
                "INTERVENTION_VALIDATED",
                "ADMIN_CLOSURE_COMPLETED",
                "EXIT_REPAIR_SLIP_DOWNLOADED"
            ],
            ADMIN: [
                "MESSAGE",
                "COMMENT_CLIENT",
                "INTERVENTION_LOG",
                "TECHNICAL_REPORT",
                "PART_REQUEST",
                "FINAL_OUTCOME_NON_REPARE",
                "CLIENT_UPDATE",
                "CLIENT_REMINDER",
                "CLIENT_NOTIFICATION",
                "CLIENT_SUMMARY_SENT",
                "SATISFACTION_REQUESTED",
                "REPORT_RECEIVED",
                "DOCUMENTS_VALIDATED",
                "INTERVENTION_VALIDATED",
                "ADMIN_CLOSURE_COMPLETED",
                "EXIT_REPAIR_SLIP_DOWNLOADED"
            ],
            RESPONSABLE_FACTURATION: [
                "MESSAGE",
                "EXIT_REPAIR_SLIP_DOWNLOADED"
            ],
            RESPONSABLE_TECHNIQUE: [
                "MESSAGE",
                "COMMENT_CLIENT",
                "INTERVENTION_LOG",
                "URGENCY_LEVEL_LOCKED",
                "FINAL_OUTCOME_NON_REPARE",
                "CLIENT_NOTIFICATION",
                "CLIENT_REMINDER"
            ],
            MAGASINIER: ["MESSAGE", "PART_REQUEST"],
            ACHATS: ["MESSAGE", "PART_REQUEST"]
        };

        const allowedActions = allowedByRole[sender.role] || ["MESSAGE"];
        if (!allowedActions.includes(requestedAction)) {
            return NextResponse.json(
                { error: `Action ${requestedAction} non autorisée pour le rôle ${sender.role}.` },
                { status: 403 }
            );
        }

        const savedMessage = await prisma.sav_history.create({
            data: {
                ticketId: ticket.id,
                equipmentId: ticket.equipmentId,
                userId: Number(userId),
                action: requestedAction,
                note: message
            },
            include: {
                user: { select: { id: true, name: true, role: true } }
            }
        });

        return NextResponse.json(savedMessage);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


