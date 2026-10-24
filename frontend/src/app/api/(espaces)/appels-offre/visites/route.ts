import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseAppelsOffreVisitNotes } from "@/metier/workflow-appels-offre";

function clean(raw: unknown) {
    return String(raw || "").trim();
}

function parseOptionalDate(raw: unknown) {
    const value = clean(raw);
    if (!value) return null;
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateCollection(raw: unknown) {
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item) => parseOptionalDate(item))
        .filter((item): item is Date => Boolean(item));
}

function firstDate(...values: Array<Date | null>) {
    return values.find(Boolean) || new Date();
}

async function resolveDispatchTargets() {
    const [manager, technician, fallbackUser] = await Promise.all([
        prisma.user.findFirst({
            where: { role: "RESPONSABLE_TECHNIQUE" },
            select: { id: true, name: true },
            orderBy: { id: "asc" }
        }),
        prisma.user.findFirst({
            where: { role: "TECHNICIAN" },
            select: { id: true, name: true },
            orderBy: { id: "asc" }
        }),
        prisma.user.findFirst({
            where: { role: { in: ["ADMIN", "ADV", "MAGASINIER"] } },
            select: { id: true, name: true },
            orderBy: { id: "asc" }
        })
    ]);

    const effectiveTechnicianId = technician?.id || manager?.id || fallbackUser?.id || null;
    if (!effectiveTechnicianId) {
        throw new Error("Aucun responsable technique ou technicien disponible pour recevoir la visite.");
    }

    return {
        managerId: manager?.id || null,
        managerName: manager?.name || null,
        technicianId: technician?.id || null,
        technicianName: technician?.name || null,
        effectiveTechnicianId
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const type = clean(searchParams.get("type")).toUpperCase();
        const visitType = type === "CORRECTIVE" ? "CORRECTIVE" : type === "PREVENTIVE" ? "PREVENTIVE" : "";

        const maintenances = await prisma.maintenance.findMany({
            where: visitType ? { type: visitType } : undefined,
            include: {
                equipment: true
            },
            orderBy: { createdAt: "desc" },
            take: 120
        });

        return NextResponse.json(
            maintenances
                .map((item) => ({
                    ...item,
                    metadata: parseAppelsOffreVisitNotes(item.notes)
                }))
                .filter((item) => Boolean(item.metadata))
        );
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Chargement impossible." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const equipmentId = Number(body.equipmentId);
        const actorId = Number(body.actorId || body.technicianId || 1) || 1;
        const visitKind = clean(body.visitKind).toUpperCase();
        const dispatchTargets = await resolveDispatchTargets();

        if (!equipmentId) {
            return NextResponse.json({ error: "Équipement requis." }, { status: 400 });
        }

        if (visitKind === "PREVENTIVE") {
            const plannedDates = parseDateCollection(body.plannedDates);
            const fallbackPlannedAt = parseOptionalDate(body.plannedAt);
            const normalizedDates = plannedDates.length > 0
                ? plannedDates
                : fallbackPlannedAt
                  ? [fallbackPlannedAt]
                  : [];
            const cadence = clean(body.cadence);
            if (normalizedDates.length === 0 || !cadence) {
                return NextResponse.json({ error: "Date de planification MP et cadence sont obligatoires." }, { status: 400 });
            }

            const maintenance = await prisma.$transaction(async (tx) => {
                const created = [];
                for (const plannedAt of normalizedDates) {
                    const row = await tx.maintenance.create({
                        data: {
                            equipmentId,
                            type: "PREVENTIVE",
                            scheduledDate: plannedAt,
                            technicianId: dispatchTargets.effectiveTechnicianId,
                            status: "PLANNED",
                            notes: JSON.stringify({
                                source: "APPEL_OFFRE",
                                visitKind: "PREVENTIVE",
                                plannedAt: plannedAt.toISOString(),
                                cadence,
                                comment: clean(body.comment) || null,
                                plannedDates: normalizedDates.map((item) => item.toISOString()),
                                createdById: actorId,
                                createdByLabel: "Responsable appels d'offre",
                                assignedManagerId: dispatchTargets.managerId,
                                assignedManagerName: dispatchTargets.managerName,
                                assignedTechnicianId: dispatchTargets.technicianId,
                                assignedTechnicianName: dispatchTargets.technicianName
                            })
                        },
                        include: { equipment: true }
                    });
                    created.push(row);
                }
                return created;
            });

            return NextResponse.json(maintenance);
        }

        if (visitKind === "CORRECTIVE") {
            const callDate = parseOptionalDate(body.callDate);
            const interventionDate = parseOptionalDate(body.interventionDate);
            const materialReturnDate = parseOptionalDate(body.materialReturnDate);
            const materialRecoveryDate = parseOptionalDate(body.materialRecoveryDate);

            const maintenance = await prisma.maintenance.create({
                data: {
                    equipmentId,
                    type: "CORRECTIVE",
                    scheduledDate: firstDate(interventionDate, callDate, materialReturnDate, materialRecoveryDate),
                    technicianId: dispatchTargets.effectiveTechnicianId,
                    status: "PLANNED",
                    notes: JSON.stringify({
                        source: "APPEL_OFFRE",
                        visitKind: "CORRECTIVE",
                        callDate: callDate?.toISOString() || null,
                        interventionDate: interventionDate?.toISOString() || null,
                        materialReturnDate: materialReturnDate?.toISOString() || null,
                        materialRecoveryDate: materialRecoveryDate?.toISOString() || null,
                        comment: clean(body.comment) || null,
                        createdById: actorId,
                        createdByLabel: "Responsable appels d'offre",
                        assignedManagerId: dispatchTargets.managerId,
                        assignedManagerName: dispatchTargets.managerName,
                        assignedTechnicianId: dispatchTargets.technicianId,
                        assignedTechnicianName: dispatchTargets.technicianName
                    })
                },
                include: { equipment: true }
            });

            return NextResponse.json(maintenance);
        }

        return NextResponse.json({ error: "Type de visite invalide." }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Enregistrement impossible." }, { status: 500 });
    }
}


