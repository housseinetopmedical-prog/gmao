import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getFallbackUserId(userId: number) {
    const privilegedFallback = await prisma.user.findFirst({
        where: {
            id: { not: userId },
            role: { in: ["ADMIN", "ADV", "RESPONSABLE_TECHNIQUE", "MAGASINIER"] }
        },
        select: { id: true },
        orderBy: { id: "asc" }
    });

    if (privilegedFallback) return privilegedFallback.id;

    const anyFallback = await prisma.user.findFirst({
        where: { id: { not: userId } },
        select: { id: true },
        orderBy: { id: "asc" }
    });

    return anyFallback?.id ?? null;
}

export async function GET() {
    try {
        const technicians = await prisma.user.findMany({
            where: {
                role: "TECHNICIAN"
            },
            include: {
                ticket_ticket_assignedToIdTouser: {
                    where: {
                        status: {
                            notIn: ["CLOSED", "READY_FOR_DELIVERY"]
                        },
                        savHistory: {
                            none: {
                                action: "FINAL_OUTCOME_NON_REPARE"
                            }
                        }
                    }
                },
                maintenance: {
                    where: {
                        status: "PLANNED"
                    }
                }
            }
        });

        // Map to include workload counts
        const techData = technicians.map((tech: any) => ({
            id: tech.id,
            name: tech.name,
            email: tech.email,
            role: tech.role,
            workload: (tech.ticket_ticket_assignedToIdTouser?.length || 0) + (tech.maintenance?.length || 0),
            activeTickets: tech.ticket_ticket_assignedToIdTouser?.length || 0,
            plannedMaintenances: tech.maintenance?.length || 0
        }));

        return NextResponse.json(techData, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, email, password, role } = body;

        const technician = await prisma.user.create({
            data: {
                name,
                email,
                password, // In real app, hash this
                role: role || "TECHNICIAN",
            },
        });

        return NextResponse.json(technician);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, name, email, role } = body;

        const technician = await prisma.user.update({
            where: { id: Number(id) },
            data: { name, email, role },
        });

        return NextResponse.json(technician);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) return NextResponse.json({ error: "ID manquant" }, { status: 400 });

        const userId = Number(id);
        const fallbackUserId = await getFallbackUserId(userId);

        if (!fallbackUserId) {
            return NextResponse.json(
                { error: "Suppression impossible: aucun autre utilisateur disponible pour reprendre les références." },
                { status: 400 }
            );
        }

        await prisma.$transaction(async (tx) => {
            await tx.ticket.updateMany({
                where: { assignedToId: userId },
                data: { assignedToId: null }
            });

            await tx.ticket.updateMany({
                where: { advId: userId },
                data: { advId: fallbackUserId }
            });

            await tx.ticket.updateMany({
                where: { creatorId: userId },
                data: { creatorId: fallbackUserId }
            });

            await tx.sav_history.updateMany({
                where: { userId },
                data: { userId: fallbackUserId }
            });

            await tx.equipment_document.updateMany({
                where: { uploadedBy: userId },
                data: { uploadedBy: fallbackUserId }
            });

            await tx.purchase_order.updateMany({
                where: { creatorId: userId },
                data: { creatorId: fallbackUserId }
            });

            await tx.ticket_interne.updateMany({
                where: { createurId: userId },
                data: { createurId: fallbackUserId }
            });

            await tx.message_ticket_interne.updateMany({
                where: { expediteurId: userId },
                data: { expediteurId: fallbackUserId }
            });

            await tx.stock_movement.updateMany({
                where: { technicianId: userId },
                data: { technicianId: null }
            });

            await tx.maintenance.deleteMany({ where: { technicianId: userId } });
            await tx.user.delete({ where: { id: userId } });
        });

        return NextResponse.json({ message: "Supprimé avec succès" });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}



