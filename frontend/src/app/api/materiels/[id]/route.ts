import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

const ARCHIVE_EQUIPMENT_SERIAL = "ARCHIVE-EQUIPMENT-SN";

async function ensureArchiveEquipment(tx: any) {
    const existing = await tx.equipment.findUnique({
        where: { serialNumber: ARCHIVE_EQUIPMENT_SERIAL }
    });
    if (existing) return existing;

    return tx.equipment.create({
        data: {
            name: "Equipement archive",
            type: "ARCHIVE",
            brand: "SYSTEM",
            model: "Archive",
            serialNumber: ARCHIVE_EQUIPMENT_SERIAL,
            location: "Archive",
            status: "RETIRED",
            client: "SYSTEM",
            service: "Archive",
            code: "ARCHIVE-EQ"
        }
    });
}

// GET /api/equipments/[id]
export async function GET(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id } = await params;
        const equipment = await prisma.equipment.findUnique({
            where: { id: Number(id) },
            include: {
                tickets: {
                    include: { assignedTo: { select: { name: true } }, creator: { select: { name: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 10
                },
                savHistory: {
                    include: { user: { select: { name: true, role: true } } },
                    orderBy: { createdAt: "desc" },
                    take: 20
                },
                documents: {
                    include: { user: { select: { name: true } } },
                    orderBy: { uploadedAt: "desc" }
                },
                maintenances: {
                    orderBy: { scheduledDate: "desc" },
                    take: 5
                }
            }
        });

        if (!equipment) return NextResponse.json({ error: "Equipement non trouve" }, { status: 404 });

        let warrantyEnd: Date | null = null;
        let warrantyStatus: "ACTIVE" | "EXPIRED" | "NONE" = "NONE";
        let warrantyDaysLeft: number | null = null;

        if (equipment.blDate && equipment.warrantyMonths) {
            warrantyEnd = new Date(equipment.blDate);
            warrantyEnd.setMonth(warrantyEnd.getMonth() + equipment.warrantyMonths);
            const now = new Date();
            if (warrantyEnd > now) {
                warrantyStatus = "ACTIVE";
                warrantyDaysLeft = Math.ceil((warrantyEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            } else {
                warrantyStatus = "EXPIRED";
            }
        }

        return NextResponse.json({ ...equipment, warrantyEnd, warrantyStatus, warrantyDaysLeft });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PUT /api/equipments/[id]
export async function PUT(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id } = await params;
        const body = await req.json();
        const {
            name, type, brand, model, serialNumber, code,
            client, location, service, status, criticality,
            purchaseDate, blDate, warrantyMonths, agence,
            blNumber, blDocumentUrl, invoiceUrl, userId
        } = body;

        const updated = await prisma.equipment.update({
            where: { id: Number(id) },
            data: {
                ...(name && { name }),
                ...(type && { type }),
                ...(brand && { brand }),
                ...(model && { model }),
                ...(serialNumber && { serialNumber }),
                ...(code !== undefined && { code }),
                ...(client !== undefined && { client }),
                ...(location && { location }),
                ...(service !== undefined && { service }),
                ...(status && { status }),
                ...(criticality && { criticality }),
                ...(purchaseDate && { purchaseDate: new Date(purchaseDate) }),
                ...(blDate && { blDate: new Date(blDate) }),
                ...(warrantyMonths !== undefined && { warrantyMonths: Number(warrantyMonths) }),
                ...(agence !== undefined && { agence }),
                ...(blNumber !== undefined && { blNumber }),
                ...(blDocumentUrl !== undefined && { blDocumentUrl }),
                ...(invoiceUrl !== undefined && { invoiceUrl })
            }
        });

        if (userId && status) {
            await prisma.sav_history.create({
                data: {
                    equipmentId: Number(id),
                    action: `Equipement modifie - statut: ${status}`,
                    userId: Number(userId)
                }
            });
        }

        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE /api/equipments/[id]
export async function DELETE(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id: paramId } = await params;
        const id = Number(paramId);

        if (!Number.isFinite(id) || id <= 0) {
            return NextResponse.json({ error: "ID equipement invalide." }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const equipment = await tx.equipment.findUnique({
                where: { id },
                select: { id: true, name: true, serialNumber: true }
            });

            if (!equipment) throw new Error("EQUIPEMENT_NOT_FOUND");
            if (equipment.serialNumber === ARCHIVE_EQUIPMENT_SERIAL) {
                throw new Error("ARCHIVE_EQUIPMENT_PROTECTED");
            }

            const linkedTickets = await tx.ticket.findMany({
                where: { equipmentId: id },
                select: { id: true }
            });

            let reassignedTickets = 0;
            if (linkedTickets.length > 0) {
                const archiveEquipment = await ensureArchiveEquipment(tx);

                await tx.ticket.updateMany({
                    where: { equipmentId: id },
                    data: { equipmentId: archiveEquipment.id }
                });

                await tx.sav_history.updateMany({
                    where: { equipmentId: id },
                    data: { equipmentId: archiveEquipment.id }
                });

                reassignedTickets = linkedTickets.length;
            } else {
                await tx.sav_history.deleteMany({ where: { equipmentId: id } });
            }

            await tx.equipment_document.deleteMany({ where: { equipmentId: id } });
            await tx.maintenance.deleteMany({ where: { equipmentId: id } });
            await tx.equipment.delete({ where: { id } });

            return {
                deletedEquipmentId: id,
                deletedEquipmentName: equipment.name,
                reassignedTickets
            };
        });

        return NextResponse.json({
            success: true,
            ...result,
            message:
                result.reassignedTickets > 0
                    ? `${result.deletedEquipmentName} supprime. ${result.reassignedTickets} ticket(s) ont ete reassignes a l'equipement archive.`
                    : `${result.deletedEquipmentName} supprime.`
        });
    } catch (error: any) {
        if (error?.message === "EQUIPEMENT_NOT_FOUND") {
            return NextResponse.json({ error: "Equipement non trouve." }, { status: 404 });
        }
        if (error?.message === "ARCHIVE_EQUIPMENT_PROTECTED") {
            return NextResponse.json({ error: "Suppression impossible: equipement archive systeme." }, { status: 400 });
        }

        return NextResponse.json(
            { error: "Suppression impossible. Les donnees liees n'ont pas pu etre mises a jour." },
            { status: 500 }
        );
    }
}


