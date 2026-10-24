import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { Prisma } from "@prisma/client";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { wasClientUpdateRecordedAfterAssignment } from "@/metier/workflow-technicien";
import { isClientAttachmentExpired, parseChecklistPayload, shouldApplyRepairedTicketDocumentRetention, stringifyChecklistPayload } from "@/metier/workflow-client";
import { deleteClientAttachmentFiles, getExpiredClientAttachments } from "@/metier/nettoyage-pieces-jointes-client";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function parseOptionalMysqlDate(raw: unknown, label: string) {
    if (raw === undefined) {
        return { provided: false, value: null as Date | null, error: null as string | null };
    }

    if (raw === null || raw === "") {
        return { provided: true, value: null as Date | null, error: null as string | null };
    }

    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) {
        return { provided: true, value: null as Date | null, error: `${label} invalide.` };
    }

    const year = parsed.getFullYear();
    if (year < 1000 || year > 9999) {
        return { provided: true, value: null as Date | null, error: `${label} invalide.` };
    }

    return { provided: true, value: parsed, error: null as string | null };
}

function getPublicErrorMessage(error: unknown) {
    if (error instanceof Prisma.PrismaClientValidationError) {
        return "Données invalides pour la mise à jour du ticket.";
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return "Erreur base de données pendant la mise à jour du ticket.";
    }

    if (error instanceof Error) {
        if (error.message.includes("Invalid `prisma") || error.message.includes("data: {")) {
            return "Donnees invalides pour la mise a jour du ticket.";
        }
        if (error.message.toLowerCase().includes("datetime")) {
            return "Date prevue invalide.";
        }
    }

    return "Erreur interne pendant la mise a jour du ticket.";
}

function sanitizeExpiredClientDocuments(reclamation: { checklist?: string | null; attachmentUrl?: string | null; createdAt?: Date | string | null; updatedAt?: Date | string | null } | null | undefined) {
    if (!reclamation) return null;
    if (!shouldApplyRepairedTicketDocumentRetention(reclamation)) return null;
    const parsed = parseChecklistPayload(reclamation.checklist);
    const fallbackSentAt = String(reclamation.updatedAt || reclamation.createdAt || "").trim() || null;
    const currentAttachments = Array.isArray(parsed.metadata?.attachments) ? parsed.metadata.attachments : [];
    const expiredAttachments = getExpiredClientAttachments(currentAttachments, fallbackSentAt);
    if (reclamation.attachmentUrl && isClientAttachmentExpired(null, fallbackSentAt)) {
        expiredAttachments.push({ name: "Pièce jointe", dataUrl: reclamation.attachmentUrl });
    }

    const cleanedAttachments = currentAttachments.filter((attachment) => !isClientAttachmentExpired(attachment, fallbackSentAt));
    const nextAttachmentUrl = cleanedAttachments[0]?.dataUrl || (!isClientAttachmentExpired(null, fallbackSentAt) ? reclamation.attachmentUrl || null : null);

    if (cleanedAttachments.length === currentAttachments.length && nextAttachmentUrl === (reclamation.attachmentUrl || null)) {
        return null;
    }

    return {
        checklist: stringifyChecklistPayload({
            ...parsed,
            metadata: {
                ...(parsed.metadata || {}),
                attachments: cleanedAttachments.length > 0 ? cleanedAttachments : undefined
            }
        }),
        attachmentUrl: nextAttachmentUrl,
        expiredAttachments
    };
}

// GET /api/tickets/[id]
export async function GET(req: Request, context: any) {
    const params = await context.params;
    try {
        const { searchParams } = new URL(req.url);
        const hideClientDocuments = searchParams.get("hideClientDocuments") === "1";
        const { id } = await params;
        const ticket = await prisma.ticket.findUnique({
            where: { id: Number(id) },
            include: {
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        code: true,
                        client: true,
                        location: true,
                        blDate: true,
                        warrantyMonths: true,
                        brand: true,
                        model: true,
                        service: true,
                        agence: true,
                        blDocumentUrl: true,
                        invoiceUrl: true
                    }
                },
                creator: { select: { id: true, name: true, role: true } },
                assignedTo: { select: { id: true, name: true, role: true, phone: true } },
                adv: { select: { id: true, name: true, role: true } },
                reclamation: true,
                savHistory: {
                    include: { user: { select: { id: true, name: true, role: true } } },
                    orderBy: { createdAt: "desc" }
                }
            }
        });

        if (!ticket) {
            return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
        }

        const sanitizedDocuments = sanitizeExpiredClientDocuments(ticket.reclamation);
        if (sanitizedDocuments && ticket.reclamation?.id) {
            const { expiredAttachments, ...data } = sanitizedDocuments;
            await prisma.reclamation.update({
                where: { id: ticket.reclamation.id },
                data
            }).catch(() => null);
            await deleteClientAttachmentFiles(expiredAttachments);
            ticket.reclamation.checklist = data.checklist;
            ticket.reclamation.attachmentUrl = data.attachmentUrl;
        }

        let warrantyEnd: Date | null = null;
        let isUnderWarranty = ticket.isUnderWarranty;
        if (ticket.equipment.blDate && ticket.equipment.warrantyMonths) {
            warrantyEnd = new Date(ticket.equipment.blDate);
            warrantyEnd.setMonth(warrantyEnd.getMonth() + ticket.equipment.warrantyMonths);
            isUnderWarranty = new Date(ticket.createdAt) <= warrantyEnd;
        }
        const ticketReferences = await getTicketAnnualReferenceMap([Number(ticket.id)]);
        const payload = attachTicketAnnualReference({
            ...ticket,
            isUnderWarranty,
            warrantyEnd
        }, ticketReferences);
        return NextResponse.json(hideClientDocuments ? sanitizeTicketClientDocuments(payload) : payload, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT /api/tickets/[id]
export async function PUT(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id: ticketId } = await params;
        const body = await req.json();
        const {
            status,
            assignedToId,
            priority,
            interventionType,
            diagnosis,
            solution,
            actualDuration,
            estimatedEndDate,
            isUnderWarranty,
            sosChecklist,
            satisfactionRate,
            isHandledByTopMedical,
            rejectionMotive,
            progressNote,
            userId,
            finalOutcome
        } = body;

        const existing = await prisma.ticket.findUnique({
            where: { id: Number(ticketId) },
            include: {
                reclamation: {
                    select: {
                        id: true,
                        status: true,
                        checklist: true
                    }
                }
            }
        });
        if (!existing) {
            return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
        }

        const actingUserId = Number(userId || 0) || null;
        const actingUser = actingUserId
            ? await prisma.user.findUnique({
                  where: { id: actingUserId },
                  select: { id: true, role: true }
              })
            : null;
        const actingRole = String(actingUser?.role || "").toUpperCase();
        const normalizedWarrantyStatus = String(
            ((parseChecklistPayload(existing.reclamation?.checklist).metadata as any)?.merchandiseInfo?.warrantyStatus || "")
        ).trim().toUpperCase();
        const outOfWarrantyUnlockedStatuses = new Set(["QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE"]);
        const reclamationStatus = String(existing.reclamation?.status || "").toUpperCase();
        const historyForOutOfWarrantyCheck = await prisma.sav_history.findMany({
            where: { ticketId: existing.id },
            select: { action: true, createdAt: true },
            orderBy: { createdAt: "desc" }
        });
        const clientUpdatedAfterAssignment = wasClientUpdateRecordedAfterAssignment({ savHistory: historyForOutOfWarrantyCheck });
        const outOfWarrantyStatusLocked =
            ["TECHNICIAN", "RESPONSABLE_TECHNIQUE"].includes(actingRole)
            && normalizedWarrantyStatus === "OUT_OF_WARRANTY"
            && !outOfWarrantyUnlockedStatuses.has(reclamationStatus)
            && !clientUpdatedAfterAssignment;
        const hasTechnicalProgressPayload =
            (status !== undefined && status !== existing.status)
            || (typeof progressNote === "string" && progressNote.trim().length > 0)
            || diagnosis !== undefined
            || solution !== undefined
            || actualDuration !== undefined;

        if (outOfWarrantyStatusLocked && hasTechnicalProgressPayload) {
            return NextResponse.json(
                {
                    error: "Le statut est verrouillé jusqu'à la validation du devis client."
                },
                { status: 400 }
            );
        }

        const updateData: any = { updatedAt: new Date() };
        if (status !== undefined) updateData.status = status;
        if (assignedToId !== undefined) updateData.assignedToId = assignedToId ? Number(assignedToId) : null;
        if (priority !== undefined) updateData.priority = priority;
        if (interventionType !== undefined) updateData.interventionType = interventionType;
        if (diagnosis !== undefined) updateData.diagnosis = diagnosis;
        if (solution !== undefined) updateData.solution = solution;
        if (actualDuration !== undefined) updateData.actualDuration = Number(actualDuration);
        const estimatedEndDateParsed = parseOptionalMysqlDate(estimatedEndDate, "Date prevue");
        if (estimatedEndDateParsed.error) {
            return NextResponse.json({ error: estimatedEndDateParsed.error }, { status: 400 });
        }
        if (estimatedEndDateParsed.provided) updateData.estimatedEndDate = estimatedEndDateParsed.value;
        if (isUnderWarranty !== undefined) updateData.isUnderWarranty = isUnderWarranty;
        if (sosChecklist !== undefined) updateData.sosChecklist = sosChecklist;
        if (satisfactionRate !== undefined) updateData.satisfactionRate = Number(satisfactionRate);
        if (isHandledByTopMedical !== undefined) {
            updateData.isHandledByTopMedical = isHandledByTopMedical;
            if (isHandledByTopMedical) updateData.qualificationDate = new Date();
        }
        if (rejectionMotive !== undefined) updateData.rejectionMotive = rejectionMotive;
        if (status === "CLOSED") updateData.closedAt = new Date();

        const updated = await prisma.ticket.update({
            where: { id: Number(ticketId) },
            data: updateData,
            include: {
                equipment: true,
                assignedTo: { select: { id: true, name: true } }
            }
        });

        if (status && status !== existing.status) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: existing.equipmentId,
                    ticketId: existing.id,
                    action: `Status changed: ${existing.status} -> ${status}`,
                    note: progressNote || undefined,
                    userId: userId || existing.creatorId
                }
            });

            if (status === "CLOSED") {
                const equipmentStatus = finalOutcome === "NON_REPARE" ? "MAINTENANCE_REQUIRED" : "OPERATIONAL";
                await prisma.equipment.update({
                    where: { id: existing.equipmentId },
                    data: { status: equipmentStatus, lastMaintenance: new Date() }
                });
            } else if (["DIAGNOSTIC", "REPAIR", "QUALITY_TEST"].includes(status)) {
                await prisma.equipment.update({
                    where: { id: existing.equipmentId },
                    data: { status: "IN_WORKSHOP" }
                });
            }
        }

        if (progressNote && (!status || status === existing.status)) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: existing.equipmentId,
                    ticketId: existing.id,
                    action: "Progress update",
                    note: progressNote,
                    userId: userId || existing.creatorId
                }
            });
        }

        if (assignedToId !== undefined && Number(assignedToId || 0) !== Number(existing.assignedToId || 0)) {
            const assignedTech = assignedToId
                ? await prisma.user.findUnique({ where: { id: Number(assignedToId) }, select: { name: true } })
                : null;

            await prisma.sav_history.create({
                data: {
                    equipmentId: existing.equipmentId,
                    ticketId: existing.id,
                    action: assignedTech ? "Technician assignment updated" : "Technician assignment removed",
                    note: assignedTech ? `Assigned technician: ${assignedTech.name}` : undefined,
                    userId: userId || existing.creatorId
                }
            });
        }

        if (priority !== undefined && priority !== existing.priority) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: existing.equipmentId,
                    ticketId: existing.id,
                    action: "Priorité mise à jour",
                    note: `Priorité : ${existing.priority} -> ${priority}`,
                    userId: userId || existing.creatorId
                }
            });
        }

        if (interventionType !== undefined && interventionType !== existing.interventionType) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: existing.equipmentId,
                    ticketId: existing.id,
                    action: "Intervention type updated",
                    note: `Type intervention: ${existing.interventionType || "-"} -> ${interventionType || "-"}`,
                    userId: userId || existing.creatorId
                }
            });
        }

        const linkedReclamation = await prisma.reclamation.findUnique({
            where: { ticketId: existing.id },
            select: { id: true, status: true }
        });

        if (linkedReclamation) {
            const protectedReclamationStatuses = new Set([
                "DECISION_OUT_OF_WARRANTY",
                "PENDING_ADV_QUOTE",
                "QUOTE_SENT_TO_CLIENT",
                "QUOTE_APPROVED",
                "QUOTE_REJECTED",
                "NOT_TAKEN_IN_CHARGE"
            ]);

            if (
                updated.assignedToId &&
                linkedReclamation.status !== "TAKEN_IN_CHARGE" &&
                !protectedReclamationStatuses.has(String(linkedReclamation.status || ""))
            ) {
                await prisma.reclamation.update({
                    where: { id: linkedReclamation.id },
                    data: { status: "TAKEN_IN_CHARGE" }
                });
            }

            if (status === "DECISION" && rejectionMotive && linkedReclamation.status !== "NOT_TAKEN_IN_CHARGE") {
                await prisma.reclamation.update({
                    where: { id: linkedReclamation.id },
                    data: { status: "NOT_TAKEN_IN_CHARGE" }
                });
            }

            if (status === "CLOSED" && finalOutcome === "NON_REPARE") {
                await prisma.reclamation.update({
                    where: { id: linkedReclamation.id },
                    data: {
                        status: "TAKEN_IN_CHARGE",
                        techComment: "Intervention terminee: equipement non repare."
                    }
                });
            }
        }

        return NextResponse.json(updated);
    } catch (error: unknown) {
        return NextResponse.json({ error: getPublicErrorMessage(error) }, { status: 500 });
    }
}

// DELETE /api/tickets/[id]
export async function DELETE(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id } = await params;
        const ticketId = Number(id);

        await prisma.$transaction(async (tx) => {
            await tx.reclamation.updateMany({
                where: { ticketId },
                data: { ticketId: null }
            });

            await tx.purchase_item.updateMany({
                where: { ticketId },
                data: { ticketId: null }
            });

            await tx.stock_movement.updateMany({
                where: { ticketId },
                data: { ticketId: null }
            });

            await tx.ticket_interne.deleteMany({ where: { ticketId } });
            await tx.sav_history.deleteMany({ where: { ticketId } });
            await tx.ticket.delete({ where: { id: ticketId } });
        });

        await resetTicketAutoIncrementIfEmpty();
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
