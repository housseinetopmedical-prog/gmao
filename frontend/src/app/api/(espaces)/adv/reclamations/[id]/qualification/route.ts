import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";

type QualificationDocument = {
    id?: string;
    url?: string;
    name: string;
    type?: string;
    size?: number;
};

function yesNoLabel(value: boolean | null) {
    if (value === null) return "";
    return value ? "Oui" : "Non";
}

function normalizeDocuments(raw: unknown): QualificationDocument[] {
    if (!Array.isArray(raw)) return [];
    const rows = raw
        .filter((item) => item && typeof item === "object" && typeof (item as any).name === "string")
        .map((item) => ({
            id: typeof (item as any).id === "string" ? (item as any).id : undefined,
            url: typeof (item as any).url === "string" ? (item as any).url : undefined,
            name: String((item as any).name),
            type: typeof (item as any).type === "string" ? (item as any).type : undefined,
            size: typeof (item as any).size === "number" ? (item as any).size : undefined
        }));

    const dedup = new Map<string, QualificationDocument>();
    rows.forEach((doc) => {
        const rawUrl = String(doc.url || "").toLowerCase();
        const base = decodeURIComponent(rawUrl.split("?")[0].split("#")[0].split("/").pop() || String(doc.name || "").toLowerCase())
            .replace(/^\d{10,}-[a-z0-9]+-/i, "")
            .replace(/\(\d+\)(?=\.[a-z0-9]+$)/i, "");
        if (!base) return;
        if (!dedup.has(base)) {
            dedup.set(base, doc);
        }
    });
    return Array.from(dedup.values());
}

function getUrgencyPriorityFromChecklist(rawChecklist: string | null | undefined): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (!rawChecklist || typeof rawChecklist !== "string") return "MEDIUM";
    try {
        const parsed = JSON.parse(rawChecklist);
        const metadata = parsed?.metadata;
        const selectedPriority = String(metadata?.entryRepairSlip?.priority || metadata?.ticketPriority || "").toUpperCase();
        if (selectedPriority === "LOW" || selectedPriority === "MEDIUM" || selectedPriority === "HIGH" || selectedPriority === "CRITICAL") {
            return selectedPriority;
        }
        const urgency = String(metadata?.urgency || "").toUpperCase();
        if (urgency === "LOW" || urgency === "MEDIUM" || urgency === "HIGH" || urgency === "CRITICAL") {
            return urgency;
        }
    } catch {
        // fallback below
    }
    return "MEDIUM";
}

async function createHistoryIfMissing(params: {
    ticketId: number;
    equipmentId: number;
    userId: number;
    action: string;
    note: string;
}) {
    const exists = await prisma.sav_history.findFirst({
        where: {
            ticketId: params.ticketId,
            action: params.action,
            note: params.note
        },
        select: { id: true }
    });

    if (exists) return;

    await prisma.sav_history.create({
        data: {
            ticketId: params.ticketId,
            equipmentId: params.equipmentId,
            userId: params.userId,
            action: params.action,
            note: params.note
        }
    });
}

export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "ID reclamation invalide." }, { status: 400 });
        }

        const body = await req.json();
        const advId = body?.advId ? Number(body.advId) : 1;
        const infoVerified = body?.infoVerified === undefined ? null : Boolean(body.infoVerified);
        const breCode = String(body?.breCode || "").trim();
        const warrantyStatus = String(body?.warrantyStatus || "").trim().toUpperCase();
        const qualificationDocuments = normalizeDocuments(body?.qualificationDocuments);

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Reclamation introuvable." }, { status: 404 });
        }

        const equipment = await ensureEquipmentForReclamation(reclamation);

        const derivedPriority = getUrgencyPriorityFromChecklist(reclamation.checklist);
        if (!reclamation.ticketId) {
            await resetTicketAutoIncrementIfEmpty();
        }

        const ticket = reclamation.ticketId
            ? await prisma.ticket.update({
                  where: { id: reclamation.ticketId },
                  data: {
                      status: "QUALIFICATION",
                      priority: derivedPriority,
                      advId: advId || reclamation.ticket?.creatorId || 1
                  }
              })
            : await prisma.ticket.create({
                  data: {
                      title: "Ticket d'intervention",
                      description: reclamation.description,
                      priority: derivedPriority,
                      status: "QUALIFICATION",
                      equipmentId: equipment.id,
                      creatorId: advId || 1,
                      advId: advId || 1,
                      assignedToId: null,
                      contactName: reclamation.customerName,
                      contactPhone: reclamation.phone,
                      interventionType: reclamation.interventionType || "SITE"
                  }
              });

        const checklist = parseChecklistPayload(reclamation.checklist);

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                status: "PENDING_ADV_VERIFICATION",
                ticketId: ticket.id,
                checklist: stringifyChecklistPayload({
                    sosAnswers: checklist.sosAnswers || {},
                    metadata: {
                        ...(checklist.metadata || {}),
                        merchandiseInfo: {
                            ...(((checklist.metadata as any)?.merchandiseInfo || {}) as Record<string, unknown>),
                            ...(warrantyStatus === "UNDER_WARRANTY" || warrantyStatus === "OUT_OF_WARRANTY" ? { warrantyStatus } : {})
                        },
                        ...(breCode ? { breCode } : {})
                    }
                })
            }
        });

        const qualificationNote = [
            warrantyStatus === "UNDER_WARRANTY" ? "Décision ADV: Sous garantie" : "",
            warrantyStatus === "OUT_OF_WARRANTY" ? "Décision ADV: Hors garantie" : "",
            breCode ? `Code BRE: ${breCode}` : "",
            infoVerified === null ? "" : `Infos verifiees: ${yesNoLabel(infoVerified)}`,
            "Etape suivante: Informations propres au dépôt principal"
        ]
            .filter(Boolean)
            .join("\n");

        if (qualificationNote) {
            await createHistoryIfMissing({
                ticketId: ticket.id,
                equipmentId: equipment.id,
                userId: advId || 1,
                action: "ADV_QUALIFICATION",
                note: qualificationNote
            });
        }

        if (qualificationDocuments.length > 0) {
            const docsNote = JSON.stringify({
                documents: qualificationDocuments
            });

            await createHistoryIfMissing({
                ticketId: ticket.id,
                equipmentId: equipment.id,
                userId: advId || 1,
                action: "ADV_QUALIFICATION_DOCUMENTS",
                note: docsNote
            });
        }

        return NextResponse.json({
            success: true,
            ticketId: ticket.id
        });
    } catch (error: any) {
        console.error("ADV qualification prepare error:", error);
        return NextResponse.json({ error: error?.message || "Erreur interne qualification." }, { status: 500 });
    }
}


