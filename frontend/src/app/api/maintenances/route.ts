import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { buildMaintenanceNotes, parseMaintenanceNotes } from "@/metier/workflow-maintenance";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const technicianIdRaw = searchParams.get("technicianId");
        const technicianId = technicianIdRaw ? Number(technicianIdRaw) : null;

        const maintenances = await prisma.maintenance.findMany({
            where: technicianId && Number.isFinite(technicianId)
                ? { technicianId }
                : undefined,
            include: {
                equipment: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                },
            },
            orderBy: {
                scheduledDate: "asc",
            },
        });
        return NextResponse.json(
            maintenances.map((item) => {
                const parsedNotes = parseMaintenanceNotes(item.notes);
                const displayNotes = parsedNotes.instructions || String(item.notes || "").trim();
                return {
                    ...item,
                    technician: item.user,
                    coverage: parsedNotes.coverage,
                    planning: parsedNotes.planning,
                    notes: displayNotes
                };
            })
        );
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { equipmentId, type, scheduledDate, technicianId, notes, status, coverage, planning } = body;

        const formattedNotes = buildMaintenanceNotes({
            coverage,
            planning,
            instructions: notes
        });

        const maintenance = await prisma.maintenance.create({
            data: {
                equipmentId: Number(equipmentId),
                type,
                scheduledDate: new Date(scheduledDate),
                technicianId: Number(technicianId) || 1, // Fallback
                notes: formattedNotes || String(notes || "").trim() || null,
                status: status || "PLANNED",
            },
            include: {
                equipment: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true
                    }
                }
            }
        });

        const parsedNotes = parseMaintenanceNotes(maintenance.notes);
        return NextResponse.json({
            ...maintenance,
            technician: maintenance.user,
            coverage: parsedNotes.coverage,
            planning: parsedNotes.planning,
            notes: parsedNotes.instructions || String(maintenance.notes || "").trim()
        });
    } catch (error: any) {
        console.error("Erreur creation maintenance:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


