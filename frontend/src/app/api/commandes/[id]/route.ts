import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

const ALLOWED_STATUSES = ["DEMAND", "QUOTATION", "ORDERED", "SHIPPED", "RECEIVED", "CHECKED", "CONSUMED"] as const;
const ALLOWED_SOURCES = ["LOCAL", "IMPORT", "PLATFORM", "FABRICATION"] as const;

type PurchaseStatus = (typeof ALLOWED_STATUSES)[number];
type PurchaseSource = (typeof ALLOWED_SOURCES)[number];

function normalizeStatus(raw: unknown): PurchaseStatus | null {
    const value = String(raw || "").trim().toUpperCase();
    return ALLOWED_STATUSES.includes(value as PurchaseStatus) ? (value as PurchaseStatus) : null;
}

function normalizeSource(raw: unknown): PurchaseSource | null {
    const value = String(raw || "").trim().toUpperCase();
    return ALLOWED_SOURCES.includes(value as PurchaseSource) ? (value as PurchaseSource) : null;
}

function normalizeDate(raw: unknown) {
    if (!raw) return null;
    const value = String(raw).trim();
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function PATCH(req: Request, context: any) {
    const params = await context.params;
    try {
        const id = Number(params.id);
        if (!Number.isFinite(id)) {
            return NextResponse.json({ error: "ID de commande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const status = body.status !== undefined ? normalizeStatus(body.status) : null;
        const sourceType = body.sourceType !== undefined ? normalizeSource(body.sourceType) : null;
        const userId = Number(body?.userId || 0) || null;

        if (body.status !== undefined && !status) {
            return NextResponse.json({ error: "Statut de commande invalide." }, { status: 400 });
        }

        if (body.sourceType !== undefined && !sourceType) {
            return NextResponse.json({ error: "Type d'approvisionnement invalide." }, { status: 400 });
        }

        const expectedDate = body.expectedDate !== undefined ? normalizeDate(body.expectedDate) : undefined;
        const receivedDate = body.receivedDate !== undefined ? normalizeDate(body.receivedDate) : undefined;
        const supplier = typeof body.supplier === "string" ? body.supplier.trim() : undefined;
        const supplierContact = typeof body.supplierContact === "string" ? body.supplierContact.trim() : undefined;
        const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : undefined;
        const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;
        const supplierDocumentUrl = typeof body.supplierDocumentUrl === "string" ? body.supplierDocumentUrl.trim() : "";

        const existing = await prisma.purchase_order.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        ticket: {
                            select: {
                                id: true,
                                title: true,
                                equipmentId: true
                            }
                        }
                    }
                }
            }
        });

        if (!existing) {
            return NextResponse.json({ error: "Commande introuvable." }, { status: 404 });
        }

        const targetSourceType = sourceType || existing.sourceType;
        const targetStatus = status || existing.status;
        const effectiveExpectedDate = expectedDate !== undefined ? expectedDate : existing.expectedDate;
        const effectiveReceivedDate =
            receivedDate !== undefined
                ? receivedDate
                : targetStatus === "RECEIVED" && !existing.receivedDate
                    ? new Date()
                    : existing.receivedDate;

        if (targetSourceType === "IMPORT" && targetStatus === "ORDERED" && !effectiveExpectedDate) {
            return NextResponse.json({ error: "La date prévisionnelle est obligatoire quand la commande est lancée." }, { status: 400 });
        }

        if (targetSourceType === "IMPORT" && targetStatus === "RECEIVED" && !effectiveReceivedDate) {
            return NextResponse.json({ error: "La date de réception est obligatoire pour une demande import reçue." }, { status: 400 });
        }

        const mergedNotes = (() => {
            const base = notes !== undefined ? notes : existing.notes || "";
            if (!supplierDocumentUrl) return base;
            const marker = `Document fournisseur: ${supplierDocumentUrl}`;
            if (base.includes(marker)) return base;
            return [base, marker].filter(Boolean).join("\n");
        })();

        const shouldLogImportReceipt =
            targetSourceType === "IMPORT"
            && targetStatus === "RECEIVED"
            && (String(existing.status || "").toUpperCase() !== "RECEIVED" || !existing.receivedDate);
        const shouldLogImportOrderLaunch =
            targetSourceType === "IMPORT"
            && targetStatus === "ORDERED"
            && (
                String(existing.status || "").toUpperCase() !== "ORDERED"
                || String(existing.expectedDate || "") !== String(effectiveExpectedDate || "")
            );
        const shouldLogImportShipment =
            targetSourceType === "IMPORT"
            && targetStatus === "SHIPPED"
            && String(existing.status || "").toUpperCase() !== "SHIPPED";

        const updated = await prisma.$transaction(async (tx) => {
            const order = await tx.purchase_order.update({
                where: { id },
                data: {
                    ...(status ? { status } : {}),
                    ...(sourceType ? { sourceType } : {}),
                    ...(supplier !== undefined ? { supplier } : {}),
                    ...(supplierContact !== undefined ? { supplierContact: supplierContact || null } : {}),
                    ...(trackingNumber !== undefined ? { trackingNumber: trackingNumber || null } : {}),
                    ...(expectedDate !== undefined ? { expectedDate } : {}),
                    ...(receivedDate !== undefined || shouldLogImportReceipt ? { receivedDate: effectiveReceivedDate } : {}),
                    notes: mergedNotes
                },
                include: {
                    items: {
                        include: {
                            ticket: {
                                select: {
                                    id: true,
                                    title: true
                                }
                            }
                        }
                    },
                    creator: {
                        select: {
                            id: true,
                            name: true,
                            role: true
                        }
                    }
                }
            });

            if (shouldLogImportOrderLaunch && effectiveExpectedDate) {
                const actorId = userId || existing.creatorId;
                const orderPayload = JSON.stringify({
                    purchaseOrderId: existing.id,
                    purchaseOrderRef: order.ref,
                    expectedDate: effectiveExpectedDate.toISOString(),
                    items: existing.items.map((item) => ({
                        name: item.name,
                        ref: item.ref,
                        qty: item.qty
                    }))
                });

                for (const item of existing.items) {
                    if (!item.ticket?.id) continue;
                    await tx.sav_history.create({
                        data: {
                            ticketId: item.ticket.id,
                            equipmentId: item.ticket.equipmentId,
                            userId: actorId,
                            action: "IMPORT_ORDER_LAUNCHED",
                            note: orderPayload
                        }
                    });
                }
            }

            if (shouldLogImportShipment) {
                const actorId = userId || existing.creatorId;
                const shipmentPayload = JSON.stringify({
                    purchaseOrderId: existing.id,
                    purchaseOrderRef: order.ref,
                    shippedAt: new Date().toISOString(),
                    expectedDate: effectiveExpectedDate ? effectiveExpectedDate.toISOString() : null,
                    items: existing.items.map((item) => ({
                        name: item.name,
                        ref: item.ref,
                        qty: item.qty
                    }))
                });

                for (const item of existing.items) {
                    if (!item.ticket?.id) continue;
                    await tx.sav_history.create({
                        data: {
                            ticketId: item.ticket.id,
                            equipmentId: item.ticket.equipmentId,
                            userId: actorId,
                            action: "IMPORT_ORDER_SHIPPED",
                            note: shipmentPayload
                        }
                    });
                }
            }

            if (shouldLogImportReceipt) {
                const actorId = userId || existing.creatorId;
                const receiptPayload = JSON.stringify({
                    purchaseOrderId: existing.id,
                    purchaseOrderRef: order.ref,
                    receivedDate: (effectiveReceivedDate || new Date()).toISOString(),
                    items: existing.items.map((item) => ({
                        name: item.name,
                        ref: item.ref,
                        qty: item.qty
                    }))
                });

                for (const item of existing.items) {
                    if (!item.ticket?.id) continue;
                    await tx.sav_history.create({
                        data: {
                            ticketId: item.ticket.id,
                            equipmentId: item.ticket.equipmentId,
                            userId: actorId,
                            action: "IMPORT_REQUEST_RECEIVED",
                            note: receiptPayload
                        }
                    });
                }
            }

            return order;
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Purchase update error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}


