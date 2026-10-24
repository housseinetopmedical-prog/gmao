import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { getRequestUserContext } from "@/metier/utilisateur-requete";

type PartRequestStatus =
    | "DEMANDE_RECUE"
    | "EN_STOCK"
    | "RESERVEE"
    | "COMMANDEE"
    | "EXPEDIEE"
    | "RECUE"
    | "LIVREE_TECHNICIEN"
    | "REFUSEE";

const ALLOWED_STATUSES: PartRequestStatus[] = [
    "DEMANDE_RECUE",
    "EN_STOCK",
    "RESERVEE",
    "COMMANDEE",
    "EXPEDIEE",
    "RECUE",
    "LIVREE_TECHNICIEN",
    "REFUSEE"
];

const PURCHASE_STATUS_BY_REQUEST_STATUS: Partial<Record<PartRequestStatus, "DEMAND" | "ORDERED" | "SHIPPED" | "RECEIVED" | "CHECKED">> = {
    DEMANDE_RECUE: "DEMAND",
    EN_STOCK: "DEMAND",
    RESERVEE: "DEMAND",
    COMMANDEE: "ORDERED",
    EXPEDIEE: "SHIPPED",
    RECUE: "RECEIVED",
    LIVREE_TECHNICIEN: "CHECKED"
};

function normalizeStatus(raw: unknown): PartRequestStatus | null {
    const value = String(raw || "").trim().toUpperCase();
    if (ALLOWED_STATUSES.includes(value as PartRequestStatus)) {
        return value as PartRequestStatus;
    }
    return null;
}

export async function PATCH(req: Request, context: any) {
    const params = await context.params;
    try {
        const requestId = Number(params.id);
        if (!Number.isFinite(requestId)) {
            return NextResponse.json({ error: "ID de demande de pièce invalide." }, { status: 400 });
        }

        const body = await req.json();
        const status = normalizeStatus(body?.status);
        const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

        const requestUser = getRequestUserContext(req);
        const userId = Number(body?.userId || requestUser.userId || 0);

        if (!status) {
            return NextResponse.json({ error: "Statut de demande de pièce invalide." }, { status: 400 });
        }

        if (!userId) {
            return NextResponse.json({ error: "Utilisateur requis." }, { status: 400 });
        }

        if (requestUser.role && requestUser.role !== "MAGASINIER" && requestUser.role !== "ADMIN") {
            return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
        }

        const item = await prisma.purchase_item.findUnique({
            where: { id: requestId },
            include: {
                order: {
                    select: {
                        id: true,
                        status: true,
                        sourceType: true
                    }
                },
                ticket: {
                    select: {
                        id: true,
                        equipmentId: true,
                        assignedToId: true
                    }
                }
            }
        });

        if (!item || !item.ticket) {
            return NextResponse.json({ error: "Demande de pièce introuvable." }, { status: 404 });
        }

        if (String(item.order?.sourceType || "").toUpperCase() !== "LOCAL") {
            return NextResponse.json({ error: "Cette demande n'est pas gérée par le magasinier." }, { status: 400 });
        }

        const ticket = item.ticket;

        const linkedPart = await prisma.part.findFirst({
            where: {
                OR: [{ id: Number(body?.partId || 0) || -1 }, { reference: item.ref || "" }, { name: item.name }]
            },
            select: {
                id: true,
                quantityInStock: true
            }
        });

        const nextPurchaseStatus = PURCHASE_STATUS_BY_REQUEST_STATUS[status];

        const result = await prisma.$transaction(async (tx) => {
            let deliveryMovement: any = null;

            if (status === "LIVREE_TECHNICIEN") {
                if (!linkedPart) {
                    throw new Error("Aucune pièce de stock liée à cette demande.");
                }

                if (linkedPart.quantityInStock < item.qty) {
                    throw new Error("Stock insuffisant pour confirmer la remise au technicien.");
                }

                deliveryMovement = await tx.stock_movement.create({
                    data: {
                        partId: linkedPart.id,
                        type: "SORTIE",
                        qty: item.qty,
                        ref: `Livraison technicien - demande #${requestId}`,
                        userId,
                        ticketId: ticket.id,
                        technicianId: ticket.assignedToId || null,
                        fromLocation: "Magasin",
                        toLocation: "Technicien"
                    }
                });

                await tx.part.update({
                    where: { id: linkedPart.id },
                    data: {
                        quantityInStock: {
                            decrement: item.qty
                        }
                    }
                });
            }

            if (nextPurchaseStatus) {
                await tx.purchase_order.update({
                    where: { id: item.order.id },
                    data: {
                        status: nextPurchaseStatus,
                        ...(nextPurchaseStatus === "RECEIVED" ? { receivedDate: new Date() } : {})
                    }
                });
            }

            await tx.sav_history.create({
                data: {
                    ticketId: ticket.id,
                    equipmentId: ticket.equipmentId,
                    userId,
                    action: "MAGASINIER_PART_REQUEST_STATUS",
                    note: JSON.stringify({
                        requestId,
                        purchaseOrderId: item.order.id,
                        status,
                        comment,
                        updatedAt: new Date().toISOString(),
                        stockPartId: linkedPart?.id || null
                    })
                }
            });

            return {
                requestId,
                status,
                comment,
                deliveryMovement
            };
        });

        return NextResponse.json({ success: true, ...result });
    } catch (error: any) {
        console.error("Magasinier part request update error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}


