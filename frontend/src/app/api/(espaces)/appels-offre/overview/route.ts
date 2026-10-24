import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/metier/base-donnees";
import { isUpcomingWithinDays, parseAppelsOffreVisitNotes } from "@/metier/workflow-appels-offre";

function parseMarketMeta(raw: unknown) {
    try {
        const parsed = JSON.parse(String(raw || ""));
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function formatEquipment(item: any) {
    const meta = parseMarketMeta(item.invoiceUrl);
    return {
        ...item,
        marketMeta: meta,
        marketNumber: String(item.blNumber || "").trim(),
        organism: String(item.client || "").trim(),
        city: String((meta as any).city || "").trim(),
        hospital: String((meta as any).hospital || item.location || "").trim(),
        inventoryNumber: String((meta as any).inventoryNumber || item.code || "").trim()
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const summary = searchParams.get("summary") === "1";
        const [equipments, markets, maintenances] = await Promise.all([
            prisma.equipment.findMany({
                where: { type: "APPEL_OFFRE" },
                orderBy: { createdAt: "desc" },
                take: summary ? 1 : 250
            }),
            prisma.$queryRaw<any[]>`
                SELECT
                    id,
                    equipmentId,
                    organism,
                    marketNumber,
                    lot,
                    designation AS name,
                    brand,
                    model,
                    serialNumber,
                    inventoryNumber AS code,
                    inventoryNumber,
                    articleCode,
                    hospital AS location,
                    hospital,
                    city,
                    sector AS service,
                    sector,
                    contractType,
                    contractStartDate,
                    contractEndDate,
                    documentUrl AS blDocumentUrl,
                    createdAt,
                    updatedAt
                FROM marches
                ORDER BY createdAt DESC, id DESC
                LIMIT ${summary ? 1 : 250}
            `,
            prisma.maintenance.findMany({
                include: {
                    equipment: summary
                        ? {
                              select: {
                                  id: true,
                                  name: true,
                                  serialNumber: true,
                                  client: true
                              }
                          }
                        : true
                },
                orderBy: { scheduledDate: "asc" },
                take: summary ? 120 : 400
            })
        ]);
        const marketCount = markets.length;

        const visits = maintenances
            .map((item) => {
                const metadata = parseAppelsOffreVisitNotes(item.notes);
                if (!metadata) return null;

                return {
                    ...item,
                    metadata
                };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item));

        const preventiveVisits = visits.filter((item) => item.metadata.visitKind === "PREVENTIVE");
        const correctiveVisits = visits.filter((item) => item.metadata.visitKind === "CORRECTIVE");
        const visitsSoon = visits.filter((item) => item.metadata.visitKind === "PREVENTIVE" && isUpcomingWithinDays(item.scheduledDate, 2));

        if (summary) {
            return NextResponse.json({
                stats: {
                    equipmentCount: marketCount,
                    visitCount: visits.length,
                    preventiveCount: preventiveVisits.length,
                    correctiveCount: correctiveVisits.length,
                    visitsSoonCount: visitsSoon.length
                },
                visits
            });
        }

        return NextResponse.json({
            stats: {
                equipmentCount: marketCount,
                visitCount: visits.length,
                preventiveCount: preventiveVisits.length,
                correctiveCount: correctiveVisits.length,
                visitsSoonCount: visitsSoon.length
            },
            equipments: equipments.map(formatEquipment),
            visits,
            preventiveVisits,
            correctiveVisits,
            visitsSoon
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Chargement impossible." }, { status: 500 });
    }
}


