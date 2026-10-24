import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";

type ReviewDecision = "ASSIGN_TECHNICIAN";

function resolveWarrantyStatus(rawStatus: unknown, rawLabel: unknown, rawNote: unknown) {
    const normalizedStatus = String(rawStatus || "").trim().toUpperCase();
    if (normalizedStatus === "UNDER_WARRANTY" || normalizedStatus === "OUT_OF_WARRANTY") {
        return normalizedStatus;
    }

    const mergedText = [rawLabel, rawNote]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
        .join(" ");

    if (mergedText.includes("hors garantie") || mergedText.includes("out of warranty")) {
        return "OUT_OF_WARRANTY";
    }

    if (mergedText.includes("sous garantie") || mergedText.includes("under warranty")) {
        return "UNDER_WARRANTY";
    }

    return "";
}

function normalizeDecision(raw: unknown): ReviewDecision | null {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "UNDER_WARRANTY" || value === "OUT_OF_WARRANTY" || value === "ASSIGN_TECHNICIAN") return "ASSIGN_TECHNICIAN";
    return null;
}

function resolveWarrantyStatusFromHistory(rows: Array<{ note?: string | null }>) {
    for (const row of rows) {
        const status = resolveWarrantyStatus("", "", row.note);
        if (status === "UNDER_WARRANTY" || status === "OUT_OF_WARRANTY") return status;
    }
    return "";
}

function hasConfirmedQuoteApproval(rows: Array<{ action?: string | null }>, checklistPayload: any) {
    const hasApprovalHistory = rows.some((row) => {
        const action = String(row?.action || "").trim().toUpperCase();
        return action === "CLIENT_QUOTE_APPROVED" || action === "QUOTE_CLIENT_APPROVED";
    });
    if (hasApprovalHistory) return true;

    const quote = checklistPayload?.metadata?.quote || {};
    const quoteStatus = String(quote?.status || "").trim().toUpperCase();
    return quoteStatus === "APPROVED"
        && String(quote?.sentAt || "").trim().length > 0
        && String(quote?.clientDecisionAt || "").trim().length > 0;
}

async function ensureTicketForReclamation(reclamationId: number, userId: number) {
    const reclamation = await prisma.reclamation.findUnique({
        where: { id: reclamationId },
        include: {
            ticket: true
        }
    });

    if (!reclamation) return null;
    if (reclamation.ticket) return { reclamation, ticket: reclamation.ticket };

    const equipment = await ensureEquipmentForReclamation(reclamation);

    await resetTicketAutoIncrementIfEmpty();

    const createdTicket = await prisma.ticket.create({
        data: {
            title: `Demande d'intervention : ${reclamation.customerName}`,
            description: reclamation.description,
            priority: "MEDIUM",
            status: "QUALIFICATION",
            equipmentId: equipment.id,
            creatorId: userId,
            advId: userId,
            assignedToId: null,
            contactName: reclamation.customerName,
            contactPhone: reclamation.phone,
            interventionType: reclamation.interventionType || "SITE"
        }
    });

    const updatedReclamation = await prisma.reclamation.update({
        where: { id: reclamation.id },
        data: { ticketId: createdTicket.id }
    });

    return { reclamation: updatedReclamation, ticket: createdTicket };
}

export async function POST(req: Request, context: any) {
    const params = await context.params;

    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) {
            return NextResponse.json({ error: "ID demande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const userId = Number(body?.userId);
        const decision = normalizeDecision(body?.decision);
        const technicianId = Number(body?.technicianId || 0) || null;
        const managerNote = String(body?.managerNote || "").trim();
        const warrantyStatusOverride = String(body?.warrantyStatus || "").trim().toUpperCase();

        if (!userId) {
            return NextResponse.json({ error: "Utilisateur responsable technique requis." }, { status: 400 });
        }

        if (!decision) {
            return NextResponse.json({ error: "Décision garantie invalide." }, { status: 400 });
        }

        const ensured = await ensureTicketForReclamation(reclamationId, userId);
        if (!ensured) {
            return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
        }

        const { reclamation, ticket } = ensured;
        const checklistPayload = parseChecklistPayload(reclamation.checklist);
        const merchandiseInfo = ((checklistPayload.metadata as any)?.merchandiseInfo || {}) as Record<string, unknown>;
        const storeReview = ((checklistPayload.metadata as any)?.storeReview || {}) as Record<string, unknown>;
        const technicalManagerReview = ((checklistPayload.metadata as any)?.technicalManagerReview || {}) as Record<string, unknown>;
        let normalizedWarrantyStatus = resolveWarrantyStatus(
            warrantyStatusOverride || merchandiseInfo.warrantyStatus || technicalManagerReview.decision,
            [merchandiseInfo.warrantyLabel, storeReview.warrantyLabel].filter(Boolean).join(" "),
            [merchandiseInfo.magasinierNotes, storeReview.note].filter(Boolean).join(" ")
        );
        if (normalizedWarrantyStatus !== "UNDER_WARRANTY" && normalizedWarrantyStatus !== "OUT_OF_WARRANTY") {
            const qualificationHistory = await prisma.sav_history.findMany({
                where: {
                    ticketId: ticket.id,
                    action: "ADV_QUALIFICATION"
                },
                select: { note: true },
                orderBy: { createdAt: "desc" },
                take: 5
            });
            normalizedWarrantyStatus = resolveWarrantyStatusFromHistory(qualificationHistory);
        }
        if (normalizedWarrantyStatus !== "UNDER_WARRANTY" && normalizedWarrantyStatus !== "OUT_OF_WARRANTY") {
            return NextResponse.json({ error: "Statut de garantie obligatoire avant affectation technique." }, { status: 400 });
        }
        const quoteHistory = await prisma.sav_history.findMany({
            where: {
                ticketId: ticket.id,
                action: {
                    in: ["ADV_QUOTE_SENT", "CLIENT_QUOTE_APPROVED", "QUOTE_CLIENT_APPROVED"]
                }
            },
            select: { action: true },
            orderBy: { createdAt: "asc" }
        });
        const quoteWasApproved = hasConfirmedQuoteApproval(quoteHistory, checklistPayload);
        const isOutOfWarranty = normalizedWarrantyStatus === "OUT_OF_WARRANTY";
        const isPostQuoteApproval = ["QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT"].includes(
            String(reclamation.status || "").toUpperCase()
        );
        const nextTechnicalManagerReview = {
            decision: normalizedWarrantyStatus || null,
            managerNote: managerNote || null,
            reviewedAt: new Date().toISOString(),
            reviewedByUserId: userId
        };

        if (!technicianId) {
            return NextResponse.json({ error: "Technicien requis pour affectation." }, { status: 400 });
        }

        const technician = await prisma.user.findUnique({
            where: { id: technicianId },
            select: { id: true, role: true, name: true }
        });
        if (!technician || !["TECHNICIAN", "RESPONSABLE_TECHNIQUE"].includes(String(technician.role || ""))) {
            return NextResponse.json({ error: "Technicien ou responsable technique invalide." }, { status: 400 });
        }

        const [updatedTicket, updatedReclamation] = await prisma.$transaction([
            prisma.ticket.update({
                where: { id: ticket.id },
                data: {
                    assignedToId: technicianId,
                    status: "DIAGNOSTIC"
                }
            }),
            prisma.reclamation.update({
                where: { id: reclamationId },
                data: {
                    status: isPostQuoteApproval || !isOutOfWarranty ? "TAKEN_IN_CHARGE" : "DECISION_OUT_OF_WARRANTY",
                    checklist: stringifyChecklistPayload({
                        ...checklistPayload,
                        metadata: {
                            ...(checklistPayload.metadata || {}),
                            technicalManagerReview: nextTechnicalManagerReview,
                            merchandiseInfo: {
                                ...merchandiseInfo,
                                warrantyStatus: normalizedWarrantyStatus
                            }
                        }
                    })
                }
            })
        ]);

        await prisma.sav_history.createMany({
            data: [
                {
                    ticketId: ticket.id,
                    equipmentId: ticket.equipmentId,
                    userId,
                    action: quoteWasApproved ? "TECH_MANAGER_ASSIGNMENT_AFTER_QUOTE" : "TECH_MANAGER_ASSIGNMENT",
                    note: managerNote || (quoteWasApproved
                        ? "Devis client validé : ticket repris en charge SAV et affecté au technicien."
                        : isOutOfWarranty
                            ? "Ticket hors garantie affecté au technicien pour diagnostic avant devis ADV."
                            : "Ticket sous garantie affecté au technicien.")
                },
                {
                    ticketId: ticket.id,
                    equipmentId: ticket.equipmentId,
                    userId,
                    action: quoteWasApproved
                        ? "TECH_MANAGER_POST_QUOTE_ASSIGNMENT"
                        : isOutOfWarranty
                            ? "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
                            : "TECH_MANAGER_UNDER_WARRANTY_ASSIGNMENT",
                    note: `Technicien affecté : ${technician.name}`
                }
            ]
        });

        return NextResponse.json({
            success: true,
            decision,
            ticket: updatedTicket,
            reclamation: updatedReclamation
        });
    } catch (error: any) {
        console.error("Technical manager review error:", error);
        return NextResponse.json({ error: error?.message || "Erreur interne responsable technique." }, { status: 500 });
    }
}


