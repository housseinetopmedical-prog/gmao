import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { Prisma } from "@prisma/client";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";

type Decision = "TAKEN_IN_CHARGE" | "NOT_TAKEN_IN_CHARGE";
type QualificationDocument = {
    id?: string;
    url?: string;
    name: string;
    type?: string;
    size?: number;
};

function computeWarranty(blDate: Date | null, warrantyMonths: number | null) {
    if (!blDate || !warrantyMonths) return false;
    const end = new Date(blDate);
    end.setMonth(end.getMonth() + warrantyMonths);
    return new Date() <= end;
}

function yesNoLabel(value: boolean | null) {
    if (value === null) return "";
    return value ? "Oui" : "Non";
}

function normalizeDocuments(raw: unknown): QualificationDocument[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item) => item && typeof item === "object" && typeof (item as any).name === "string")
        .map((item) => ({
            id: typeof (item as any).id === "string" ? (item as any).id : undefined,
            url: typeof (item as any).url === "string" ? (item as any).url : undefined,
            name: String((item as any).name),
            type: typeof (item as any).type === "string" ? (item as any).type : undefined,
            size: typeof (item as any).size === "number" ? (item as any).size : undefined
        }));
}

function getUrgencyPriorityFromChecklist(rawChecklist: string | null | undefined): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (!rawChecklist || typeof rawChecklist !== "string") return "MEDIUM";
    try {
        const parsed = JSON.parse(rawChecklist);
        const metadata = parsed?.metadata;
        const urgency = String(metadata?.urgency || "").toUpperCase();
        if (urgency === "LOW" || urgency === "MEDIUM" || urgency === "HIGH" || urgency === "CRITICAL") {
            return urgency;
        }
    } catch {
        // fallback handled below
    }
    return "MEDIUM";
}

function getInterventionTypeLabel(value: string | null | undefined): string {
    const raw = String(value || "").toUpperCase();
    if (raw === "SITE" || raw === "SUR SITE") return "Sur site";
    if (raw === "WORKSHOP" || raw === "EN ATELIER") return "Atelier";
    return raw || "-";
}

function parseOptionalMysqlDate(raw: unknown, label: string) {
    if (raw === undefined || raw === null || raw === "") {
        return { value: null as Date | null, error: null as string | null };
    }

    const rawValue = String(raw).trim();
    const candidates = [rawValue, rawValue.replace(" ", "T")];
    const frMatch = rawValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (frMatch) {
        const [, d, m, y, hh, mm] = frMatch;
        candidates.unshift(
            `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh || "00").padStart(2, "0")}:${String(mm || "00").padStart(2, "0")}`
        );
    }

    for (const candidate of candidates) {
        const parsed = new Date(candidate);
        if (Number.isNaN(parsed.getTime())) continue;

        // MySQL DATETIME accepte une annee entre 1000 et 9999.
        const year = parsed.getFullYear();
        if (year < 1000 || year > 9999) continue;

        return { value: parsed, error: null as string | null };
    }

    // Date non reconnue: on ne bloque pas l'affectation.
    return { value: null as Date | null, error: null as string | null };
}

function getPublicErrorMessage(error: unknown) {
    if (error instanceof Prisma.PrismaClientValidationError) {
        return "Données invalides pour l'affectation du technicien.";
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        return "Erreur base de données pendant l'affectation.";
    }

    if (error instanceof Error) {
        if (error.message.includes("Invalid `prisma") || error.message.includes("data: {")) {
            return "Donnees invalides pour l'affectation du technicien.";
        }

        if (error.message.toLowerCase().includes("datetime")) {
            return "Date prevue invalide.";
        }
    }

    return "Erreur interne pendant l'affectation.";
}

async function createHistoryIfMissing(params: {
    ticketId: number;
    equipmentId: number;
    userId: number;
    action: string;
    note: string;
}) {
    const exists = await prisma.sav_history.findFirst({
        where: {
            ticketId: params.ticketId,
            action: params.action,
            note: params.note
        },
        select: { id: true }
    });

    if (exists) return;

    await prisma.sav_history.create({
        data: {
            ticketId: params.ticketId,
            equipmentId: params.equipmentId,
            userId: params.userId,
            action: params.action,
            note: params.note
        }
    });
}

export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id } = await params;
        const reclamationId = Number(id);
        if (Number.isNaN(reclamationId)) {
            return NextResponse.json({ error: "ID reclamation invalide" }, { status: 400 });
        }

        const body = await req.json();
        const decision: Decision = body.decision;
        const advId = body.advId ? Number(body.advId) : 1;
        const technicianId = body.technicianId ? Number(body.technicianId) : null;
        const rejectionReason = typeof body.rejectionReason === "string" ? body.rejectionReason.trim() : "";
        const plannedDateParsed = parseOptionalMysqlDate(body.plannedDate, "Date prevue");
        if (plannedDateParsed.error) {
            return NextResponse.json({ error: plannedDateParsed.error }, { status: 400 });
        }
        const plannedDate = plannedDateParsed.value;
        const agency = typeof body.agency === "string" ? body.agency.trim() : "";
        const qualificationMotive = typeof body.qualificationMotive === "string" ? body.qualificationMotive.trim() : "";
        const clientVisibleMessageRaw =
            typeof body.clientVisibleMessage === "string" ? body.clientVisibleMessage.trim() : "";
        const notifyTechnician = Boolean(body.notifyTechnician);
        const infoVerified = body.infoVerified === undefined ? null : Boolean(body.infoVerified);
        const outOfWarranty = body.outOfWarranty === undefined ? null : Boolean(body.outOfWarranty);
        const maintenanceContract =
            body.maintenanceContract === undefined
                ? body.contractChecked === undefined
                    ? null
                    : Boolean(body.contractChecked)
                : Boolean(body.maintenanceContract);
        const outOfWarrantyDocuments = normalizeDocuments(body.outOfWarrantyDocuments);
        const maintenanceContractDocuments = normalizeDocuments(body.maintenanceContractDocuments);

        if (!["TAKEN_IN_CHARGE", "NOT_TAKEN_IN_CHARGE"].includes(decision)) {
            return NextResponse.json({ error: "Decision invalide" }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Reclamation non trouvee" }, { status: 404 });
        }

        if (decision === "NOT_TAKEN_IN_CHARGE") {
            if (!rejectionReason) {
                return NextResponse.json({ error: "Motif refus obligatoire pour non prise en charge" }, { status: 400 });
            }

            const refusalClientMessage =
                clientVisibleMessageRaw ||
                `Votre reclamation n'a pas ete prise en charge. Motif: ${rejectionReason}.`;

            const refusalNote = [
                `Motif refus: ${rejectionReason}`,
                qualificationMotive ? `Motif panne: ${qualificationMotive}` : "",
                infoVerified === null ? "" : `Infos verifiees: ${yesNoLabel(infoVerified)}`,
                outOfWarranty === null ? "" : `Hors garantie: ${yesNoLabel(outOfWarranty)}`,
                maintenanceContract === null ? "" : `Contrat maintenance: ${yesNoLabel(maintenanceContract)}`,
                outOfWarrantyDocuments.length > 0 ? `Docs hors garantie: ${outOfWarrantyDocuments.length}` : "",
                maintenanceContractDocuments.length > 0 ? `Docs contrat maintenance: ${maintenanceContractDocuments.length}` : ""
            ]
                .filter(Boolean)
                .join(" | ");

            let updatedTicket = null;
            if (reclamation.ticketId) {
                updatedTicket = await prisma.ticket.update({
                    where: { id: reclamation.ticketId },
                    data: {
                        status: "CLOSED",
                        rejectionMotive: rejectionReason,
                        closedAt: new Date()
                    }
                });

                await prisma.sav_history.create({
                    data: {
                        equipmentId: updatedTicket.equipmentId,
                        ticketId: updatedTicket.id,
                        userId: advId,
                        action: "ADV_DECISION_REFUS",
                        note: refusalNote
                    }
                });

                await prisma.sav_history.create({
                    data: {
                        equipmentId: updatedTicket.equipmentId,
                        ticketId: updatedTicket.id,
                        userId: advId,
                        action: "CLIENT_NOTIFICATION",
                        note: refusalClientMessage
                    }
                });
            } else {
                const equipment = await prisma.equipment.findUnique({
                    where: { serialNumber: reclamation.serialNumber },
                    select: { id: true }
                });

                if (equipment) {
                    await prisma.sav_history.create({
                        data: {
                            equipmentId: equipment.id,
                            userId: advId,
                            action: "ADV_DECISION_REFUS",
                            note: refusalNote
                        }
                    });
                }
            }

            const updatedReclamation = await prisma.reclamation.update({
                where: { id: reclamationId },
                data: {
                    status: "NOT_TAKEN_IN_CHARGE",
                    techComment: refusalClientMessage
                },
                include: {
                    ticket: {
                        include: {
                            assignedTo: { select: { id: true, name: true } },
                            adv: { select: { id: true, name: true } }
                        }
                    }
                }
            });

            return NextResponse.json({
                success: true,
                decision,
                reclamation: updatedReclamation,
                clientVisibleMessage: refusalClientMessage
            });
        }

        if (!technicianId) {
            return NextResponse.json({ error: "Un technicien doit etre affecte" }, { status: 400 });
        }

        const technician = await prisma.user.findUnique({
            where: { id: technicianId },
            select: { id: true, role: true, name: true }
        });
        if (!technician || !["TECHNICIAN", "TECHNICIEN"].includes(technician.role)) {
            return NextResponse.json({ error: "Technicien invalide" }, { status: 400 });
        }

        const equipment = await ensureEquipmentForReclamation(reclamation);

        const computedWarranty = computeWarranty(equipment.blDate, equipment.warrantyMonths);
        const isUnderWarranty = outOfWarranty === true ? false : computedWarranty;
        // Le type d'intervention est choisi par le client (et non par ADV).
        const resolvedInterventionType = reclamation.interventionType || "SITE";
        const resolvedInterventionTypeLabel = getInterventionTypeLabel(resolvedInterventionType);
        const derivedPriority = getUrgencyPriorityFromChecklist(reclamation.checklist);
        const currentTicketPriority = String(reclamation.ticket?.priority || "").toUpperCase();
        const resolvedPriority =
            derivedPriority !== "MEDIUM"
                ? derivedPriority
                : currentTicketPriority === "LOW" || currentTicketPriority === "MEDIUM" || currentTicketPriority === "HIGH" || currentTicketPriority === "CRITICAL"
                  ? (currentTicketPriority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
                  : "MEDIUM";
        const resolvedSiteAddress = [equipment.location || "", agency ? `Agence: ${agency}` : ""].filter(Boolean).join(" | ") || null;

        if (!reclamation.ticketId) {
            await resetTicketAutoIncrementIfEmpty();
        }

        const ticket = reclamation.ticketId
            ? await prisma.ticket.update({
                  where: { id: reclamation.ticketId },
                  data: {
                      status: "DIAGNOSTIC",
                      priority: resolvedPriority,
                      advId,
                      assignedToId: technicianId,
                      rejectionMotive: null,
                      isUnderWarranty,
                      contactName: reclamation.customerName,
                      contactPhone: reclamation.phone,
                      siteAddress: resolvedSiteAddress,
                      interventionType: resolvedInterventionType,
                      estimatedEndDate: plannedDate
                  }
              })
            : await prisma.ticket.create({
                  data: {
                      title: "Ticket d'intervention",
                      description: reclamation.description,
                      priority: resolvedPriority,
                      status: "DIAGNOSTIC",
                      equipmentId: equipment.id,
                      creatorId: advId,
                      advId,
                      assignedToId: technicianId,
                      isUnderWarranty,
                      contactName: reclamation.customerName,
                      contactPhone: reclamation.phone,
                      siteAddress: resolvedSiteAddress,
                      interventionType: resolvedInterventionType,
                      estimatedEndDate: plannedDate
                  }
              });

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                status: "TAKEN_IN_CHARGE",
                ticketId: ticket.id
            }
        });

        await prisma.sav_history.create({
            data: {
                equipmentId: equipment.id,
                ticketId: ticket.id,
                userId: advId,
                action: "ADV_DECISION_TAKEN",
                note: [
                    `Technicien affecte: ${technician.name}`,
                    `Priorite: ${resolvedPriority}`,
                    resolvedInterventionType ? `Type intervention: ${resolvedInterventionTypeLabel}` : "",
                    plannedDate ? `Date prevue: ${plannedDate.toLocaleString()}` : "",
                    agency ? `Agence: ${agency}` : ""
                ]
                    .filter(Boolean)
                    .join(" | ")
            }
        });

        await prisma.sav_history.create({
            data: {
                equipmentId: equipment.id,
                ticketId: ticket.id,
                userId: advId,
                action: "CLIENT_NOTIFICATION",
                note:
                    clientVisibleMessageRaw ||
                    "Votre reclamation est prise en charge."
            }
        });

        const qualificationNote = [
            qualificationMotive ? `Motif panne: ${qualificationMotive}` : "",
            infoVerified === null ? "" : `Infos verifiees: ${yesNoLabel(infoVerified)}`,
            outOfWarranty === null ? "" : `Hors garantie: ${yesNoLabel(outOfWarranty)}`,
            maintenanceContract === null ? "" : `Contrat maintenance: ${yesNoLabel(maintenanceContract)}`
        ]
            .filter(Boolean)
            .join(" | ");

        if (qualificationNote) {
            await createHistoryIfMissing({
                ticketId: ticket.id,
                equipmentId: equipment.id,
                userId: advId,
                action: "ADV_QUALIFICATION",
                note: qualificationNote
            });
        }

        if (outOfWarrantyDocuments.length > 0 || maintenanceContractDocuments.length > 0) {
            const docsNote = JSON.stringify({
                outOfWarrantyDocuments,
                maintenanceContractDocuments
            });

            await createHistoryIfMissing({
                ticketId: ticket.id,
                equipmentId: equipment.id,
                userId: advId,
                action: "ADV_QUALIFICATION_DOCUMENTS",
                note: docsNote
            });
        }

        if (notifyTechnician) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: equipment.id,
                    ticketId: ticket.id,
                    userId: advId,
                    action: "ADV_NOTIFICATION_TECHNICIAN",
                    note: `Notification envoyee au technicien ${technician.name}`
                }
            });
        }

        await prisma.equipment.update({
            where: { id: equipment.id },
            data: { status: "DOWN_AT_CLIENT" }
        });

        const updatedReclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: {
                ticket: {
                    include: {
                        assignedTo: { select: { id: true, name: true } },
                        adv: { select: { id: true, name: true } }
                    }
                }
            }
        });

        return NextResponse.json({
            success: true,
            decision,
            ticketId: ticket.id,
            reclamation: updatedReclamation
        });
    } catch (error: unknown) {
        console.error("ADV decision error:", error);
        return NextResponse.json({ error: getPublicErrorMessage(error) }, { status: 500 });
    }
}


