import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

// GET /api/adv/tickets — liste tickets avec infos ADV
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status") || undefined;

        const tickets = await prisma.ticket.findMany({
            where: { ...(status ? { status: status as any } : {}) },
            include: {
                equipment: {
                    select: { id: true, name: true, serialNumber: true, code: true, client: true, location: true, blDate: true, warrantyMonths: true }
                },
                creator: { select: { id: true, name: true, role: true } },
                assignedTo: { select: { id: true, name: true } },
                adv: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        const ticketReferences = await getTicketAnnualReferenceMap(tickets.map((ticket) => Number(ticket.id)));

        // Calcul garantie automatique
        const enriched = tickets.map(t => {
            let isUnderWarranty = t.isUnderWarranty;
            if ((t as any).equipment?.blDate && (t as any).equipment?.warrantyMonths) {
                const end = new Date((t as any).equipment.blDate);
                end.setMonth(end.getMonth() + (t as any).equipment.warrantyMonths);
                isUnderWarranty = new Date(t.createdAt) <= end;
            }
            return attachTicketAnnualReference({ ...t, isUnderWarranty }, ticketReferences);
        });

        return NextResponse.json(enriched);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            title, description, priority, equipmentId, advId, 
            assignedToId, estimatedEndDate,
            contactName, contactPhone, siteAddress 
        } = body;

        if (!title || !equipmentId || !advId) {
            return NextResponse.json({ error: "Champs obligatoires manquants: titre, équipement, utilisateur ADV" }, { status: 400 });
        }

        const equipment = await prisma.equipment.findUnique({
            where: { id: Number(equipmentId) }
        });
        if (!equipment) return NextResponse.json({ error: "Équipement non trouvé" }, { status: 404 });

        // Calcul garantie automatique.
        let isUnderWarranty = false;
        if (equipment.blDate && equipment.warrantyMonths) {
            const end = new Date(equipment.blDate);
            end.setMonth(end.getMonth() + equipment.warrantyMonths);
            isUnderWarranty = new Date() <= end;
        }

        await resetTicketAutoIncrementIfEmpty();

        const ticket = await prisma.ticket.create({
            data: {
                title,
                description: description || "",
                priority: priority || "MEDIUM",
                status: "QUALIFICATION", // ADV crée directement en QUALIFICATION
                equipmentId: Number(equipmentId),
                creatorId: Number(advId),
                advId: Number(advId),
                assignedToId: assignedToId ? Number(assignedToId) : null,
                isUnderWarranty,
                estimatedEndDate: estimatedEndDate ? new Date(estimatedEndDate) : null,
                // Nouveaux champs Mode Appel
                contactName,
                contactPhone,
                siteAddress
            },
            include: {
                equipment: true,
                creator: { select: { name: true } },
            }
        });

        // Historique SAV
        await prisma.sav_history.create({
            data: {
                equipmentId: Number(equipmentId),
                ticketId: ticket.id,
                action: `Ticket créé par ADV (${ticket.creator.name}) — Qualification directe`,
                userId: Number(advId),
            }
        });

        // Mise à jour statut équipement
        await prisma.equipment.update({
            where: { id: Number(equipmentId) },
            data: { status: "DOWN_AT_CLIENT" }
        });

        const ticketReference = await getTicketAnnualReferenceMap([ticket.id]);
        return NextResponse.json(attachTicketAnnualReference(ticket, ticketReference), { status: 201 });
    } catch (error: any) {
        console.error("Erreur création ticket ADV:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


