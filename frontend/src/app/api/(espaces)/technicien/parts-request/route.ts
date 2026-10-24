import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

const URGENCY_TO_PRIORITY: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL"
};

function getUrgencyLabel(urgency: string) {
    if (urgency === "LOW") return "Faible";
    if (urgency === "MEDIUM") return "Moyenne";
    if (urgency === "HIGH") return "Élevée";
    if (urgency === "CRITICAL") return "Critique";
    return urgency;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const userId = Number(body.userId);
        const ticketId = Number(body.ticketId);
        const reference = String(body.reference || "").trim();
        const designation = String(body.designation || "").trim();
        const quantity = Number(body.quantity || 0);
        const urgency = String(body.urgency || "MEDIUM").toUpperCase();
        const justification = String(body.justification || "").trim();
        const nature = String(body.nature || "").trim();
        const laborHours = String(body.laborHours || "").trim();
        const supplierCode = String(body.supplierCode || "").trim();
        const articleCode = String(body.articleCode || "").trim();
        const costPrice = String(body.costPrice || "").trim();
        const purchasePrice = String(body.purchasePrice || "").trim();
        const purchaseCurrency = String(body.purchaseCurrency || "").trim().toUpperCase();
        const exportPrice = String(body.exportPrice || "").trim();
        const exportCurrency = String(body.exportCurrency || "").trim().toUpperCase();
        const salePriceTtc = String(body.salePriceTtc || "").trim();
        const equipmentLabel = String(body.equipmentLabel || "").trim();
        const equipmentSerialNumber = String(body.equipmentSerialNumber || "").trim();
        const equipmentPn = String(body.equipmentPn || "").trim();
        const openInternalSubTicket = Boolean(body.openInternalSubTicket);
        const destination = String(body.destination || "IMPORT").trim().toUpperCase() === "MAGASINIER" ? "MAGASINIER" : "IMPORT";
        const sourceType = String(body.sourceType || (destination === "MAGASINIER" ? "LOCAL" : "IMPORT")).trim().toUpperCase() === "LOCAL" ? "LOCAL" : "IMPORT";
        const urgencyLabel = getUrgencyLabel(urgency);
        const equipmentLines = [
            equipmentLabel ? `Materiel concerne: ${equipmentLabel}` : "",
            equipmentSerialNumber ? `SN materiel: ${equipmentSerialNumber}` : "",
            equipmentPn ? `PN materiel: ${equipmentPn}` : ""
        ].filter(Boolean);

        if (!userId || !ticketId || !reference || !designation || quantity <= 0 || !justification) {
            return NextResponse.json({ error: "Données invalides pour la demande de pièces" }, { status: 400 });
        }

        const [user, ticket] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } }),
            prisma.ticket.findUnique({
                where: { id: ticketId },
                include: { equipment: { select: { id: true, name: true, serialNumber: true, client: true } } }
            })
        ]);

        if (!user) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
        if (!ticket) return NextResponse.json({ error: "Ticket introuvable" }, { status: 404 });
        if (user.role === "CLIENT") return NextResponse.json({ error: "Rôle non autorisé" }, { status: 403 });

        const ticketReferences = await getTicketAnnualReferenceMap([ticket.id]);
        const ticketReference = ticketReferences.get(ticket.id) || String(ticket.id);
        const count = await prisma.purchase_order.count();
        const ref = `DA-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

        const purchaseOrder = await prisma.purchase_order.create({
            data: {
                ref,
                supplier: destination === "MAGASINIER" ? "Magasin principal" : "Service import",
                supplierContact: null,
                sourceType,
                status: "DEMAND",
                totalAmount: 0,
                notes: [
                    `Demande de pièces transmise ${destination === "MAGASINIER" ? "au magasinier" : "au service import"} - Ticket #${ticketReference}`,
                    ...equipmentLines,
                    `Pièce demandée: ${designation}`,
                    `Quantité: ${quantity}`,
                    `Référence: ${reference}`,
                    nature ? `Nature de l'activité: ${nature}` : "",
                    laborHours ? `Heures de travail: ${laborHours}` : "",
                    supplierCode ? `Code fournisseur: ${supplierCode}` : "",
                    articleCode ? `Code article: ${articleCode}` : "",
                    costPrice ? `Prix de revient: ${costPrice}` : "",
                    purchasePrice ? `Prix d'achat: ${purchasePrice}` : "",
                    purchaseCurrency ? `Devise: ${purchaseCurrency}` : "",
                    exportPrice ? `Export price: ${exportPrice}` : "",
                    exportCurrency ? `Devise export: ${exportCurrency}` : "",
                    salePriceTtc ? `Prix de vente TTC: ${salePriceTtc}` : "",
                    `Urgence: ${urgencyLabel}`,
                    `Justification: ${justification}`
                ].join("\n"),
                creatorId: user.id,
                items: {
                    create: [
                        {
                            name: designation,
                            ref: reference,
                            qty: quantity,
                            unitPrice: 0,
                            ticketId: ticket.id
                        }
                    ]
                }
            },
            include: {
                items: true
            }
        });

        await prisma.sav_history.create({
            data: {
                ticketId: ticket.id,
                equipmentId: ticket.equipmentId,
                userId: user.id,
                action: "PART_REQUEST",
                note: [
                    "Demande de pièces enregistrée",
                    `Destination: ${destination === "MAGASINIER" ? "Magasinier" : "Import"}`,
                    ...equipmentLines,
                    `Pièce: ${designation}`,
                    `Référence: ${reference}`,
                    nature ? `Nature de l'activité: ${nature}` : "",
                    laborHours ? `Heures de travail: ${laborHours}` : "",
                    supplierCode ? `Code fournisseur: ${supplierCode}` : "",
                    articleCode ? `Code article: ${articleCode}` : "",
                    costPrice ? `Prix de revient: ${costPrice}` : "",
                    purchasePrice ? `Prix d'achat: ${purchasePrice}` : "",
                    purchaseCurrency ? `Devise: ${purchaseCurrency}` : "",
                    exportPrice ? `Export price: ${exportPrice}` : "",
                    exportCurrency ? `Devise export: ${exportCurrency}` : "",
                    salePriceTtc ? `Prix de vente TTC: ${salePriceTtc}` : "",
                    `Quantité: ${quantity}`,
                    `Urgence: ${urgencyLabel}`,
                    `Justification: ${justification}`
                ].join("\n")
            }
        });

        let subTicket: any = null;
        if (openInternalSubTicket) {
            await resetTicketAutoIncrementIfEmpty();

            subTicket = await prisma.ticket.create({
                data: {
                    title: `Sous-ticket piece ${reference}`,
                    description: [
                        `Sous-ticket interne lie au ticket #${ticketReference}`,
                        ...equipmentLines,
                        `Piece: ${designation} (${reference})`,
                        `Quantite: ${quantity}`,
                        `Urgence: ${urgencyLabel}`,
                        `Justification: ${justification}`
                    ].join("\n"),
                    priority: URGENCY_TO_PRIORITY[urgency] || "MEDIUM",
                    status: "PENDING_PARTS",
                    equipmentId: ticket.equipmentId,
                    creatorId: user.id,
                    advId: ticket.advId,
                    assignedToId: null,
                    interventionType: ticket.interventionType || null
                }
            });

            await prisma.sav_history.create({
                data: {
                    ticketId: subTicket.id,
                    equipmentId: ticket.equipmentId,
                    userId: user.id,
                    action: "INTERNAL_SUBTICKET_CREATED",
                    note: `Sous-ticket piece cree depuis ticket #${ticketReference}`
                }
            });

            const subTicketReferences = await getTicketAnnualReferenceMap([subTicket.id]);
            const subTicketReference = subTicketReferences.get(subTicket.id) || String(subTicket.id);
            await prisma.sav_history.create({
                data: {
                    ticketId: ticket.id,
                    equipmentId: ticket.equipmentId,
                    userId: user.id,
                    action: "INTERNAL_SUBTICKET_LINKED",
                    note: `Sous-ticket #${subTicketReference} cree pour la demande piece`
                }
            });
        }

        await prisma.sav_history.create({
            data: {
                ticketId: ticket.id,
                equipmentId: ticket.equipmentId,
                userId: user.id,
                action: destination === "MAGASINIER" ? "PART_REQUEST_SENT_TO_STORE" : "PART_REQUEST_SENT_TO_IMPORT",
                note: [
                    `Demande de pièces transmise ${destination === "MAGASINIER" ? "au magasinier" : "au service import"}.`,
                    ...equipmentLines,
                    `Référence d'approvisionnement: ${purchaseOrder.ref}`,
                    nature ? `Nature de l'activité: ${nature}` : "",
                    laborHours ? `Heures de travail: ${laborHours}` : "",
                    supplierCode ? `Code fournisseur: ${supplierCode}` : "",
                    articleCode ? `Code article: ${articleCode}` : "",
                    costPrice ? `Prix de revient: ${costPrice}` : "",
                    purchasePrice ? `Prix d'achat: ${purchasePrice}` : "",
                    purchaseCurrency ? `Devise: ${purchaseCurrency}` : "",
                    salePriceTtc ? `Prix de vente TTC: ${salePriceTtc}` : "",
                    `Urgence: ${urgencyLabel}`,
                    `Justification: ${justification}`
                ].join("\n")
            }
        });

        return NextResponse.json({
            purchaseOrder,
            subTicket,
            destination
        });
    } catch (error: any) {
        console.error("Parts request error:", error);
        return NextResponse.json({ error: error.message || "Erreur serveur" }, { status: 500 });
    }
}


