import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";

// POST /api/adv/reclamations/[id]/validate - transforme une reclamation en ticket technique
export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const { id } = await params;
        const reclamationId = parseInt(id);
        const body = await req.json();
        const { advId, priority } = body;

        const rec = await prisma.reclamation.findUnique({
            where: { id: reclamationId }
        });
        if (!rec) return NextResponse.json({ error: "Reclamation non trouvee" }, { status: 404 });
        if (rec.status === "VALIDATED") return NextResponse.json({ error: "Reclamation deja validee" }, { status: 400 });
        const equipment = await ensureEquipmentForReclamation(rec);

        let isUnderWarranty = false;
        if (equipment.blDate && equipment.warrantyMonths) {
            const end = new Date(equipment.blDate);
            end.setMonth(end.getMonth() + equipment.warrantyMonths);
            isUnderWarranty = new Date() <= end;
        }

        await resetTicketAutoIncrementIfEmpty();

        const ticket = await prisma.ticket.create({
            data: {
                title: `Reclamation : ${rec.customerName}`,
                description: `Symptomes : ${rec.description}`,
                priority: priority || "MEDIUM",
                status: "QUALIFICATION",
                equipmentId: equipment.id,
                creatorId: advId || 1,
                advId: advId || 1,
                isUnderWarranty,
                contactName: rec.customerName,
                contactPhone: rec.phone,
                siteAddress: equipment.location || ""
            }
        });

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: { status: "VALIDATED" }
        });

        await prisma.sav_history.create({
            data: {
                equipmentId: equipment.id,
                ticketId: ticket.id,
                action: "Validation ADV : Reclamation transformee en ticket technique",
                userId: advId || 1
            }
        });

        await prisma.equipment.update({
            where: { id: equipment.id },
            data: { status: "DOWN_AT_CLIENT" }
        });

        return NextResponse.json({ ticketId: ticket.id, success: true });
    } catch (error: any) {
        console.error("Erreur validation reclamation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


