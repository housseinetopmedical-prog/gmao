import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { executeKnownSchemaStatement } from "@/metier/sql-securise";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function ensureTicketAiColumns() {
    const statements = [
        "ALTER TABLE `tickets` ADD COLUMN `aiSummary` TEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiUrgency` VARCHAR(20) NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiProbableCauses` LONGTEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiSuggestedParts` LONGTEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiChecklist` LONGTEXT NULL"
    ];

    for (const statement of statements) {
        try {
            await executeKnownSchemaStatement(statement);
        } catch (error: any) {
            const message = String(error?.message || "").toLowerCase();
            if (!message.includes("duplicate") && !message.includes("already exists")) {
                throw error;
            }
        }
    }
}

async function persistTicketAiFields(ticketId: number, payload: {
    aiSummary?: unknown;
    aiUrgency?: unknown;
    aiProbableCauses?: unknown;
    aiSuggestedParts?: unknown;
    aiChecklist?: unknown;
}) {
    const aiSummary = String(payload.aiSummary || "").trim();
    if (!ticketId || !aiSummary) return;
    const aiProbableCauses = Array.isArray(payload.aiProbableCauses) ? JSON.stringify(payload.aiProbableCauses) : String(payload.aiProbableCauses || "").trim() || null;
    const aiSuggestedParts = Array.isArray(payload.aiSuggestedParts) ? JSON.stringify(payload.aiSuggestedParts) : String(payload.aiSuggestedParts || "").trim() || null;
    const aiChecklist = Array.isArray(payload.aiChecklist) ? JSON.stringify(payload.aiChecklist) : String(payload.aiChecklist || "").trim() || null;

    await ensureTicketAiColumns();
    await prisma.$executeRaw`
        UPDATE tickets
        SET aiSummary = ${aiSummary},
            aiUrgency = ${String(payload.aiUrgency || "").trim() || null},
            aiProbableCauses = ${aiProbableCauses},
            aiSuggestedParts = ${aiSuggestedParts},
            aiChecklist = ${aiChecklist}
        WHERE id = ${ticketId}
    `;
}

function stripClientAttachmentFromChecklist(rawChecklist: unknown) {
    if (!rawChecklist || typeof rawChecklist !== "string") return rawChecklist;

    try {
        const parsed = JSON.parse(rawChecklist);
        if (!parsed || typeof parsed !== "object") return rawChecklist;

        const metadata = (parsed as any).metadata;
        if (!metadata || typeof metadata !== "object" || !("attachments" in metadata)) {
            return rawChecklist;
        }

        const sanitized = {
            ...(parsed as Record<string, unknown>),
            metadata: {
                ...(metadata as Record<string, unknown>)
            }
        } as any;

        delete sanitized.metadata.attachments;
        return JSON.stringify(sanitized);
    } catch {
        return rawChecklist;
    }
}

function sanitizeTicketClientDocuments(ticket: any) {
    if (!ticket?.reclamation) return ticket;
    return {
        ...ticket,
        reclamation: {
            ...ticket.reclamation,
            attachmentUrl: null,
            checklist: stripClientAttachmentFromChecklist(ticket.reclamation.checklist)
        },
        savHistory: Array.isArray(ticket.savHistory)
            ? ticket.savHistory.filter((entry: any) => String(entry?.action || "") !== "ADV_QUALIFICATION_DOCUMENTS")
            : ticket.savHistory
    };
}

// GET /api/tickets - list tickets with relations
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status");
        const assignedToId = searchParams.get("assignedToId");
        const creatorId = searchParams.get("creatorId");
        const advId = searchParams.get("advId");
        const hideClientDocuments = searchParams.get("hideClientDocuments") === "1";
        const light = searchParams.get("light") === "1";
        const summary = searchParams.get("summary") === "1";

        const where: any = {};
        if (status && status !== "undefined" && status !== "null" && status.trim() !== "") {
            where.status = status;
        }
        if (assignedToId) where.assignedToId = Number(assignedToId);
        if (creatorId) where.creatorId = Number(creatorId);
        if (advId) where.advId = Number(advId);

        const query: any = {
            where,
            orderBy: { updatedAt: "desc" }
        };

        if (light) {
            query.select = {
                id: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                assignedToId: true,
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        type: true,
                        blNumber: true
                    }
                }
                ,reclamation: {
                    select: {
                        createdAt: true
                    }
                }
                ,savHistory: {
                    select: {
                        action: true,
                        createdAt: true,
                        note: true
                    },
                    orderBy: { createdAt: "desc" }
                }
            };
        } else if (summary) {
            query.select = {
                id: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                assignedToId: true,
                estimatedEndDate: true,
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        type: true,
                        blNumber: true
                    }
                },
                reclamation: {
                    select: {
                        createdAt: true
                    }
                },
                savHistory: {
                    select: {
                        action: true,
                        createdAt: true,
                        note: true
                    },
                    orderBy: { createdAt: "desc" }
                }
            };
        } else {
            query.include = {
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        code: true,
                        brand: true,
                        model: true,
                        client: true,
                        location: true,
                        blDate: true,
                        warrantyMonths: true,
                        agence: true
                    }
                },
                creator: { select: { id: true, name: true, role: true } },
                assignedTo: { select: { id: true, name: true, role: true } },
                adv: { select: { id: true, name: true, role: true } },
                reclamation: true,
                savHistory: {
                    select: {
                        action: true,
                        createdAt: true,
                        note: true
                    },
                    orderBy: { createdAt: "desc" }
                }
            };
        }

        const tickets = await prisma.ticket.findMany(query);

        const ticketsWithWarranty = tickets.map((ticket: any) => {
            if (light || summary) {
                return ticket;
            }

            let underWarranty = false;
            if (ticket.equipment.blDate && ticket.equipment.warrantyMonths) {
                const blDate = new Date(ticket.equipment.blDate);
                const warrantyEnd = new Date(blDate);
                warrantyEnd.setMonth(warrantyEnd.getMonth() + ticket.equipment.warrantyMonths);
                underWarranty = new Date(ticket.createdAt) <= warrantyEnd;
            }
            return { ...ticket, isUnderWarranty: underWarranty };
        });

        const responsePayload = hideClientDocuments && !summary && !light
            ? ticketsWithWarranty.map((ticket) => sanitizeTicketClientDocuments(ticket))
            : ticketsWithWarranty;
        const ticketReferences = await getTicketAnnualReferenceMap(responsePayload.map((ticket: any) => Number(ticket?.id || 0)));
        const responsePayloadWithDisplayIds = responsePayload.map((ticket: any) => attachTicketAnnualReference(ticket, ticketReferences));

        return NextResponse.json(responsePayloadWithDisplayIds, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (error: any) {
        console.error("DEBUG: Prisma error in /api/tickets:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST /api/tickets - create ticket
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const {
            title,
            description,
            priority,
            equipmentId,
            creatorId,
            assignedToId,
            advId,
            estimatedDuration,
            estimatedEndDate,
            isUnderWarranty,
            reclamationId,
            interventionType,
            aiSummary,
            aiUrgency,
            aiProbableCauses,
            aiSuggestedParts,
            aiChecklist
        } = body;

        const equipment = await prisma.equipment.findUnique({
            where: { id: Number(equipmentId) }
        });
        if (!equipment) {
            return NextResponse.json({ error: "Equipement non trouve" }, { status: 404 });
        }

        let warrantyAuto = isUnderWarranty ?? false;
        if (equipment.blDate && equipment.warrantyMonths) {
            const warrantyEnd = new Date(equipment.blDate);
            warrantyEnd.setMonth(warrantyEnd.getMonth() + equipment.warrantyMonths);
            warrantyAuto = new Date() <= warrantyEnd;
        }

        await resetTicketAutoIncrementIfEmpty();

        const ticket = await prisma.ticket.create({
            data: {
                title,
                description,
                priority: priority || "MEDIUM",
                status: "OPEN",
                equipmentId: Number(equipmentId),
                creatorId: Number(creatorId) || 1,
                assignedToId: assignedToId ? Number(assignedToId) : null,
                advId: advId ? Number(advId) : null,
                isUnderWarranty: warrantyAuto,
                estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null,
                estimatedEndDate: estimatedEndDate ? new Date(estimatedEndDate) : null,
                interventionType: interventionType || null
            },
            include: {
                equipment: true,
                creator: { select: { id: true, name: true } },
                assignedTo: { select: { id: true, name: true } }
            }
        });
        await persistTicketAiFields(ticket.id, { aiSummary, aiUrgency, aiProbableCauses, aiSuggestedParts, aiChecklist });

        await prisma.sav_history.create({
            data: {
                equipmentId: Number(equipmentId),
                ticketId: ticket.id,
                action: `Ticket cree: "${title}" - Priorite: ${priority || "MEDIUM"}`,
                userId: Number(creatorId) || 1
            }
        });

        await prisma.equipment.update({
            where: { id: Number(equipmentId) },
            data: { status: "DOWN_AT_CLIENT" }
        });

        if (reclamationId) {
            await prisma.reclamation.update({
                where: { id: Number(reclamationId) },
                data: {
                    ticketId: ticket.id,
                    status: "PROCESSED"
                }
            });
        }

        const ticketReference = await getTicketAnnualReferenceMap([ticket.id]);
        return NextResponse.json(attachTicketAnnualReference(ticket, ticketReference), { status: 201 });
    } catch (error: any) {
        console.error("Erreur creation ticket:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
