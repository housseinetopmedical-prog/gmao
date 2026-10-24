import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { isImportReceivedAlertActive } from "@/metier/workflow-import";
import { parseAppelsOffreVisitNotes } from "@/metier/workflow-appels-offre";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeRole(raw: string | null) {
    return String(raw || "").trim().toUpperCase();
}

function normalizeUserId(raw: string | null) {
    const value = Number(raw || 0);
    return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const role = normalizeRole(searchParams.get("role"));
        const userId = normalizeUserId(searchParams.get("userId"));
        const summary = searchParams.get("summary") === "1";
        const now = new Date();

        const importOrders = await prisma.purchase_order.findMany({
            where: {
                sourceType: "IMPORT"
            },
            include: {
                creator: {
                    select: {
                        id: true,
                        name: true,
                        role: true
                    }
                },
                items: {
                    include: {
                        ticket: {
                            select: {
                                id: true,
                                title: true,
                                createdAt: true,
                                status: true,
                                closedAt: true,
                                assignedToId: true,
                                savHistory: {
                                    select: {
                                        action: true
                                    },
                                    orderBy: {
                                        createdAt: "desc"
                                    },
                                    take: 12
                                },
                                reclamation: {
                                    select: {
                                        deviceModel: true,
                                        serialNumber: true,
                                        description: true,
                                        checklist: true
                                    }
                                },
                                assignedTo: {
                                    select: {
                                        id: true,
                                        name: true
                                    }
                                },
                                equipment: {
                                    select: {
                                        id: true,
                                        name: true,
                                        serialNumber: true,
                                        client: true,
                                        type: true,
                                        location: true,
                                        service: true
                                    }
                                }
                            }
                        }
                    }
                }
            },
            orderBy: {
                updatedAt: "desc"
            }
        });

        const ticketReferences = await getTicketAnnualReferenceMap(
            importOrders.flatMap((order) => order.items.map((item) => Number(item.ticket?.id || 0)).filter(Boolean))
        );

        const equipmentIds = Array.from(
            new Set(
                importOrders.flatMap((order) =>
                    order.items
                        .map((item) => item.ticket?.equipment?.id || null)
                        .filter((id): id is number => Number.isFinite(id as number))
                )
            )
        );

        const aoMaintenances = equipmentIds.length
            ? await prisma.maintenance.findMany({
                  where: {
                      equipmentId: {
                          in: equipmentIds
                      }
                  },
                  select: {
                      id: true,
                      equipmentId: true,
                      scheduledDate: true,
                      notes: true
                  },
                  orderBy: {
                      scheduledDate: "desc"
                  }
              })
            : [];

        const latestAoVisitByEquipment = new Map<number, Date>();
        aoMaintenances.forEach((maintenance) => {
            if (!maintenance.equipmentId) return;
            if (!parseAppelsOffreVisitNotes(maintenance.notes)) return;
            if (!latestAoVisitByEquipment.has(maintenance.equipmentId)) {
                latestAoVisitByEquipment.set(maintenance.equipmentId, maintenance.scheduledDate);
            }
        });

        const normalizedOrders = importOrders.map((order) => {
            const firstTicketRaw = order.items.find((item) => item.ticket)?.ticket || null;
            const firstTicket = firstTicketRaw ? attachTicketAnnualReference(firstTicketRaw, ticketReferences) : null;
            const equipment = firstTicket?.equipment || null;
            const latestAoVisitDate = equipment?.id ? latestAoVisitByEquipment.get(equipment.id) || null : null;
            const hasAdministrativeClosure = Array.isArray(firstTicket?.savHistory)
                && firstTicket.savHistory.some((entry) => String(entry?.action || "").toUpperCase() === "ADMIN_CLOSURE_COMPLETED");
            const ticketClosed =
                String(firstTicket?.status || "").toUpperCase() === "CLOSED"
                || Boolean(firstTicket?.closedAt)
                || hasAdministrativeClosure;
            const isAlertActive =
                String(order.status || "").toUpperCase() === "RECEIVED"
                && isImportReceivedAlertActive(order.receivedDate, { now, ticketClosed });

            return {
                id: order.id,
                ref: order.ref,
                sourceType: order.sourceType,
                status: order.status,
                supplier: order.supplier,
                supplierContact: order.supplierContact,
                trackingNumber: order.trackingNumber,
                notes: order.notes,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                expectedDate: order.expectedDate,
                receivedDate: order.receivedDate,
                creator: order.creator,
                ticket: firstTicket,
                equipment,
                latestAoVisitDate,
                visitPassed: ticketClosed,
                ticketClosed,
                isAlertActive,
                items: order.items.map((item) => ({
                    id: item.id,
                    name: item.name,
                    ref: item.ref,
                    qty: item.qty,
                    ticketId: item.ticketId
                }))
            };
        });

        const roleFiltered = normalizedOrders.filter((order) => {
            if (role === "TECHNICIAN") {
                return userId ? Number(order.ticket?.assignedToId || 0) === userId : false;
            }
            if (role === "RESPONSABLE_APPELS_OFFRE") {
                return String(order.equipment?.type || "").toUpperCase() === "APPEL_OFFRE";
            }
            if (role === "RESPONSABLE_TECHNIQUE") {
                return Boolean(order.ticket?.id);
            }
            return true;
        });

        const pendingOrders = roleFiltered
            .filter((order) => !["RECEIVED", "CHECKED", "CONSUMED"].includes(String(order.status || "").toUpperCase()))
            .sort((a, b) => new Date(String(b.createdAt)).getTime() - new Date(String(a.createdAt)).getTime());

        const alertOrders = roleFiltered
            .filter((order) => order.isAlertActive)
            .sort((a, b) => new Date(String(b.receivedDate || b.updatedAt)).getTime() - new Date(String(a.receivedDate || a.updatedAt)).getTime());

        const historyOrders = roleFiltered
            .filter((order) => ["RECEIVED", "CHECKED", "CONSUMED"].includes(String(order.status || "").toUpperCase()) && !order.isAlertActive)
            .sort((a, b) => new Date(String(b.receivedDate || b.updatedAt)).getTime() - new Date(String(a.receivedDate || a.updatedAt)).getTime());

        if (summary) {
            return NextResponse.json({
                pendingCount: pendingOrders.length,
                alertCount: alertOrders.length,
                historyCount: historyOrders.length,
                alertOrders: alertOrders.slice(0, 5).map((order) => ({
                    id: order.id,
                    receivedDate: order.receivedDate,
                    updatedAt: order.updatedAt,
                    ticket: order.ticket ? {
                        id: order.ticket.id,
                        assignedToId: order.ticket.assignedToId,
                        ticketReference: (order.ticket as any).ticketReference,
                        displayId: (order.ticket as any).displayId,
                        createdAt: order.ticket.createdAt
                    } : null,
                    equipment: order.equipment ? { id: order.equipment.id, name: order.equipment.name } : null
                }))
            }, {
                headers: {
                    "Cache-Control": "no-store, max-age=0"
                }
            });
        }

        return NextResponse.json({
            pendingOrders,
            alertOrders,
            historyOrders
        }, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (error: any) {
        console.error("Import overview error:", error);
        return NextResponse.json({ error: error?.message || "Chargement import impossible." }, { status: 500 });
    }
}


