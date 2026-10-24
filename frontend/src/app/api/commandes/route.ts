import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

const ALLOWED_STATUSES = ["DEMAND", "QUOTATION", "ORDERED", "SHIPPED", "RECEIVED", "CHECKED", "CONSUMED"] as const;
const ALLOWED_SOURCES = ["LOCAL", "IMPORT", "PLATFORM", "FABRICATION"] as const;

type PurchaseStatus = (typeof ALLOWED_STATUSES)[number];
type PurchaseSource = (typeof ALLOWED_SOURCES)[number];

function normalizeStatus(raw: string | null): PurchaseStatus | null {
    const value = String(raw || "").trim().toUpperCase();
    return ALLOWED_STATUSES.includes(value as PurchaseStatus) ? (value as PurchaseStatus) : null;
}

function normalizeSource(raw: unknown): PurchaseSource {
    const value = String(raw || "").trim().toUpperCase();
    return ALLOWED_SOURCES.includes(value as PurchaseSource) ? (value as PurchaseSource) : "LOCAL";
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const status = normalizeStatus(searchParams.get("status"));

        const orders = await prisma.purchase_order.findMany({
            where: status ? { status } : {},
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
            },
            orderBy: { createdAt: "desc" }
        });

        const ticketReferences = await getTicketAnnualReferenceMap(
            orders.flatMap((order) => order.items.map((item) => Number(item.ticket?.id || 0)).filter(Boolean))
        );
        const payload = orders.map((order) => ({
            ...order,
            items: order.items.map((item) => ({
                ...item,
                ticket: item.ticket ? attachTicketAnnualReference(item.ticket, ticketReferences) : item.ticket
            }))
        }));

        return NextResponse.json(payload);
    } catch (error: any) {
        console.error("Purchase list error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const supplier = String(body?.supplier || "").trim();
        const supplierContact = typeof body?.supplierContact === "string" ? body.supplierContact.trim() : "";
        const sourceType = normalizeSource(body?.sourceType);
        const expectedDate = body?.expectedDate ? new Date(body.expectedDate) : null;
        const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
        const creatorId = Number(body?.creatorId || 0) || 1;
        const items = Array.isArray(body?.items) ? body.items : [];

        if (!supplier) {
            return NextResponse.json({ error: "Le fournisseur est requis." }, { status: 400 });
        }

        if (items.length === 0) {
            return NextResponse.json({ error: "Ajoutez au moins une pièce." }, { status: 400 });
        }

        const normalizedItems = items
            .map((item: any) => ({
                name: String(item?.name || "").trim(),
                ref: typeof item?.ref === "string" ? item.ref.trim() : "",
                qty: Number(item?.qty || 0),
                unitPrice: Number(item?.unitPrice || 0),
                ticketId: item?.ticketId ? Number(item.ticketId) : null
            }))
            .filter((item: any) => item.name.length > 0 && Number.isFinite(item.qty) && item.qty > 0);

        if (normalizedItems.length === 0) {
            return NextResponse.json({ error: "Les lignes de commande sont invalides." }, { status: 400 });
        }

        const count = await prisma.purchase_order.count();
        const ref = `DA-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;
        const totalAmount = normalizedItems.reduce((sum: number, item: any) => sum + item.qty * item.unitPrice, 0);

        const order = await prisma.purchase_order.create({
            data: {
                ref,
                supplier,
                supplierContact: supplierContact || null,
                sourceType,
                status: "DEMAND",
                totalAmount,
                expectedDate,
                notes: notes || null,
                creatorId,
                items: {
                    create: normalizedItems.map((item: any) => ({
                        name: item.name,
                        ref: item.ref || null,
                        qty: item.qty,
                        unitPrice: item.unitPrice,
                        ticketId: item.ticketId
                    }))
                }
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

        const ticketReferences = await getTicketAnnualReferenceMap(
            order.items.map((item) => Number(item.ticket?.id || 0)).filter(Boolean)
        );
        const payload = {
            ...order,
            items: order.items.map((item) => ({
                ...item,
                ticket: item.ticket ? attachTicketAnnualReference(item.ticket, ticketReferences) : item.ticket
            }))
        };

        return NextResponse.json(payload, { status: 201 });
    } catch (error: any) {
        console.error("Purchase create error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}



