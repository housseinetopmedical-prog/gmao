import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

type PartRequestStatus =
    | "DEMANDE_RECUE"
    | "EN_STOCK"
    | "RESERVEE"
    | "COMMANDEE"
    | "EXPEDIEE"
    | "RECUE"
    | "LIVREE_TECHNICIEN"
    | "REFUSEE";

const STATUS_FALLBACK_BY_ORDER: Record<string, PartRequestStatus> = {
    DEMAND: "DEMANDE_RECUE",
    QUOTATION: "COMMANDEE",
    ORDERED: "COMMANDEE",
    SHIPPED: "EXPEDIEE",
    RECEIVED: "RECUE",
    CHECKED: "LIVREE_TECHNICIEN",
    CONSUMED: "LIVREE_TECHNICIEN"
};

function parseMetaFromOrderNotes(raw: string | null | undefined) {
    const note = String(raw || "");
    const lines = note.split("\n").map((line) => line.trim());

    const urgencyLine = lines.find((line) => /^Urgence\s*:/i.test(line));
    const justificationLine = lines.find((line) => /^Justification\s*:/i.test(line));

    const urgency = urgencyLine ? urgencyLine.replace(/^Urgence\s*:/i, "").trim().toUpperCase() : "MEDIUM";
    const justification = justificationLine ? justificationLine.replace(/^Justification\s*:/i, "").trim() : "";

    return {
        urgency: urgency || "MEDIUM",
        justification
    };
}

function parseStatusHistory(note: string | null | undefined) {
    if (!note) return null as null | { requestId: number; status: PartRequestStatus; comment: string; updatedAt?: string };
    try {
        const parsed = JSON.parse(note);
        const requestId = Number(parsed?.requestId);
        const status = String(parsed?.status || "").toUpperCase() as PartRequestStatus;
        if (!Number.isFinite(requestId) || !status) return null;
        return {
            requestId,
            status,
            comment: String(parsed?.comment || ""),
            updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : undefined
        };
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const items = await prisma.purchase_item.findMany({
            where: {
                ticketId: { not: null },
                order: {
                    is: {
                        sourceType: "LOCAL"
                    }
                }
            },
            include: {
                ticket: {
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        assignedTo: {
                            select: {
                                id: true,
                                name: true
                            }
                        }
                    }
                },
                order: {
                    select: {
                        id: true,
                        ref: true,
                        status: true,
                        sourceType: true,
                        createdAt: true,
                        expectedDate: true,
                        notes: true,
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                role: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                id: "desc"
            }
        });

        const references = Array.from(new Set(items.map((item) => String(item.ref || "").trim()).filter(Boolean)));
        const names = Array.from(new Set(items.map((item) => String(item.name || "").trim()).filter(Boolean)));
        const ticketIds = Array.from(new Set(items.map((item) => Number(item.ticketId)).filter((id) => Number.isFinite(id))));

        const [parts, statusHistory] = await Promise.all([
            prisma.part.findMany({
                where: {
                    OR: [{ reference: { in: references } }, { name: { in: names } }]
                },
                select: {
                    id: true,
                    name: true,
                    reference: true,
                    quantityInStock: true,
                    minStock: true
                }
            }),
            ticketIds.length > 0
                ? prisma.sav_history.findMany({
                      where: {
                          ticketId: { in: ticketIds },
                          action: "MAGASINIER_PART_REQUEST_STATUS"
                      },
                      orderBy: { createdAt: "desc" },
                      select: {
                          id: true,
                          ticketId: true,
                          note: true,
                          createdAt: true,
                          user: {
                              select: {
                                  id: true,
                                  name: true
                              }
                          }
                      }
                  })
                : Promise.resolve([])
        ]);

        const partByReference = new Map<string, (typeof parts)[number]>();
        const partByName = new Map<string, (typeof parts)[number]>();
        parts.forEach((part) => {
            partByReference.set(String(part.reference || "").toLowerCase(), part);
            partByName.set(String(part.name || "").toLowerCase(), part);
        });

        const latestStatusByRequest = new Map<
            number,
            {
                status: PartRequestStatus;
                comment: string;
                createdAt: Date;
                user?: { id: number; name: string } | null;
            }
        >();

        statusHistory.forEach((entry) => {
            const parsed = parseStatusHistory(entry.note);
            if (!parsed) return;
            if (!latestStatusByRequest.has(parsed.requestId)) {
                latestStatusByRequest.set(parsed.requestId, {
                    status: parsed.status,
                    comment: parsed.comment,
                    createdAt: entry.createdAt,
                    user: entry.user
                });
            }
        });

        const now = Date.now();
        const requests = items.map((item) => {
            const { urgency, justification } = parseMetaFromOrderNotes(item.order.notes);
            const linkedPart =
                partByReference.get(String(item.ref || "").toLowerCase()) ||
                partByName.get(String(item.name || "").toLowerCase()) ||
                null;

            const latestStatus = latestStatusByRequest.get(item.id);
            const fallbackStatus = STATUS_FALLBACK_BY_ORDER[String(item.order.status || "").toUpperCase()] || "DEMANDE_RECUE";
            const currentStatus = latestStatus?.status || fallbackStatus;

            const expectedAtMs = item.order.expectedDate ? new Date(item.order.expectedDate).getTime() : null;
            const isLate =
                Boolean(expectedAtMs) &&
                Number(expectedAtMs) < now &&
                !["RECUE", "LIVREE_TECHNICIEN", "REFUSEE"].includes(currentStatus);

            return {
                requestId: item.id,
                orderId: item.order.id,
                orderRef: item.order.ref,
                orderStatus: item.order.status,
                ticketId: item.ticketId,
                ticketTitle: item.ticket?.title || "",
                ticketStatus: item.ticket?.status || "",
                technician: item.order.creator
                    ? {
                          id: item.order.creator.id,
                          name: item.order.creator.name,
                          role: item.order.creator.role
                      }
                    : null,
                assignedTechnician: item.ticket?.assignedTo
                    ? {
                          id: item.ticket.assignedTo.id,
                          name: item.ticket.assignedTo.name
                      }
                    : null,
                reference: item.ref || "",
                designation: item.name,
                quantity: item.qty,
                urgency,
                justification,
                requestedAt: item.order.createdAt,
                expectedDate: item.order.expectedDate,
                currentStatus,
                latestComment: latestStatus?.comment || "",
                latestUpdateAt: latestStatus?.createdAt || null,
                latestUpdatedBy: latestStatus?.user || null,
                sourceType: item.order.sourceType,
                stock: linkedPart
                    ? {
                          partId: linkedPart.id,
                          quantityInStock: linkedPart.quantityInStock,
                          minStock: linkedPart.minStock,
                          available: linkedPart.quantityInStock >= item.qty
                      }
                    : {
                          partId: null,
                          quantityInStock: 0,
                          minStock: null,
                          available: false
                      },
                isLate
            };
        });

        return NextResponse.json({
            statuses: [
                "DEMANDE_RECUE",
                "EN_STOCK",
                "RESERVEE",
                "COMMANDEE",
                "EXPEDIEE",
                "RECUE",
                "LIVREE_TECHNICIEN",
                "REFUSEE"
            ],
            requests
        });
    } catch (error: any) {
        console.error("Magasinier part requests error:", error);
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}


