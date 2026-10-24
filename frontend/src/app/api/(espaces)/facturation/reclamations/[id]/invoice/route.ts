import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

export async function POST(req: Request, context: any) {
    try {
        const params = await context.params;
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "Ticket invalide." }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const name = String(body?.name || "Facture").trim();
        const dataUrl = String(body?.dataUrl || "").trim();
        if (!dataUrl) {
            return NextResponse.json({ error: "Facture obligatoire." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            select: { checklist: true }
        });
        if (!reclamation) {
            return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
        }

        const checklist = parseChecklistPayload(reclamation.checklist);
        const updatedChecklist = stringifyChecklistPayload({
            ...checklist,
            metadata: {
                ...(checklist.metadata || {}),
                facturationInvoice: {
                    name,
                    dataUrl,
                    uploadedAt: new Date().toISOString()
                }
            }
        });

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: { checklist: updatedChecklist }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur pendant l'enregistrement de la facture." }, { status: 500 });
    }
}
