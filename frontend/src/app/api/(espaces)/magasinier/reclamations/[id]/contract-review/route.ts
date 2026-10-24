import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";
import { getRequestUserContext } from "@/metier/utilisateur-requete";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";

type IncomingDocument = {
    id?: string;
    url?: string;
    name?: string;
    type?: string;
};

type ContractAction = "SAVE_DRAFT" | "RETURN_INCOMPLETE" | "VALIDATE_AND_FORWARD" | "RESEND_TO_ADV";

const ACTION_TO_HISTORY: Record<ContractAction, string> = {
    SAVE_DRAFT: "MAGASINIER_CONTRACT_REVIEW_SAVED",
    RETURN_INCOMPLETE: "MAGASINIER_CONTRACT_REVIEW_RETURNED",
    VALIDATE_AND_FORWARD: "MAGASINIER_CONTRACT_REVIEW_VALIDATED",
    RESEND_TO_ADV: "MAGASINIER_CONTRACT_REVIEW_RESENT_TO_ADV"
};

function normalizeDocuments(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item): item is IncomingDocument => Boolean(item && typeof item === "object"))
        .filter((item) => typeof item.name === "string" && String(item.name).trim().length > 0)
        .map((item) => ({
            id: typeof item.id === "string" ? item.id : undefined,
            dataUrl: typeof item.url === "string" ? item.url : undefined,
            name: String(item.name),
            type: typeof item.type === "string" ? item.type : undefined,
            kind: "DOCUMENT" as const
        }));
}

function normalizeAction(raw: unknown): ContractAction {
    const action = String(raw || "VALIDATE_AND_FORWARD").trim().toUpperCase();
    if (action === "SAVE_DRAFT") return "SAVE_DRAFT";
    if (action === "RETURN_INCOMPLETE") return "RETURN_INCOMPLETE";
    if (action === "RESEND_TO_ADV") return "RESEND_TO_ADV";
    return "VALIDATE_AND_FORWARD";
}

function normalizeDate(raw: unknown) {
    const value = typeof raw === "string" ? raw.trim() : "";
    return value.length > 0 ? value : null;
}

function normalizeMerchandiseValue(raw: unknown) {
    const value = typeof raw === "string" ? raw.trim() : "";
    return value.length > 0 ? value : null;
}

function parseWarrantyMonths(raw: unknown) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return null;
    const yearMatch = value.match(/(\d+)\s*(an|ans|annee|annees|année|années)/i);
    if (yearMatch) return Number(yearMatch[1]) * 12;
    const monthMatch = value.match(/(\d+)\s*(mois|month|months)/i);
    if (monthMatch) return Number(monthMatch[1]);
    const numberMatch = value.match(/\d+/);
    return numberMatch ? Number(numberMatch[0]) : null;
}

function calculateWarrantyLimitDate(shippingDate: unknown, warrantyLabel: unknown) {
    const normalizedShippingDate = normalizeDate(shippingDate);
    const months = parseWarrantyMonths(warrantyLabel);
    if (!normalizedShippingDate || !months) return null;
    const date = new Date(`${normalizedShippingDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

function normalizeEquipmentMerchandiseItems(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item) => Boolean(item && typeof item === "object"))
        .map((item: any, index) => {
            const warrantyLabel = normalizeMerchandiseValue(item.warrantyLabel);
            const shippingDate = normalizeDate(item.shippingDate);
            return {
                entryId: typeof item.entryId === "string" && item.entryId.trim().length > 0
                    ? item.entryId.trim()
                    : `${Number.isFinite(Number(item.materialIndex ?? item.index)) ? Number(item.materialIndex ?? item.index) : index}-${index}`,
                materialIndex: Number.isFinite(Number(item.materialIndex ?? item.index)) ? Number(item.materialIndex ?? item.index) : index,
                index: Number.isFinite(Number(item.index)) ? Number(item.index) : index,
                label: normalizeMerchandiseValue(item.label) || `Matériel ${index + 1}`,
                quantity: Math.max(1, Number(item.quantity || 1) || 1),
                supplier: normalizeMerchandiseValue(item.supplier || item.fournisseur),
                articleCode: normalizeMerchandiseValue(item.articleCode),
                warrantyLabel,
                invoiceDate: normalizeDate(item.invoiceDate),
                shippingDate,
                warrantyLimitDate: calculateWarrantyLimitDate(shippingDate, warrantyLabel)
            };
        });
}

async function ensureTicketForReclamation(reclamationId: number, userId: number) {
    const reclamation = await prisma.reclamation.findUnique({
        where: { id: reclamationId },
        include: { ticket: true }
    });

    if (!reclamation) return null;
    if (reclamation.ticket) return { reclamation, ticket: reclamation.ticket };

    const equipment = await ensureEquipmentForReclamation(reclamation);

    await resetTicketAutoIncrementIfEmpty();

    const createdTicket = await prisma.ticket.create({
        data: {
            title: `Demande d'intervention : ${reclamation.customerName}`,
            description: reclamation.description,
            priority: "MEDIUM",
            status: "QUALIFICATION",
            equipmentId: equipment.id,
            creatorId: userId,
            advId: userId,
            assignedToId: null,
            contactName: reclamation.customerName,
            contactPhone: reclamation.phone,
            interventionType: reclamation.interventionType || "SITE"
        }
    });

    const updatedReclamation = await prisma.reclamation.update({
        where: { id: reclamation.id },
        data: { ticketId: createdTicket.id }
    });

    return { reclamation: updatedReclamation, ticket: createdTicket };
}

export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "ID de demande invalide." }, { status: 400 });
        }

        const body = await req.json();
        const headerUser = getRequestUserContext(req);
        const userId = Number(body?.userId || headerUser.userId || 0);
        const actionType = normalizeAction(body?.actionType);
        const note = typeof body?.note === "string" ? body.note.trim() : "";
        const warrantyLabel = normalizeMerchandiseValue(body?.warrantyLabel);
        const hasContractualDocumentsPayload = Array.isArray(body?.contractualDocuments);
        const incomingDocuments = normalizeDocuments(body?.contractualDocuments);
        const merchandiseInfoIncoming = {
            articleCode: normalizeMerchandiseValue(body?.articleCode),
            warrantyLabel,
            invoiceDate: normalizeDate(body?.invoiceDate),
            shippingDate: normalizeDate(body?.shippingDate),
            warrantyLimitDate: calculateWarrantyLimitDate(body?.shippingDate, warrantyLabel),
            equipmentMerchandiseItems: normalizeEquipmentMerchandiseItems(body?.equipmentMerchandiseItems)
        };

        if (!userId) {
            return NextResponse.json({ error: "Utilisateur magasinier requis." }, { status: 400 });
        }

        if (headerUser.role && headerUser.role !== "MAGASINIER" && headerUser.role !== "ADMIN") {
            return NextResponse.json({ error: "Action non autorisée pour ce rôle." }, { status: 403 });
        }

        const ensured = await ensureTicketForReclamation(reclamationId, userId);

        if (!ensured) {
            return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
        }

        const { reclamation, ticket } = ensured;

        const checklist = parseChecklistPayload(reclamation.checklist);
        const currentStoreReview = checklist?.metadata?.storeReview || {};
        const currentMerchandiseInfo =
            checklist?.metadata && typeof checklist.metadata === "object" && (checklist.metadata as any).merchandiseInfo
                ? ((checklist.metadata as any).merchandiseInfo as Record<string, unknown>)
                : {};
        const currentDocuments = Array.isArray(currentStoreReview?.contractualDocuments)
            ? currentStoreReview.contractualDocuments
            : [];

        const mergedDocuments = hasContractualDocumentsPayload ? incomingDocuments : currentDocuments;
        const mergedNote = note || currentStoreReview.note || "";
        const mergedMerchandiseInfo = {
            ...currentMerchandiseInfo,
            articleCode: merchandiseInfoIncoming.equipmentMerchandiseItems.map((item) => item.articleCode).filter(Boolean).join(" | ") || merchandiseInfoIncoming.articleCode || String(currentMerchandiseInfo.articleCode || "") || null,
            supplier: merchandiseInfoIncoming.equipmentMerchandiseItems.map((item) => item.supplier).filter(Boolean).join(" | ") || String((currentMerchandiseInfo as any).supplier || "") || null,
            warrantyLabel: merchandiseInfoIncoming.equipmentMerchandiseItems.map((item) => `${item.label}: ${item.warrantyLabel || "-"}`).join(" | ") || merchandiseInfoIncoming.warrantyLabel || String(currentMerchandiseInfo.warrantyLabel || "") || null,
            invoiceDate: merchandiseInfoIncoming.equipmentMerchandiseItems[0]?.invoiceDate || merchandiseInfoIncoming.invoiceDate || String(currentMerchandiseInfo.invoiceDate || "") || null,
            shippingDate: merchandiseInfoIncoming.equipmentMerchandiseItems[0]?.shippingDate || merchandiseInfoIncoming.shippingDate || String(currentMerchandiseInfo.shippingDate || "") || null,
            warrantyLimitDate: merchandiseInfoIncoming.equipmentMerchandiseItems[0]?.warrantyLimitDate || merchandiseInfoIncoming.warrantyLimitDate || String(currentMerchandiseInfo.warrantyLimitDate || "") || null,
            equipmentMerchandiseItems: merchandiseInfoIncoming.equipmentMerchandiseItems.length > 0
                ? merchandiseInfoIncoming.equipmentMerchandiseItems
                : Array.isArray((currentMerchandiseInfo as any).equipmentMerchandiseItems)
                    ? (currentMerchandiseInfo as any).equipmentMerchandiseItems
                    : []
        };

        if (actionType === "VALIDATE_AND_FORWARD") {
            const perEquipment = Array.isArray((mergedMerchandiseInfo as any).equipmentMerchandiseItems) ? (mergedMerchandiseInfo as any).equipmentMerchandiseItems : [];
            const allEquipmentComplete = perEquipment.length > 0 && perEquipment.every((item: any) => item.warrantyLabel && item.invoiceDate && item.shippingDate);
            if (!allEquipmentComplete) {
                return NextResponse.json({ error: "Garantie, date facture et date d'expédition sont requises pour chaque matériel." }, { status: 400 });
            }
        }

        if (actionType === "RETURN_INCOMPLETE" && !mergedNote) {
            return NextResponse.json({ error: "Ajoutez une note avant de retourner le dossier." }, { status: 400 });
        }

        const mergedChecklist = {
            ...checklist,
            metadata: {
                ...(checklist.metadata || {}),
                merchandiseInfo: {
                    ...mergedMerchandiseInfo,
                    updatedAt: new Date().toISOString(),
                    updatedByUserId: userId
                },
                storeReview: {
                    note: mergedNote,
                    contractualDocuments: mergedDocuments,
                    updatedAt: new Date().toISOString(),
                    updatedByUserId: userId,
                    lastAction: actionType
                }
            }
        };

        let nextStatus = reclamation.status;
        if (actionType === "VALIDATE_AND_FORWARD") {
            nextStatus = "READY_FOR_TECH_MANAGER_ASSIGNMENT";
        } else if (actionType === "RETURN_INCOMPLETE") {
            nextStatus = "PENDING_ADV";
        } else if (actionType === "RESEND_TO_ADV") {
            nextStatus = "PENDING_ADV";
        }

        const updated = await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                status: nextStatus,
                checklist: stringifyChecklistPayload(mergedChecklist)
            },
            include: {
                ticket: {
                    select: {
                        id: true,
                        status: true,
                        assignedToId: true
                    }
                }
            }
        });

        await prisma.sav_history.create({
            data: {
                equipmentId: ticket.equipmentId,
                ticketId: ticket.id,
                userId,
                action: ACTION_TO_HISTORY[actionType],
                note: JSON.stringify({
                    actionType,
                    note: mergedNote,
                    contractualDocuments: mergedDocuments,
                    merchandiseInfo: mergedMerchandiseInfo
                })
            }
        });

        return NextResponse.json({
            success: true,
            actionType,
            reclamation: updated
        });
    } catch (error: any) {
        console.error("Magasinier contract review error:", error);
        return NextResponse.json({ error: error?.message || "Erreur interne magasinier." }, { status: 500 });
    }
}


