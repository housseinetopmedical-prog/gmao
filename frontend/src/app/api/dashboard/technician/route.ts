import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { getMaintenanceAlertWindowDays, parseMaintenanceNotes, MAINTENANCE_COVERAGE_LABELS, PREVENTIVE_PLANNING_LABELS } from "@/metier/workflow-maintenance";
import { getAppelsOffreVisitKindLabel, isUpcomingWithinDays, parseAppelsOffreVisitNotes } from "@/metier/workflow-appels-offre";
import {
    getLatestTechnicianAssignmentAt,
    getTechnicianRepairStatusReferenceAt,
    getTicketTechnicianDayReferenceAt,
    hasPendingQuoteApprovedAlert,
    hasTechnicianRepairStatusStaleAlert
} from "@/metier/workflow-technicien";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";
import { getTechnicalVisitDateEntries, getUpcomingTechnicalVisitDates, startOfLocalDay } from "@/metier/visites-techniques";

function parseMarketMeta(raw: unknown) {
    try {
        const parsed = JSON.parse(String(raw || ""));
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function parseStoredMarketMeta(raw: unknown) {
    const text = String(raw || "").trim();
    if (!text.startsWith("{")) return {};
    const parsed = parseMarketMeta(text);
    return (parsed as any).storageKind === "AO_MARKET_META" ? parsed : {};
}

function isNonReparableTicket(ticket: {
    status?: string | null;
    savHistory?: Array<{ action?: string | null }> | null;
}) {
    const history = Array.isArray(ticket.savHistory) ? ticket.savHistory : [];
    return String(ticket.status || "").toUpperCase() === "NON_REPARE"
        || history.some((entry) => String(entry?.action || "").toUpperCase() === "FINAL_OUTCOME_NON_REPARE");
}

function isUrgentTicket(ticket: { priority?: string | null }) {
    const priority = String(ticket.priority || "").trim().toUpperCase();
    return priority === "HIGH" || priority === "CRITICAL";
}

function isVisitCompleted(status: unknown) {
    const normalized = String(status || "").trim().toUpperCase();
    return ["COMPLETED", "DONE", "REALIZED", "REALISED", "REALISEE", "RÉALISÉE"].includes(normalized);
}

function getVisitDateKey(value: unknown) {
    const entries = getTechnicalVisitDateEntries([value]);
    const firstEntry = entries[0];
    if (!firstEntry) return "";
    const date = startOfLocalDay(firstEntry.date);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userIdRaw = searchParams.get("userId");
        const summary = searchParams.get("summary") === "1";
        if (!userIdRaw) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
        const userId = parseInt(userIdRaw);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const interventions = summary
            ? []
            : await prisma.maintenance.findMany({
                  where: {
                      technicianId: userId,
                      scheduledDate: {
                          gte: startOfDay,
                          lte: endOfDay
                      }
                  },
                  include: { equipment: true }
              });

        const assignedTicketsRaw = await prisma.ticket.findMany({
            where: {
                assignedToId: userId,
                status: { not: "CLOSED" }
            },
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                estimatedEndDate: true,
                interventionType: true,
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        client: true
                    }
                },
                reclamation: {
                    select: {
                        status: true,
                        updatedAt: true,
                        interventionType: true,
                        checklist: true
                    }
                },
                savHistory: {
                    select: {
                        action: true,
                        createdAt: true
                    }
                }
            }
        });

        const sharedAlertTicketsRaw = await prisma.ticket.findMany({
            where: {
                status: { not: "CLOSED" }
            },
            select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                assignedToId: true,
                equipment: {
                    select: {
                        id: true,
                        name: true,
                        serialNumber: true,
                        client: true
                    }
                },
                reclamation: {
                    select: {
                        status: true,
                        updatedAt: true,
                        interventionType: true,
                        checklist: true
                    }
                },
                savHistory: {
                    select: {
                        action: true,
                        createdAt: true
                    }
                }
            }
        });

        const ticketReferences = await getTicketAnnualReferenceMap(Array.from(new Set([
            ...assignedTicketsRaw.map((ticket) => Number(ticket.id)),
            ...sharedAlertTicketsRaw.map((ticket) => Number(ticket.id))
        ])));
        const assignedTickets = assignedTicketsRaw.filter((ticket) => {
            if (String(ticket.status || "").toUpperCase() === "READY_FOR_DELIVERY") return false;
            if (isNonReparableTicket(ticket)) return false;

            return true;
        }).map((ticket) => attachTicketAnnualReference(ticket, ticketReferences));
        const sharedAlertTickets = sharedAlertTicketsRaw.map((ticket) => attachTicketAnnualReference(ticket, ticketReferences));

        const now = new Date();
        const maintenanceAlertLimit = new Date(now);
        maintenanceAlertLimit.setDate(maintenanceAlertLimit.getDate() + 2);
        const appelsOffreAlertLimit = new Date(now);
        appelsOffreAlertLimit.setDate(appelsOffreAlertLimit.getDate() + 2);

        const maintenanceVisitsSoon = await prisma.maintenance.findMany({
            where: {
                technicianId: userId,
                status: { not: "COMPLETED" },
                scheduledDate: {
                    gte: now,
                    lte: maintenanceAlertLimit
                }
            },
            include: {
                equipment: true
            },
            orderBy: {
                scheduledDate: "asc"
            }
        });

        const appelsOffreVisits = await prisma.maintenance.findMany({
            where: {
                status: { not: "COMPLETED" },
                scheduledDate: {
                    gte: now,
                    lte: appelsOffreAlertLimit
                }
            },
            include: {
                equipment: true
            },
            orderBy: {
                scheduledDate: "asc"
            },
            take: 30
        });

        const allAppelsOffreVisits = await prisma.maintenance.findMany({
            include: {
                equipment: true
            },
            orderBy: {
                scheduledDate: "asc"
            },
            take: 500
        });

        const aoUpcomingVisits = appelsOffreVisits
            .map((maintenance) => {
                const metadata = parseAppelsOffreVisitNotes(maintenance.notes);
                if (!metadata) return null;
                const assignedId = Number(metadata.assignedTechnicianId || maintenance.technicianId || 0) || null;
                if (assignedId && assignedId !== userId) return null;
                return {
                    id: maintenance.id,
                    type: maintenance.type,
                    status: maintenance.status,
                    scheduledDate: maintenance.scheduledDate,
                    equipment: maintenance.equipment,
                    metadata
                };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

        const parsedAppelsOffreVisits = allAppelsOffreVisits
            .map((maintenance) => {
                const metadata = parseAppelsOffreVisitNotes(maintenance.notes);
                if (!metadata) return null;
                return {
                    id: maintenance.id,
                    equipmentId: maintenance.equipmentId,
                    status: maintenance.status,
                    scheduledDate: maintenance.scheduledDate,
                    metadata
                };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

        const appelsOffreEquipments = await prisma.equipment.findMany({
            where: { type: "APPEL_OFFRE" },
            select: {
                id: true,
                name: true,
                serialNumber: true,
                code: true,
                blNumber: true,
                location: true,
                invoiceUrl: true
            }
        });

        const marketRows = appelsOffreEquipments.length
            ? await prisma.$queryRaw<Array<{ equipmentId: number | null; documentUrl: string | null; marketNumber: string | null; designation: string | null; serialNumber: string | null; inventoryNumber: string | null; hospital: string | null }>>`
                SELECT equipmentId, documentUrl, marketNumber, designation, serialNumber, inventoryNumber, hospital
                FROM marches
                WHERE equipmentId IS NOT NULL
            `
            : [];
        const marketByEquipment = new Map<number, any>();
        marketRows.forEach((row) => {
            const equipmentId = Number(row.equipmentId || 0);
            if (!equipmentId) return;
            marketByEquipment.set(equipmentId, row);
        });

        const technicalVisitRows = appelsOffreEquipments.flatMap((equipment) => {
            const market = marketByEquipment.get(Number(equipment.id)) || {};
            const meta = {
                ...parseMarketMeta(equipment.invoiceUrl),
                ...parseStoredMarketMeta(market.documentUrl)
            };
            const rawDates = Array.isArray((meta as any).technicalVisitDates) && (meta as any).technicalVisitDates.length > 0
                ? (meta as any).technicalVisitDates
                : [];
            const upcomingDates = getUpcomingTechnicalVisitDates(rawDates, startOfDay);
            return upcomingDates.map((visitDate, index) => ({
                id: `technical-visit-${equipment.id}-${index}-${visitDate.raw}`,
                alertKind: "TECHNICAL_VISIT_DUE",
                title: "Il reste deux jours pour la visite technique",
                marketNumber: String(market.marketNumber || equipment.blNumber || "").trim(),
                equipment: {
                    id: equipment.id,
                    name: String(market.designation || equipment.name || "").trim(),
                    serialNumber: String(market.serialNumber || equipment.serialNumber || "").trim(),
                    inventoryNumber: String(market.inventoryNumber || equipment.code || "").trim(),
                    location: String(market.hospital || (meta as any).executionPlace || equipment.location || "").trim()
                },
                scheduledDate: visitDate.date.toISOString()
            }));
        });

        const countedVisitKeys = new Set<string>();
        const completedVisitKeys = new Set<string>();
        let appelsOffreTechnicalVisitsToDo = 0;

        parsedAppelsOffreVisits.forEach((visit) => {
            const dateKey = getVisitDateKey(visit.scheduledDate);
            if (!dateKey) return;
            const key = `${Number(visit.equipmentId || 0) || 0}-${dateKey}`;
            if (isVisitCompleted(visit.status)) {
                completedVisitKeys.add(key);
                return;
            }
            if (countedVisitKeys.has(key)) return;
            countedVisitKeys.add(key);
            appelsOffreTechnicalVisitsToDo += 1;
        });

        appelsOffreEquipments.forEach((equipment) => {
            const meta = parseMarketMeta(equipment.invoiceUrl);
            getTechnicalVisitDateEntries((meta as any).technicalVisitDates)
                .filter((entry) => startOfLocalDay(entry.date) >= startOfDay)
                .forEach((entry) => {
                    const dateKey = getVisitDateKey(entry.date);
                    if (!dateKey) return;
                    const key = `${Number(equipment.id || 0) || 0}-${dateKey}`;
                    if (countedVisitKeys.has(key) || completedVisitKeys.has(key)) return;
                    countedVisitKeys.add(key);
                    appelsOffreTechnicalVisitsToDo += 1;
                });
        });
        const technicalVisitAlertLimit = new Date(startOfDay);
        technicalVisitAlertLimit.setDate(technicalVisitAlertLimit.getDate() + 2);
        const technicalVisitAlerts = technicalVisitRows.filter((visit) => {
            const visitDay = startOfLocalDay(new Date(visit.scheduledDate));
            return visitDay >= startOfDay && visitDay <= technicalVisitAlertLimit;
        });

        const stats = {
            totalAssigned: assignedTickets.length,
            urgences: assignedTickets.filter(isUrgentTicket).length,
            ticketsToday: assignedTickets.filter((ticket) => {
                const reference = getTicketTechnicianDayReferenceAt(ticket);
                const date = reference ? new Date(reference) : null;
                return Boolean(date && date >= startOfDay && date <= endOfDay);
            }).length,
            ticketsSite: assignedTickets.filter((ticket) => (ticket.interventionType || ticket.reclamation?.interventionType) === "SUR SITE").length,
            ticketsAtelier: assignedTickets.filter((ticket) => (ticket.interventionType || ticket.reclamation?.interventionType) === "EN ATELIER").length,
            waitingForDiagnosis: assignedTickets.filter((ticket) => ticket.status === "DIAGNOSTIC").length,
            waitingForParts: assignedTickets.filter((ticket) => ticket.status === "PENDING_PARTS").length,
            inRepair: assignedTickets.filter((ticket) => ticket.status === "REPAIR").length,
            toTest: assignedTickets.filter((ticket) => ticket.status === "QUALITY_TEST").length,
            readyToClose: assignedTickets.filter((ticket) => ticket.status === "READY_FOR_DELIVERY").length,
            overdue: assignedTickets.filter((ticket) => ticket.estimatedEndDate && new Date(ticket.estimatedEndDate) < now).length,
            preventiveVisitsSoon: maintenanceVisitsSoon.filter((maintenance) => String(maintenance.type || "").toUpperCase() === "PREVENTIVE").length,
            correctiveVisitsSoon: maintenanceVisitsSoon.filter((maintenance) => String(maintenance.type || "").toUpperCase() === "CORRECTIVE").length,
            appelsOffrePreventiveVisitsSoon: aoUpcomingVisits.filter((visit) => visit.metadata.visitKind === "PREVENTIVE" && isUpcomingWithinDays(visit.scheduledDate, 2)).length,
            appelsOffreCorrectiveVisitsSoon: aoUpcomingVisits.filter((visit) => visit.metadata.visitKind === "CORRECTIVE" && isUpcomingWithinDays(visit.scheduledDate, 2)).length,
            appelsOffreTechnicalVisitsToDo
        };

        const ticketAlerts = assignedTickets
            .filter((ticket) => {
                const assignedAt = getLatestTechnicianAssignmentAt(ticket);
                const assignedDate = assignedAt ? new Date(assignedAt) : null;
                const newlyAssignedToday = Boolean(assignedDate && assignedDate >= startOfDay && assignedDate <= endOfDay);
                return newlyAssignedToday || isUrgentTicket(ticket) || (ticket.estimatedEndDate && new Date(ticket.estimatedEndDate) < now);
            })
            .map((ticket) => ({
                ...ticket,
                alertKind: "TICKET",
                title: (() => {
                    const assignedAt = getLatestTechnicianAssignmentAt(ticket);
                    const assignedDate = assignedAt ? new Date(assignedAt) : null;
                    const newlyAssignedToday = Boolean(assignedDate && assignedDate >= startOfDay && assignedDate <= endOfDay);
                    return newlyAssignedToday ? `Nouveau ticket affecté aujourd'hui: #${(ticket as any).ticketReference || (ticket as any).displayId || ticket.id}` : ticket.title;
                })()
            }));

        const quoteApprovedAlerts = sharedAlertTickets
            .filter((ticket) => hasPendingQuoteApprovedAlert(ticket))
            .map((ticket) => ({
                ...ticket,
                alertKind: "QUOTE_APPROVED",
                title: "Devis validé par le client"
            }));

        const repairStatusStaleAlerts = assignedTickets
            .filter((ticket) => hasTechnicianRepairStatusStaleAlert(ticket, 7))
            .map((ticket) => ({
                ...ticket,
                alertKind: "REPAIR_STATUS_STALE",
                title: `État de réparation à mettre à jour: ticket #${(ticket as any).ticketReference || (ticket as any).displayId || ticket.id}`,
                statusReferenceAt: getTechnicianRepairStatusReferenceAt(ticket)
            }));

        const maintenanceAlerts = maintenanceVisitsSoon.map((maintenance) => {
            const noteMeta = parseMaintenanceNotes(maintenance.notes);
            const remainingDays = getMaintenanceAlertWindowDays(maintenance.scheduledDate);
            const visitKindLabel = String(maintenance.type || "").toUpperCase() === "CORRECTIVE" ? "Visite corrective" : "Visite préventive";
            return {
                id: `maintenance-${maintenance.id}`,
                alertKind: "MAINTENANCE",
                title: `${visitKindLabel} à préparer${remainingDays !== null ? ` (${Math.max(0, Math.ceil(remainingDays))} j)` : ""}`,
                priority: "MAINTENANCE",
                equipment: maintenance.equipment,
                scheduledDate: maintenance.scheduledDate,
                maintenanceId: maintenance.id,
                visitKindLabel,
                coverageLabel: noteMeta.coverage ? MAINTENANCE_COVERAGE_LABELS[noteMeta.coverage] : null,
                planningLabel: noteMeta.planning ? PREVENTIVE_PLANNING_LABELS[noteMeta.planning] : null
            };
        });

        const appelsOffreAlerts = aoUpcomingVisits
            .filter((maintenance) => isUpcomingWithinDays(maintenance.scheduledDate, 2))
            .map((maintenance) => {
                const remainingDays = getMaintenanceAlertWindowDays(maintenance.scheduledDate);
                const visitKindLabel = getAppelsOffreVisitKindLabel(maintenance.metadata.visitKind);
                return {
                    id: `ao-maintenance-${maintenance.id}`,
                    alertKind: "APPEL_OFFRE_VISIT",
                    title: `Appel d'offre: ${visitKindLabel.toLowerCase()} à préparer${remainingDays !== null ? ` (${Math.max(0, Math.ceil(remainingDays))} j)` : ""}`,
                    priority: "APPEL_OFFRE",
                    equipment: maintenance.equipment,
                    scheduledDate: maintenance.scheduledDate,
                    maintenanceId: maintenance.id,
                    planningLabel: maintenance.metadata.cadence,
                    visitKindLabel,
                    assignedManagerName: maintenance.metadata.assignedManagerName,
                    assignedTechnicianName: maintenance.metadata.assignedTechnicianName
                };
            });

        const alerts = [
            ...technicalVisitAlerts,
            ...quoteApprovedAlerts,
            ...appelsOffreAlerts,
            ...maintenanceAlerts,
            ...repairStatusStaleAlerts,
            ...ticketAlerts
        ];

        return NextResponse.json({
            stats,
            interventions,
            assignedTickets,
            aoUpcomingVisits,
            alerts
        });
    } catch (error: any) {
        console.error("Dashboard Technician Error:", error.message);
        return NextResponse.json({ error: "Failed to load dashboard data" }, { status: 500 });
    }
}


