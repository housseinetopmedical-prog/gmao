import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseWarrantyMonths(raw: unknown) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return null;
    const yearMatch = value.match(/(\d+)\s*(an|ans|annee|annees|année|années)/i);
    if (yearMatch) return Number(yearMatch[1]) * 12;
    const monthMatch = value.match(/(\d+)\s*(mois|month|months)/i);
    if (monthMatch) return Number(monthMatch[1]);
    const numberMatch = value.match(/\d+/);
    return numberMatch ? Number(numberMatch[0]) : null;
}

function calculateWarrantyLimitDate(shippingDate: unknown, warrantyLabel: unknown) {
    const normalizedShippingDate = String(shippingDate || "").trim();
    const months = parseWarrantyMonths(warrantyLabel);
    if (!normalizedShippingDate || !months) return null;
    const date = new Date(`${normalizedShippingDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

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

        const {
            articleCode,
            warrantyLabel,
            invoiceDate,
            shippingDate,
            magasinierNotes,
            magasinierId
        } = body;

        // Validate required fields
        if (!articleCode || !warrantyLabel || !invoiceDate || !shippingDate) {
            return NextResponse.json(
                { error: "Tous les champs sont obligatoires" },
                { status: 400 }
            );
        }

        // Fetch existing reclamation
        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            select: {
                id: true,
                status: true,
                checklist: true,
                ticket: {
                    select: {
                        id: true,
                        equipmentId: true
                    }
                }
            }
        });

        if (!reclamation) {
            return NextResponse.json(
                { error: "Demande introuvable" },
                { status: 404 }
            );
        }

        // Parse existing metadata
        const { metadata, sosAnswers } = parseChecklistPayload(reclamation.checklist);

        // Update merchandise info with exclusivity tracking
        const updatedMerchandiseInfo = {
            articleCode,
            warrantyLabel,
            invoiceDate,
            shippingDate,
            warrantyLimitDate: calculateWarrantyLimitDate(shippingDate, warrantyLabel),
            magasinierNotes: magasinierNotes || "",
            filledBy: "MAGASINIER",
            filledByUserId: magasinierId,
            filledAt: new Date().toISOString()
        };

        // Update metadata
        const updatedMetadata = {
            ...metadata,
            merchandiseInfo: updatedMerchandiseInfo
        };

        // Create updated checklist
        const updatedChecklistJson = stringifyChecklistPayload({
            sosAnswers: sosAnswers || {},
            metadata: updatedMetadata
        });

        // Update reclamation status and checklist
        const updated = await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                status: "READY_FOR_TECH_MANAGER_ASSIGNMENT",
                checklist: updatedChecklistJson
            },
            select: {
                id: true,
                status: true
            }
        });

        // Log to history
        try {
            if (!reclamation.ticket?.id || !reclamation.ticket?.equipmentId) {
                return NextResponse.json({
                    success: true,
                    message: "Informations marchandise enregistrées. Demande envoyée au responsable technique.",
                    reclamation: updated
                });
            }

            await prisma.sav_history.create({
                data: {
                    equipmentId: reclamation.ticket.equipmentId,
                    ticketId: reclamation.ticket.id,
                    action: "MERCHANDISE_INFO_COMPLETED",
                    note: `Informations marchandise renseignées par le magasinier : ${articleCode}, garantie : ${warrantyLabel}`,
                    userId: magasinierId
                }
            });
        } catch (historyError) {
            console.error("History logging error:", historyError);
            // Don't fail the request if history fails
        }

        return NextResponse.json({
            success: true,
            message: "Informations marchandise enregistrées. Demande envoyée au responsable technique.",
            reclamation: updated
        });
    } catch (error) {
        console.error("Magasinier review error:", error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : "Erreur serveur",
                details: process.env.NODE_ENV === "development" ? String(error) : undefined
            },
            { status: 500 }
        );
    }
}


