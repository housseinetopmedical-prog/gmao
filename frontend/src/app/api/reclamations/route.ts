import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { Prisma } from "@prisma/client";
import { ensureEquipmentForReclamation } from "@/metier/materiel-demande";
import { isClientAttachmentExpired, parseChecklistPayload, shouldApplyRepairedTicketDocumentRetention, stringifyChecklistPayload } from "@/metier/workflow-client";
import { deleteClientAttachmentFiles, getExpiredClientAttachments } from "@/metier/nettoyage-pieces-jointes-client";
import { canReadStoreReview, getRequestUserContext } from "@/metier/utilisateur-requete";
import { resetReclamationAutoIncrementIfEmpty } from "@/metier/sequence-demande";
import { resetTicketAutoIncrementIfEmpty } from "@/metier/sequence-ticket";
import { executeKnownSchemaStatement } from "@/metier/sql-securise";
import { attachTicketAnnualReference, getTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function stripStoreReview(rawChecklist: unknown) {
    if (!rawChecklist || typeof rawChecklist !== "string") return rawChecklist;
    try {
        const parsed = JSON.parse(rawChecklist);
        if (!parsed || typeof parsed !== "object") return rawChecklist;
        const metadata = (parsed as any).metadata;
        if (!metadata || typeof metadata !== "object" || !("storeReview" in metadata)) {
            return rawChecklist;
        }
        const sanitized = {
            ...(parsed as Record<string, unknown>),
            metadata: {
                ...(metadata as Record<string, unknown>)
            }
        } as any;
        delete sanitized.metadata.storeReview;
        return JSON.stringify(sanitized);
    } catch {
        return rawChecklist;
    }
}

function parseWarrantyMonths(value: unknown) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return null;
    const yearMatch = text.match(/(\d+)\s*(an|ans|annee|annees|année|années)/i);
    if (yearMatch) return Number(yearMatch[1]) * 12;
    const monthMatch = text.match(/(\d+)\s*(mois|month|months)/i);
    if (monthMatch) return Number(monthMatch[1]);
    const numberMatch = text.match(/\d+/);
    return numberMatch ? Number(numberMatch[0]) : null;
}

function calculateWarrantyLimitDate(startDate: unknown, warrantyDuration: unknown) {
    const normalizedDate = String(startDate || "").trim();
    const months = parseWarrantyMonths(warrantyDuration);
    if (!normalizedDate || !months) return "";
    const date = new Date(`${normalizedDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

function hydrateTopMedicalWarrantyLimit(rawChecklist: unknown) {
    if (!rawChecklist || typeof rawChecklist !== "string") return rawChecklist;
    const parsed = parseChecklistPayload(rawChecklist);
    const metadata = parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata as Record<string, unknown> : {};
    const merchandiseInfo = metadata.merchandiseInfo && typeof metadata.merchandiseInfo === "object"
        ? metadata.merchandiseInfo as Record<string, unknown>
        : {};
    const topMedicalWarrantyLimit = metadata.topMedicalWarrantyLimit && typeof metadata.topMedicalWarrantyLimit === "object"
        ? metadata.topMedicalWarrantyLimit as Record<string, unknown>
        : {};
    const contractDate = String(topMedicalWarrantyLimit.contractDate || merchandiseInfo.topMedicalWarrantyContractDate || "").trim();
    const duration = String(topMedicalWarrantyLimit.duration || merchandiseInfo.topMedicalWarrantyDuration || "").trim();
    const limitDate = String(topMedicalWarrantyLimit.limitDate || merchandiseInfo.topMedicalWarrantyLimitDate || merchandiseInfo.advWarrantyLimitDate || "").trim()
        || calculateWarrantyLimitDate(contractDate, duration);
    if (!limitDate) return rawChecklist;

    const nextMerchandiseInfo = {
        ...merchandiseInfo,
        topMedicalWarrantyContractDate: contractDate || null,
        topMedicalWarrantyDuration: duration || null,
        topMedicalWarrantyLimitDate: limitDate,
        advWarrantyLimitDate: limitDate,
        equipmentMerchandiseItems: Array.isArray((merchandiseInfo as any).equipmentMerchandiseItems)
            ? ((merchandiseInfo as any).equipmentMerchandiseItems as unknown[]).map((item) => {
                if (!item || typeof item !== "object") return item;
                return {
                    ...(item as Record<string, unknown>),
                    topMedicalWarrantyContractDate: contractDate || null,
                    topMedicalWarrantyDuration: duration || null,
                    topMedicalWarrantyLimitDate: limitDate,
                    advWarrantyLimitDate: limitDate
                };
            })
            : (merchandiseInfo as any).equipmentMerchandiseItems
    };

    return stringifyChecklistPayload({
        sosAnswers: parsed.sosAnswers || {},
        metadata: {
            ...metadata,
            merchandiseInfo: nextMerchandiseInfo,
            topMedicalWarrantyLimit: {
                ...topMedicalWarrantyLimit,
                contractDate: contractDate || null,
                duration: duration || null,
                limitDate
            }
        }
    }) || rawChecklist;
}

type NormalizedAttachment = {
    name: string;
    type?: string;
    title?: string;
    kind: "DOCUMENT" | "MEDIA";
    dataUrl: string;
    sentAt: string;
};

function normalizeText(raw: unknown, maxLength = 5000) {
    return String(raw || "").trim().slice(0, maxLength);
}

function normalizeAiUrgency(raw: unknown): string | null {
    const value = normalizeText(raw, 30).toLowerCase();
    if (!value) return null;
    if (value.includes("crit")) return "critique";
    if (value.includes("élev") || value.includes("elev") || value === "high") return "élevé";
    if (value.includes("faib") || value === "low") return "faible";
    return "moyen";
}

function normalizeAiList(raw: unknown) {
    if (Array.isArray(raw)) {
        return raw.map((item) => normalizeText(item, 500)).filter(Boolean).slice(0, 10);
    }
    const value = normalizeText(raw, 4000);
    return value ? [value] : [];
}

function stringifyAiList(raw: unknown) {
    const items = normalizeAiList(raw);
    return items.length > 0 ? JSON.stringify(items) : null;
}

function normalizeAiPayload(raw: unknown) {
    // Si aucun résultat IA n'est envoyé, on prépare des champs vides.
    if (!raw || typeof raw !== "object") {
        return {
            aiSummary: null,
            aiUrgency: null,
            aiProbableCauses: null,
            aiSuggestedParts: null,
            aiChecklist: null,
            aiDiagnosis: null
        };
    }

    // On travaille avec un objet simple pour lire les champs envoyés par le frontend.
    const payload = raw as Record<string, unknown>;
    // Résumé court affiché ensuite dans les espaces ADV/technicien.
    const summary = normalizeText(payload.summary, 1200);
    // Urgence ramenée à une valeur stable : faible, moyen, élevé ou critique.
    const urgency = normalizeAiUrgency(payload.urgency);
    // Les listes sont transformées en texte JSON pour être stockées dans MySQL.
    const probableCauses = stringifyAiList(payload.probableCauses);
    const suggestedParts = stringifyAiList(payload.suggestedParts);
    const checklist = stringifyAiList(payload.checklist);
    // Les questions de diagnostic sont gardées dans le diagnostic complet.
    const diagnosticQuestions = stringifyAiList(payload.diagnosticQuestions);

    return {
        // Ces cinq champs sont affichés directement par ResumeIATicket.
        aiSummary: summary || null,
        aiUrgency: urgency,
        aiProbableCauses: probableCauses,
        aiSuggestedParts: suggestedParts,
        aiChecklist: checklist,
        // Ce champ garde une copie plus complète du résultat IA.
        aiDiagnosis: JSON.stringify({
            summary,
            urgency,
            diagnosticQuestions: diagnosticQuestions ? JSON.parse(diagnosticQuestions) : [],
            checklist: checklist ? JSON.parse(checklist) : [],
            probableCauses: probableCauses ? JSON.parse(probableCauses) : [],
            suggestedParts: suggestedParts ? JSON.parse(suggestedParts) : [],
            recommendation: normalizeText(payload.recommendation, 400)
        })
    };
}

type TicketAiFields = {
    id: number;
    aiSummary: string | null;
    aiUrgency: string | null;
    aiProbableCauses: string | null;
    aiSuggestedParts: string | null;
    aiChecklist: string | null;
};

async function ensureTicketAiColumns() {
    const statements = [
        "ALTER TABLE `tickets` ADD COLUMN `aiSummary` TEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiUrgency` VARCHAR(20) NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiProbableCauses` LONGTEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiSuggestedParts` LONGTEXT NULL",
        "ALTER TABLE `tickets` ADD COLUMN `aiChecklist` LONGTEXT NULL"
    ];

    for (const statement of statements) {
        try {
            await executeKnownSchemaStatement(statement);
        } catch (error: any) {
            const message = String(error?.message || "").toLowerCase();
            if (!message.includes("duplicate") && !message.includes("already exists")) {
                throw error;
            }
        }
    }
}

async function persistTicketAiFields(ticketId: number, payload: ReturnType<typeof normalizeAiPayload>) {
    // Sans ticket ou sans résumé IA, il n'y a rien à enregistrer.
    if (!ticketId || !payload.aiSummary) return;
    // On vérifie que les colonnes IA existent avant la mise à jour.
    await ensureTicketAiColumns();
    // On écrit les résultats IA dans la table tickets.
    await prisma.$executeRaw`
        UPDATE tickets
        SET aiSummary = ${payload.aiSummary},
            aiUrgency = ${payload.aiUrgency},
            aiProbableCauses = ${payload.aiProbableCauses},
            aiSuggestedParts = ${payload.aiSuggestedParts},
            aiChecklist = ${payload.aiChecklist},
            aiDiagnosis = ${payload.aiDiagnosis}
        WHERE id = ${ticketId}
    `;
}

async function fetchTicketAiFields(ticketIds: number[]) {
    const ids = Array.from(new Set(ticketIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (ids.length === 0) return new Map<number, TicketAiFields>();

    await ensureTicketAiColumns();
    const rows = await prisma.$queryRaw<TicketAiFields[]>(
        Prisma.sql`
            SELECT id, aiSummary, aiUrgency, aiProbableCauses, aiSuggestedParts, aiChecklist
            FROM tickets
            WHERE id IN (${Prisma.join(ids)})
        `
    );

    return new Map(rows.map((row) => [Number(row.id), row]));
}

async function attachTicketAiFieldsToReclamations(items: any[]) {
    const aiByTicketId = await fetchTicketAiFields(items.map((item) => Number(item?.ticket?.id || 0)));
    return items.map((item) => {
        const ai = aiByTicketId.get(Number(item?.ticket?.id || 0));
        if (!item?.ticket || !ai) return item;
        return {
            ...item,
            ticket: {
                ...item.ticket,
                aiSummary: ai.aiSummary,
                aiUrgency: ai.aiUrgency,
                aiProbableCauses: ai.aiProbableCauses,
                aiSuggestedParts: ai.aiSuggestedParts,
                aiChecklist: ai.aiChecklist
            }
        };
    });
}

async function attachTicketDisplayIdsToReclamations(items: any[]) {
    const displayIds = await getTicketAnnualReferenceMap(
        items.map((item) => Number(item?.ticket?.id || 0)).filter(Boolean)
    );

    return items.map((item: any) => {
        const ticketId = Number(item?.ticket?.id || 0);
        if (!ticketId || !item?.ticket) return item;
        const ticketReference = displayIds.get(ticketId) || String(ticketId);
        return {
            ...item,
            ticket: {
                ...item.ticket,
                displayId: Number(ticketReference),
                ticketReference
            }
        };
    });
}

function normalizeInterventionType(raw: unknown): "SITE" | "WORKSHOP" {
    const value = String(raw || "").trim().toUpperCase();
    return value === "WORKSHOP" ? "WORKSHOP" : "SITE";
}

function normalizeAttachmentList(raw: unknown): NormalizedAttachment[] {
    if (!Array.isArray(raw)) return [];
    const nowIso = new Date().toISOString();

    return raw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => {
            const dataUrl = String(item.dataUrl || item.url || "").trim();
            if (!dataUrl) return null;

            return {
                name: String(item.name || "Pièce jointe"),
                type: item.type ? String(item.type) : undefined,
                title: item.title ? String(item.title) : undefined,
                kind: item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT",
                dataUrl,
                sentAt: typeof item.sentAt === "string" && item.sentAt.trim().length > 0 ? item.sentAt.trim() : nowIso
            } as NormalizedAttachment;
        })
        .filter((item): item is NormalizedAttachment => Boolean(item));
}

function getTicketPriorityFromChecklist(rawChecklist: ReturnType<typeof parseChecklistPayload>): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    const metadata = rawChecklist?.metadata || {};
    const sourcePriority = String((metadata as any)?.entryRepairSlip?.priority || (metadata as any)?.urgency || "").toUpperCase();
    if (sourcePriority === "LOW" || sourcePriority === "MEDIUM" || sourcePriority === "HIGH" || sourcePriority === "CRITICAL") {
        return sourcePriority;
    }
    return "MEDIUM";
}

async function resolveExistingCreatorId(preferredId: number | null | undefined, fallbackEmail?: string | null) {
    const normalizedPreferredId = Number(preferredId || 0);
    if (Number.isFinite(normalizedPreferredId) && normalizedPreferredId > 0) {
        const existingById = await prisma.user.findUnique({
            where: { id: normalizedPreferredId },
            select: { id: true }
        });
        if (existingById?.id) return existingById.id;
    }

    const normalizedEmail = String(fallbackEmail || "").trim().toLowerCase();
    if (normalizedEmail) {
        const existingByEmail = await prisma.user.findFirst({
            where: { email: normalizedEmail },
            select: { id: true }
        });
        if (existingByEmail?.id) return existingByEmail.id;
    }

    const fallbackUser = await prisma.user.findFirst({
        where: {
            role: {
                in: ["ADV", "ADMIN", "RESPONSABLE_FACTURATION", "CLIENT"]
            }
        },
        orderBy: { id: "asc" },
        select: { id: true }
    });

    if (fallbackUser?.id) return fallbackUser.id;

    throw new Error("Aucun utilisateur valide trouvé pour créer automatiquement le ticket.");
}

function isDirectClientSource(metadata: Record<string, unknown> | undefined | null) {
    const checklistSource = String(metadata?.source || "").trim().toUpperCase();
    const submittedByRole = String(metadata?.submittedByRole || "").trim().toUpperCase();
    return checklistSource === "CLIENT_FORM" || checklistSource === "CLIENT_EDIT" || submittedByRole === "CLIENT";
}

async function ensureTicketForDirectClientReclamation(reclamation: {
    id: number;
    status?: string | null;
    customerName: string | null;
    contactEmail: string | null;
    phone: string | null;
    serialNumber: string | null;
    deviceModel: string | null;
    description: string | null;
    interventionType: string | null;
    checklist: string | null;
    ticketId?: number | null;
}) {
    if (Number(reclamation.ticketId || 0) > 0) return Number(reclamation.ticketId || 0);

    const parsedChecklist = parseChecklistPayload(reclamation.checklist);
    const metadata = (parsedChecklist?.metadata || {}) as Record<string, unknown>;
    if (!isDirectClientSource(metadata)) return null;

    const existingTicket = await prisma.reclamation.findUnique({
        where: { id: reclamation.id },
        select: { ticketId: true }
    });
    if (Number(existingTicket?.ticketId || 0) > 0) return Number(existingTicket?.ticketId || 0);

    const equipment = await ensureEquipmentForReclamation(reclamation);
    await resetTicketAutoIncrementIfEmpty();
    await ensureTicketAiColumns();

    const creatorId = await resolveExistingCreatorId(
        Number((metadata as any)?.submittedByUserId || 0) || null,
        String(reclamation.contactEmail || "").trim().toLowerCase()
    );

    const ticket = await prisma.ticket.create({
        data: {
            title: `Demande d'intervention : ${String(reclamation.customerName || "Client").trim() || "Client"}`,
            description: String(reclamation.description || "").trim(),
            priority: getTicketPriorityFromChecklist(parsedChecklist),
            status: "QUALIFICATION",
            equipmentId: equipment.id,
            creatorId,
            contactName: String(reclamation.customerName || "").trim() || null,
            contactPhone: String(reclamation.phone || "").trim() || null,
            interventionType: normalizeInterventionType(reclamation.interventionType),
            siteAddress: String((metadata as any)?.city || "").trim() || equipment.location || ""
        }
    });

    await prisma.reclamation.update({
        where: { id: reclamation.id },
        data: {
            ticketId: ticket.id,
            status: String(reclamation.status || "").trim() || "PENDING_ADV"
        }
    });

    return ticket.id;
}

function dedupeAttachments(raw: NormalizedAttachment[]) {
    const dedup = new Map<string, NormalizedAttachment>();
    raw.forEach((item) => {
        const key = `${item.kind}|${item.dataUrl.toLowerCase()}|${String(item.title || "").toLowerCase()}`;
        if (!dedup.has(key)) dedup.set(key, item);
    });
    return Array.from(dedup.values());
}

function sanitizeExpiredClientDocuments(reclamation: { checklist?: string | null; attachmentUrl?: string | null; createdAt?: Date | string | null; updatedAt?: Date | string | null }) {
    if (!shouldApplyRepairedTicketDocumentRetention(reclamation)) return null;
    const parsed = parseChecklistPayload(reclamation.checklist);
    const fallbackSentAt = String(reclamation.updatedAt || reclamation.createdAt || "").trim() || null;
    const currentAttachments = Array.isArray(parsed.metadata?.attachments) ? parsed.metadata.attachments : [];
    const expiredAttachments = getExpiredClientAttachments(currentAttachments, fallbackSentAt);
    if (reclamation.attachmentUrl && isClientAttachmentExpired(null, fallbackSentAt)) {
        expiredAttachments.push({ name: "Pièce jointe", dataUrl: reclamation.attachmentUrl });
    }
    const cleanedAttachments = currentAttachments.filter((attachment) => !isClientAttachmentExpired(attachment, fallbackSentAt));
    const nextAttachmentUrl = cleanedAttachments[0]?.dataUrl || (!isClientAttachmentExpired(null, fallbackSentAt) ? reclamation.attachmentUrl || null : null);
    const attachmentsChanged = cleanedAttachments.length !== currentAttachments.length;

    if (!attachmentsChanged && nextAttachmentUrl === (reclamation.attachmentUrl || null)) {
        return null;
    }

    return {
        checklist: stringifyChecklistPayload({
            ...parsed,
            metadata: {
                ...(parsed.metadata || {}),
                attachments: cleanedAttachments.length > 0 ? cleanedAttachments : undefined
            }
        }),
        attachmentUrl: nextAttachmentUrl,
        expiredAttachments
    };
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));

        const customerName = normalizeText(body?.customerName, 255);
        const contactEmail = normalizeText(body?.contactEmail, 255).toLowerCase();
        const phone = normalizeText(body?.phone, 100);
        const serialNumber = normalizeText(body?.serialNumber, 255);
        const deviceModel = normalizeText(body?.deviceModel, 255);
        const description = normalizeText(body?.description, 20000);
        const interventionType = normalizeInterventionType(body?.interventionType);
        const sageCode = normalizeText(body?.sageCode, 255);

        const missingFields: string[] = [];
        if (!customerName) missingFields.push("Nom client");
        if (!serialNumber) missingFields.push("Numéro de série");
        if (!deviceModel) missingFields.push("Modèle");
        if (!description) missingFields.push("Description");
        if (missingFields.length > 0) {
            return NextResponse.json(
                { error: `Champs obligatoires manquants: ${missingFields.join(", ")}` },
                { status: 400 }
            );
        }

        const isValidEmail = !contactEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail);
        if (!isValidEmail) {
            return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
        }

        const checklistPayloadObject = parseChecklistPayload(body?.checklist);
        const checklistMetadata = checklistPayloadObject?.metadata || {};
        const checklistSource = String(checklistMetadata?.source || "").trim().toUpperCase();
        const submittedByRole = String(checklistMetadata?.submittedByRole || "").trim().toUpperCase();
        const isFacturationEntrySlip =
            checklistSource === "ENTRY_REPAIR_SLIP"
            && submittedByRole === "RESPONSABLE_FACTURATION";
        const isDirectClientRequest = checklistSource === "CLIENT_FORM" || submittedByRole === "CLIENT";
        // Résultat IA envoyé par la page client Assistant IA.
        const aiPayload = normalizeAiPayload(body?.aiAnalysis);

        if (isDirectClientRequest) {
            const { role, userId } = getRequestUserContext(req);
            if (role !== "CLIENT" || !userId) {
                return NextResponse.json({ error: "Client connecté requis pour créer cette demande." }, { status: 403 });
            }

            const currentUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { id: true, email: true, role: true }
            });
            if (!currentUser || currentUser.role !== "CLIENT") {
                return NextResponse.json({ error: "Compte client introuvable." }, { status: 403 });
            }
            if (currentUser.email.trim().toLowerCase() !== contactEmail) {
                return NextResponse.json({ error: "Un client ne peut créer une demande que pour son propre compte." }, { status: 403 });
            }
        }

        const entryRepairSlip = checklistMetadata?.entryRepairSlip;
        const checklistAttachments = normalizeAttachmentList(checklistPayloadObject?.metadata?.attachments);
        const topLevelAttachments = normalizeAttachmentList(body?.attachments);
        const attachments = dedupeAttachments([...checklistAttachments, ...topLevelAttachments]);

        const payloadChecklist = stringifyChecklistPayload({
            ...checklistPayloadObject,
            metadata: {
                ...(checklistPayloadObject.metadata || {}),
                attachments: attachments.length > 0 ? attachments : undefined
            }
        });

        const normalizedAttachment =
            normalizeText(body?.attachmentUrl, 2048) || attachments[0]?.dataUrl || null;

        const satisfactionCandidate = Number(body?.satisfactionRate);
        const normalizedSatisfaction =
            Number.isFinite(satisfactionCandidate) && satisfactionCandidate >= 0
                ? Math.round(satisfactionCandidate)
                : undefined;

        await resetReclamationAutoIncrementIfEmpty();

        const initialStatus = isFacturationEntrySlip ? "VALIDATED" : "PENDING_ADV";

        const reclamation = await prisma.reclamation.create({
            data: {
                customerName,
                contactEmail,
                phone: phone || null,
                serialNumber,
                deviceModel,
                sageCode: sageCode || null,
                description,
                interventionType,
                checklist: payloadChecklist,
                satisfactionRate: normalizedSatisfaction,
                attachmentUrl: normalizedAttachment,
                status: initialStatus
            },
        });

        let ticketId: number | null = null;

        if (isDirectClientRequest) {
            const equipment = await ensureEquipmentForReclamation(reclamation);

            await resetTicketAutoIncrementIfEmpty();

            const creatorId = await resolveExistingCreatorId(
                Number((checklistMetadata as any)?.submittedByUserId || body?.userId || 0) || null,
                contactEmail
            );
            const ticket = await prisma.ticket.create({
                data: {
                    title: `Demande d'intervention : ${customerName}`,
                    description,
                    priority: getTicketPriorityFromChecklist(checklistPayloadObject),
                    status: "QUALIFICATION",
                    equipmentId: equipment.id,
                    creatorId,
                    contactName: customerName,
                    contactPhone: phone || null,
                    interventionType,
                    siteAddress: String((checklistMetadata as any)?.city || "").trim() || equipment.location || ""
                }
            });

            ticketId = ticket.id;
            await persistTicketAiFields(ticket.id, aiPayload);

            await prisma.reclamation.update({
                where: { id: reclamation.id },
                data: {
                    ticketId: ticket.id,
                    status: "PENDING_ADV"
                }
            });
        }

        if (isFacturationEntrySlip) {
            const equipment = await ensureEquipmentForReclamation(reclamation);

            await resetTicketAutoIncrementIfEmpty();

            const creatorId = await resolveExistingCreatorId(Number(entryRepairSlip?.submittedByUserId || 0) || null, contactEmail);
            const priority = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(entryRepairSlip?.priority || "").toUpperCase())
                ? String(entryRepairSlip?.priority).toUpperCase()
                : "MEDIUM";

            const ticket = await prisma.ticket.create({
                data: {
                    title: customerName,
                    description,
                    priority: priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
                    status: "QUALIFICATION",
                    equipmentId: equipment.id,
                    creatorId,
                    contactName: customerName,
                    contactPhone: phone || null,
                    siteAddress: String(entryRepairSlip?.city || "").trim() || equipment.location || ""
                }
            });

            ticketId = ticket.id;

            await prisma.reclamation.update({
                where: { id: reclamation.id },
                data: {
                    ticketId: ticket.id,
                    status: "VALIDATED"
                }
            });

            await prisma.sav_history.create({
                data: {
                    equipmentId: equipment.id,
                    ticketId: ticket.id,
                    action: "BON_ENTREE_FACTURATION_CREATED",
                    note: "Ticket créé automatiquement depuis le bon de réparation d'entrée facturation.",
                    userId: creatorId
                }
            });

            await prisma.equipment.update({
                where: { id: equipment.id },
                data: { status: "IN_WORKSHOP" }
            });
        }

        const ticketReference = ticketId ? await getTicketAnnualReference(ticketId) : null;

        return NextResponse.json({
            ...reclamation,
            ticketId,
            ticketReference
        });
    } catch (error: any) {
        console.error("Erreur creation reclamation:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const light = searchParams.get("light") === "1";
        const skipSanitize = searchParams.get("skipSanitize") === "1";
        const includeStoreReviewRequested = searchParams.get("includeStoreReview") === "1";
        const contactEmail = normalizeText(searchParams.get("contactEmail"), 255).toLowerCase();
        const takeParam = Number(searchParams.get("take"));
        const historyParam = Number(searchParams.get("historyLimit"));
        const recordsTake = Number.isFinite(takeParam) && takeParam > 0 ? Math.round(takeParam) : undefined;
        const historyTake = Number.isFinite(historyParam) && historyParam > 0 ? Math.round(historyParam) : undefined;
        const { role } = getRequestUserContext(req);
        const includeStoreReview = includeStoreReviewRequested && canReadStoreReview(role);
        const recordsLimitClause: { take?: number } = typeof recordsTake === "number" ? { take: recordsTake } : {};
        const historyLimitClause: { take?: number } = typeof historyTake === "number" ? { take: historyTake } : {};

        const missingClientTickets = await prisma.reclamation.findMany({
            where: {
                ticketId: null,
                status: {
                    in: ["PENDING_ADV", "PENDING", "PENDING_ADV_VERIFICATION", "PENDING_STORE_REVIEW", "PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "PENDING_ADV_QUOTE", "QUOTE_APPROVED"]
                }
            },
            select: {
                id: true,
                customerName: true,
                contactEmail: true,
                phone: true,
                serialNumber: true,
                deviceModel: true,
                description: true,
                interventionType: true,
                checklist: true,
                ticketId: true,
                status: true
            },
            ...recordsLimitClause
        });

        for (const item of missingClientTickets) {
            await ensureTicketForDirectClientReclamation(item);
        }

        const ticketSelect = light
            ? {
                  id: true,
                  status: true,
                  priority: true,
                  satisfactionRate: true,
                  createdAt: true,
                  updatedAt: true,
                  closedAt: true,
                solution: true,
                  assignedToId: true,
                  assignedTo: { select: { id: true, name: true, role: true } },
                  equipment: { select: { blDate: true, warrantyMonths: true } },
                  savHistory: {
                      orderBy: { createdAt: "desc" as const },
                      ...historyLimitClause,
                      select: {
                          id: true,
                          action: true,
                          note: true,
                          createdAt: true,
                          user: { select: { id: true, name: true, role: true } }
                      }
                  }
              }
            : {
                  id: true,
                  status: true,
                  priority: true,
                  createdAt: true,
                  updatedAt: true,
                  closedAt: true,
                  assignedToId: true,
                  diagnosis: true,
                  rejectionMotive: true,
                  solution: true,
                  interventionType: true,
                  satisfactionRate: true,
                  assignedTo: { select: { id: true, name: true, role: true } },
                  equipment: { select: { blDate: true, warrantyMonths: true } },
                  adv: { select: { id: true, name: true } },
                  savHistory: {
                      orderBy: { createdAt: "desc" as const },
                      ...historyLimitClause,
                      select: {
                          id: true,
                          action: true,
                          note: true,
                          createdAt: true,
                          user: { select: { id: true, name: true, role: true } }
                      }
                  }
              };

        const reclamations = light
            ? await prisma.reclamation.findMany({
                  where: contactEmail ? { contactEmail } : undefined,
                  select: {
                      id: true,
                      status: true,
                      customerName: true,
                      contactEmail: true,
                      phone: true,
                      serialNumber: true,
                      deviceModel: true,
                      sageCode: true,
                      description: true,
                      interventionType: true,
                      checklist: true,
                      attachmentUrl: true,
                      satisfactionRate: true,
                      createdAt: true,
                      updatedAt: true,
                      ticket: {
                          select: ticketSelect
                      }
                  },
                  orderBy: {
                      createdAt: "desc" as const
                  },
                  ...recordsLimitClause
              })
            : await prisma.reclamation.findMany({
                  where: contactEmail ? { contactEmail } : undefined,
                  include: {
                      ticket: {
                          select: ticketSelect
                      }
                  },
                  orderBy: {
                      createdAt: "desc" as const
                  },
                  ...recordsLimitClause
              });

        const payloadWithoutAi = await Promise.all(
            reclamations.map(async (item: any) => {
                if (!skipSanitize) {
                    const sanitizedDocuments = sanitizeExpiredClientDocuments(item);
                    if (sanitizedDocuments) {
                        const { expiredAttachments, ...data } = sanitizedDocuments;
                        await prisma.reclamation.update({
                            where: { id: item.id },
                            data
                        }).catch(() => null);
                        await deleteClientAttachmentFiles(expiredAttachments);
                        item = { ...item, ...data };
                    }
                }

                const checklistWithTopMedicalLimit = hydrateTopMedicalWarrantyLimit(item.checklist);
                if (includeStoreReview) {
                    return {
                        ...item,
                        checklist: checklistWithTopMedicalLimit
                    };
                }

                return {
                    ...item,
                    checklist: stripStoreReview(checklistWithTopMedicalLimit)
                };
            })
        );
        const payloadWithAi = await attachTicketAiFieldsToReclamations(payloadWithoutAi);
        const payload = await attachTicketDisplayIdsToReclamations(payloadWithAi);

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "no-store, max-age=0"
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
