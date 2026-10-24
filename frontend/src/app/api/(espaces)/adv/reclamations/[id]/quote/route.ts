import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

type QuoteDocument = {
    id?: string;
    url?: string;
    name?: string;
    type?: string;
    title?: string;
};

function normalizeDocuments(raw: unknown) {
    if (!Array.isArray(raw)) return [] as Array<{ id?: string; dataUrl: string; name: string; type?: string; title?: string }>;

    return raw
        .filter((item): item is QuoteDocument => Boolean(item && typeof item === "object"))
        .map((item) => ({
            id: typeof item.id === "string" ? item.id : undefined,
            dataUrl: typeof item.url === "string" ? item.url.trim() : "",
            name: String(item.name || "Devis"),
            type: typeof item.type === "string" ? item.type : undefined,
            title: "Devis"
        }))
        .filter((item) => item.dataUrl.length > 0);
}

export async function POST(req: Request, context: any) {
    const params = await context.params;

    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID demande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const advId = Number(body?.advId);
        const sageQuoteNumber = String(body?.sageQuoteNumber || "").trim();
        const documents = normalizeDocuments(body?.quoteDocuments);

        if (!advId) {
            return NextResponse.json({ error: "ADV requis pour envoyer le devis." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation || !reclamation.ticket) {
            return NextResponse.json({ error: "Demande ou ticket introuvable." }, { status: 404 });
        }

        const checklistPayload = parseChecklistPayload(reclamation.checklist);
        const nextQuote = {
            amount: null,
            comment: null,
            sageNumber: sageQuoteNumber || null,
            delay: null,
            documents,
            status: "SENT_TO_CLIENT",
            sentAt: new Date().toISOString(),
            sentByUserId: advId
        };

        const updatedReclamation = await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                status: "QUOTE_SENT_TO_CLIENT",
                checklist: stringifyChecklistPayload({
                    ...checklistPayload,
                    metadata: {
                        ...(checklistPayload.metadata || {}),
                        quote: nextQuote
                    }
                })
            }
        });

        const historyNote = [
            `Devis envoyé au client`,
            sageQuoteNumber ? `N° devis Sage: ${sageQuoteNumber}` : "",
            documents.length > 0 ? `Documents devis: ${documents.length}` : ""
        ]
            .filter(Boolean)
            .join(" | ");

        await prisma.sav_history.createMany({
            data: [
                {
                    ticketId: reclamation.ticket.id,
                    equipmentId: reclamation.ticket.equipmentId,
                    userId: advId,
                    action: "ADV_QUOTE_SENT",
                    note: historyNote
                },
                {
                    ticketId: reclamation.ticket.id,
                    equipmentId: reclamation.ticket.equipmentId,
                    userId: advId,
                    action: "CLIENT_NOTIFICATION",
                    note: "Un devis est disponible dans votre suivi client."
                }
            ]
        });

        return NextResponse.json({
            success: true,
            reclamation: updatedReclamation
        });
    } catch (error: any) {
        console.error("ADV quote send error:", error);
        return NextResponse.json({ error: error?.message || "Erreur interne devis." }, { status: 500 });
    }
}



