import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { isClientAttachmentExpired, parseChecklistPayload, shouldApplyRepairedTicketDocumentRetention, stringifyChecklistPayload } from "@/metier/workflow-client";
import { deleteClientAttachmentFiles, getExpiredClientAttachments } from "@/metier/nettoyage-pieces-jointes-client";
import { canReadStoreReview, getRequestUserContext } from "@/metier/utilisateur-requete";
import { resetReclamationAutoIncrementIfEmpty } from "@/metier/sequence-demande";
import { attachTicketAnnualReference, getTicketAnnualReferenceMap } from "@/metier/reference-ticket";

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

function normalizeClientEditAttachments(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as Array<{ name: string; dataUrl: string; type?: string; title?: string; kind: "DOCUMENT" | "MEDIA"; sentAt: string }>;
    }
    const nowIso = new Date().toISOString();

    return raw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
            name: String(item.name || "Pièce jointe"),
            dataUrl: String(item.url || item.dataUrl || "").trim(),
            type: item.type ? String(item.type) : undefined,
            title: item.title ? String(item.title) : undefined,
            kind: item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT" as const,
            sentAt: typeof item.sentAt === "string" && item.sentAt.trim().length > 0 ? item.sentAt.trim() : nowIso
        }))
        .filter((item) => item.dataUrl.length > 0);
}

function canonicalAttachmentName(raw: string) {
    let value = String(raw || "").trim().toLowerCase();
    if (!value) return "";

    const noQuery = value.split("?")[0].split("#")[0];
    const basename = noQuery.split("/").pop() || "";
    value = decodeURIComponent(basename);

    for (let i = 0; i < 3; i += 1) {
        const next = value.replace(/^\d{10,}-[a-z0-9]+-/i, "");
        if (next === value) break;
        value = next;
    }

    return value.replace(/\(\d+\)(?=\.[a-z0-9]+$)/i, "");
}

function normalizeInterventionType(raw: unknown): "SITE" | "WORKSHOP" {
    const value = String(raw || "").trim().toUpperCase();
    return value === "WORKSHOP" ? "WORKSHOP" : "SITE";
}

function normalizeUrgency(raw: unknown): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "LOW" || value === "MEDIUM" || value === "HIGH" || value === "CRITICAL") {
        return value;
    }
    return "MEDIUM";
}

async function createSavHistoryOnce(data: {
    ticketId: number;
    equipmentId: number;
    userId: number;
    action: string;
    note: string;
}) {
    const since = new Date(Date.now() - 2 * 60 * 1000);
    const existing = await prisma.sav_history.findFirst({
        where: {
            ticketId: data.ticketId,
            action: data.action,
            note: data.note,
            createdAt: { gte: since }
        },
        select: { id: true }
    });

    if (existing) return null;
    return prisma.sav_history.create({ data });
}

function toNumberOrNull(raw: unknown) {
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(String(raw).replace(",", "."));
    return Number.isFinite(value) ? value : null;
}

function cleanText(raw: unknown) {
    return String(raw || "").trim();
}

function normalizeDeletedImportRequestRefs(raw: unknown) {
    if (!Array.isArray(raw)) return [] as string[];
    return Array.from(new Set(
        raw
            .map((value) => cleanText(value))
            .filter(Boolean)
    ));
}

async function syncPiecesTableRows(params: {
    ticketId: number;
    equipmentId: number;
    userId: number | null;
    entries: unknown;
}) {
    const entries = params.entries;
    if (!Array.isArray(entries)) return;

    await prisma.$transaction(async (tx) => {
        await Promise.all([
            tx.piece_utilisee.deleteMany({ where: { ticketId: params.ticketId } }),
            tx.main_oeuvre.deleteMany({ where: { ticketId: params.ticketId } }),
            tx.mise_a_jour.deleteMany({ where: { ticketId: params.ticketId } }),
            tx.nouvelle_installation.deleteMany({ where: { ticketId: params.ticketId } }),
            tx.part.deleteMany({ where: { ticketId: params.ticketId } })
        ]);

        for (const rawEntry of entries) {
            if (!rawEntry || typeof rawEntry !== "object") continue;
            const entry = rawEntry as Record<string, unknown>;
            const nature = cleanText(entry.nature).toUpperCase();
            const designation = cleanText(entry.designation || entry.partsToReplace || entry.partsToRepair || entry.partsToFabricate || entry.softwareUpdate || entry.softwareInstallation);
            if (!designation) continue;

            const common = {
                ticketId: params.ticketId,
                equipmentId: params.equipmentId,
                userId: params.userId || null
            };
            const quantity = toNumberOrNull(entry.quantity) || 1;
            const supplierCode = cleanText(entry.supplierCode || entry.supplierReference) || null;
            const sageCode = cleanText(entry.sageCode || entry.sageReference) || null;
            const costPrice = toNumberOrNull(entry.costPrice || entry.purchasedComponentsPrice);
            const purchasePrice = toNumberOrNull(entry.purchasePrice);
            const purchaseCurrency = cleanText(entry.purchaseCurrency).toUpperCase() || null;
            const salePriceTtc = toNumberOrNull(entry.salePriceTtc);

            if (nature === "LABOR") {
                const heures = toNumberOrNull(entry.laborHours) || 0;
                await tx.main_oeuvre.create({
                    data: {
                        ...common,
                        designation,
                        heures,
                        prixTotal: costPrice || salePriceTtc || purchasePrice,
                        commentaire: cleanText(entry.equipmentLabel) || null
                    }
                });
                continue;
            }

            if (nature === "SOFTWARE_UPDATE") {
                await tx.mise_a_jour.create({
                    data: {
                        ...common,
                        designation,
                        prix: costPrice || salePriceTtc || purchasePrice,
                        commentaire: cleanText(entry.equipmentLabel) || null
                    }
                });
                continue;
            }

            if (nature === "SOFTWARE_INSTALLATION") {
                await tx.nouvelle_installation.create({
                    data: {
                        ...common,
                        designation,
                        licence: sageCode || supplierCode,
                        prix: costPrice || salePriceTtc || purchasePrice,
                        commentaire: cleanText(entry.equipmentLabel) || null
                    }
                });
                continue;
            }

            if (nature === "LOCAL_PART_REQUEST") {
                const referenceBase = sageCode || supplierCode || designation;
                await tx.part.create({
                    data: {
                        ...common,
                        name: designation,
                        reference: `${referenceBase}-${params.ticketId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 180),
                        sageCode,
                        sageDesignation: designation,
                        price: costPrice || purchasePrice || salePriceTtc || 0,
                        quantityInStock: Number(quantity) || 0,
                        minStock: 0,
                        description: cleanText(entry.equipmentLabel) || null
                    }
                });
                continue;
            }

            if (nature === "PART_REQUEST") {
                const importRequestRef = cleanText(entry.importRequestRef);
                if (importRequestRef) {
                    await tx.purchase_order.updateMany({
                        where: { ref: importRequestRef },
                        data: {
                            ticketId: params.ticketId,
                            equipmentId: params.equipmentId,
                            totalAmount: purchasePrice || costPrice || salePriceTtc || 0
                        }
                    });
                }
            }

            if (nature === "USED_PART" || nature === "REPAIR" || nature === "PART_TO_MANUFACTURE" || nature === "PART_REQUEST") {
                await tx.piece_utilisee.create({
                    data: {
                        ...common,
                        designation,
                        quantity,
                        supplierCode,
                        sageCode,
                        costPrice,
                        purchasePrice,
                        purchaseCurrency,
                        salePriceTtc,
                        commentaire: nature === "PART_REQUEST" ? "Pièce importée demandée" : cleanText(entry.equipmentLabel) || null
                    }
                });
            }
        }
    });
}

function normalizeContractualDocuments(raw: unknown) {
    if (!Array.isArray(raw)) {
        return [] as Array<{ name: string; dataUrl: string; type?: string; title?: string; kind: "DOCUMENT" | "MEDIA" }>;
    }

    return raw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => ({
            name: String(item.name || "Contrat de garantie"),
            dataUrl: String(item.url || item.dataUrl || "").trim(),
            type: item.type ? String(item.type) : undefined,
            title: item.title ? String(item.title) : undefined,
            kind: item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT" as const
        }))
        .filter((item) => item.dataUrl.length > 0);
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

export async function GET(
    req: Request,
    context: any
) {
    const params = await context.params;
    try {
        const { searchParams } = new URL(req.url);
        const includeStoreReviewRequested = searchParams.get("includeStoreReview") === "1";
        const { role } = getRequestUserContext(req);
        const includeStoreReview = includeStoreReviewRequested && canReadStoreReview(role);
        const { id } = await params;
        const reclamationId = parseInt(id);
        if (Number.isNaN(reclamationId)) {
            return NextResponse.json({ error: "ID de réclamation invalide" }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: {
                ticket: {
                    include: {
                        assignedTo: { select: { id: true, name: true, role: true } },
                        adv: { select: { id: true, name: true } },
                        savHistory: {
                            orderBy: { createdAt: "desc" },
                            take: 40,
                            select: {
                                id: true,
                                action: true,
                                note: true,
                                createdAt: true,
                                user: { select: { id: true, name: true, role: true } }
                            }
                        }
                    }
                }
            }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Réclamation non trouvée" }, { status: 404 });
        }

        const sanitizedDocuments = sanitizeExpiredClientDocuments(reclamation);
        if (sanitizedDocuments) {
            const { expiredAttachments, ...data } = sanitizedDocuments;
            await prisma.reclamation.update({
                where: { id: reclamationId },
                data
            }).catch(() => null);
            await deleteClientAttachmentFiles(expiredAttachments);
            reclamation.checklist = data.checklist;
            reclamation.attachmentUrl = data.attachmentUrl;
        }

        const ticketReferences = reclamation.ticket?.id
            ? await getTicketAnnualReferenceMap([Number(reclamation.ticket.id)])
            : new Map<number, string>();
        const reclamationWithReference = {
            ...reclamation,
            ticket: reclamation.ticket ? attachTicketAnnualReference(reclamation.ticket as any, ticketReferences) : reclamation.ticket
        };

        return NextResponse.json(
            includeStoreReview
                ? reclamationWithReference
                : {
                    ...reclamationWithReference,
                    checklist: stripStoreReview(reclamationWithReference.checklist)
                }
        );
    } catch (error: any) {
        console.error("GET reclamation error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(
    req: Request,
    context: any
) {
    const params = await context.params;
    try {
        const { id } = await params;
        const reclamationId = parseInt(id);
        const body = await req.json();
        const { status, ticketId } = body;

        if (Number.isNaN(reclamationId)) {
            return NextResponse.json({ error: "ID de réclamation invalide" }, { status: 400 });
        }

        if (String(body?.mode || "").toUpperCase() === "CLIENT_EDIT") {
            const reclamation = await prisma.reclamation.findUnique({
                where: { id: reclamationId },
                include: {
                    ticket: {
                        select: {
                            id: true,
                            status: true,
                            equipmentId: true,
                            creatorId: true
                        }
                    }
                }
            });

            if (!reclamation) {
                return NextResponse.json({ error: "Demande d'intervention introuvable" }, { status: 404 });
            }

            if (String(reclamation.status || "") === "NOT_TAKEN_IN_CHARGE" || String(reclamation.ticket?.status || "") === "CLOSED") {
                return NextResponse.json({ error: "La demande est clôturée: modification impossible." }, { status: 400 });
            }

            const actorRole = String(body?.actorRole || "").trim().toUpperCase();
            const requestEmail = String(body.requesterEmail || body.contactEmail || "").trim().toLowerCase();
            if (actorRole !== "ADV" && requestEmail && requestEmail !== String(reclamation.contactEmail || "").trim().toLowerCase()) {
                return NextResponse.json({ error: "Modification non autorisée pour ce compte." }, { status: 403 });
            }

            const firstName = String(body.firstName || "").trim();
            const lastName = String(body.lastName || "").trim();
            const customerName = `${firstName} ${lastName}`.trim() || String(reclamation.customerName || "").trim();
            const contactEmail = String(body.contactEmail || reclamation.contactEmail || "").trim();
            const phone = typeof body.phone === "string" ? body.phone.trim() : reclamation.phone;
            const serialNumber = String(body.serialNumber || reclamation.serialNumber || "").trim();
            const model = String(body.model || body.deviceModel || reclamation.deviceModel || "").trim();
            const description = String(body.description || reclamation.description || "").trim();
            const interventionType = normalizeInterventionType(body.interventionType || reclamation.interventionType);
            const pn = String(body.pn || body.sageCode || reclamation.sageCode || "").trim();
            const urgency = normalizeUrgency(body.urgency);
            const errorMessageDetails = String(body.errorMessageDetails || "").trim();

            const previousChecklist = parseChecklistPayload(reclamation.checklist);
            const previousMetadata = previousChecklist.metadata && typeof previousChecklist.metadata === "object"
                ? previousChecklist.metadata as Record<string, unknown>
                : {};
            const previousMerchandiseInfo = previousMetadata.merchandiseInfo && typeof previousMetadata.merchandiseInfo === "object"
                ? previousMetadata.merchandiseInfo as Record<string, unknown>
                : {};
            const incomingMerchandiseInfo = body?.merchandiseInfo && typeof body.merchandiseInfo === "object"
                ? body.merchandiseInfo as Record<string, unknown>
                : body?.metadata?.merchandiseInfo && typeof body.metadata.merchandiseInfo === "object"
                    ? body.metadata.merchandiseInfo as Record<string, unknown>
                    : null;
            const existingAttachments = Array.isArray(previousChecklist.metadata?.attachments) ? previousChecklist.metadata.attachments : [];
            const incomingAttachments = normalizeClientEditAttachments(body.attachments);
            const sourceAttachments = Array.isArray(body.attachments) ? incomingAttachments : existingAttachments;
            const dedupByKey = new Map<string, typeof sourceAttachments[number]>();
            sourceAttachments.forEach((item) => {
                const exactUrl = String(item.dataUrl || "").trim().toLowerCase();
                const key = exactUrl ? `url:${exactUrl}` : canonicalAttachmentName(String(item.name || "")) || `${item.kind}|${String(item.title || "").toLowerCase()}|${String(item.name || "").toLowerCase()}`;
                if (!key) return;
                if (!dedupByKey.has(key)) dedupByKey.set(key, item);
            });
            const attachments = Array.from(dedupByKey.values());

            const checklistPayload = {
                sosAnswers: body?.sosAnswers && typeof body.sosAnswers === "object" ? body.sosAnswers : (previousChecklist.sosAnswers || {}),
                metadata: {
                    ...previousMetadata,
                    firstName,
                    lastName,
                    clientCode: String(body.clientCode || "").trim(),
                    establishment: String(body.establishment || "").trim(),
                    establishmentType: String(body.establishmentType || "").trim(),
                    city: String(body.city || "").trim(),
                    specialtySector: String(body.specialtySector || "").trim(),
                    specialty: String(body.specialty || "").trim(),
                    specialtyOther: String(body.specialtyOther || "").trim(),
                    pn,
                    contactPerson: customerName,
                    urgency,
                    equipmentName: String(body.equipmentName || "").trim(),
                    accessories: String(body.accessories || "").trim(),
                    brand: String(body.brand || "").trim(),
                    model,
                    publicMarketNumber: String(body.publicMarketNumber || previousMetadata.publicMarketNumber || "").trim(),
                    phoneFixed: String(body.phoneFixed || "").trim(),
                    errorMessageDetails,
                    merchandiseInfo: incomingMerchandiseInfo
                        ? {
                              ...previousMerchandiseInfo,
                              ...incomingMerchandiseInfo,
                              articleCode: String((incomingMerchandiseInfo as any).articleCode ?? (previousMerchandiseInfo as any).articleCode ?? "").trim() || null,
                              warrantyLabel: String((incomingMerchandiseInfo as any).warrantyLabel ?? (previousMerchandiseInfo as any).warrantyLabel ?? "").trim() || null,
                              warrantyStatus: String((incomingMerchandiseInfo as any).warrantyStatus ?? (previousMerchandiseInfo as any).warrantyStatus ?? "").trim() || null,
                              topMedicalWarrantyContractDate: String((incomingMerchandiseInfo as any).topMedicalWarrantyContractDate ?? (previousMerchandiseInfo as any).topMedicalWarrantyContractDate ?? "").trim() || null,
                              topMedicalWarrantyDuration: String((incomingMerchandiseInfo as any).topMedicalWarrantyDuration ?? (previousMerchandiseInfo as any).topMedicalWarrantyDuration ?? "").trim() || null,
                              topMedicalWarrantyLimitDate: String((incomingMerchandiseInfo as any).topMedicalWarrantyLimitDate ?? (previousMerchandiseInfo as any).topMedicalWarrantyLimitDate ?? "").trim() || null,
                              advWarrantyLimitDate: String((incomingMerchandiseInfo as any).advWarrantyLimitDate ?? (previousMerchandiseInfo as any).advWarrantyLimitDate ?? "").trim() || null,
                              invoiceDate: String((incomingMerchandiseInfo as any).invoiceDate ?? (previousMerchandiseInfo as any).invoiceDate ?? "").trim() || null,
                              shippingDate: String((incomingMerchandiseInfo as any).shippingDate ?? (previousMerchandiseInfo as any).shippingDate ?? "").trim() || null,
                              warrantyLimitDate: String((incomingMerchandiseInfo as any).warrantyLimitDate ?? (previousMerchandiseInfo as any).warrantyLimitDate ?? "").trim() || null,
                              equipmentMerchandiseItems: Array.isArray((incomingMerchandiseInfo as any).equipmentMerchandiseItems)
                                  ? (incomingMerchandiseInfo as any).equipmentMerchandiseItems
                                  : (previousMerchandiseInfo as any).equipmentMerchandiseItems,
                              filledBy: String((incomingMerchandiseInfo as any).filledBy ?? (previousMerchandiseInfo as any).filledBy ?? "").trim() || undefined,
                              filledByUserId: Number((incomingMerchandiseInfo as any).filledByUserId ?? (previousMerchandiseInfo as any).filledByUserId ?? 0) || undefined,
                              filledAt: String((incomingMerchandiseInfo as any).filledAt ?? (previousMerchandiseInfo as any).filledAt ?? "").trim() || undefined,
                              updatedAt: String((incomingMerchandiseInfo as any).updatedAt ?? (previousMerchandiseInfo as any).updatedAt ?? "").trim() || undefined,
                              updatedByUserId: Number((incomingMerchandiseInfo as any).updatedByUserId ?? (previousMerchandiseInfo as any).updatedByUserId ?? 0) || undefined
                          }
                        : previousMetadata?.merchandiseInfo,
                    submittedByRole: String(previousMetadata?.submittedByRole || "").trim() || (actorRole === "ADV" ? "ADV" : "CLIENT"),
                    source: String(previousMetadata?.source || "").trim() || (actorRole === "ADV" ? "ADV_EDIT" : "CLIENT_EDIT"),
                    attachments
                }
            };

            const firstAttachmentUrl = attachments[0]?.dataUrl || reclamation.attachmentUrl || null;

            const updated = await prisma.reclamation.update({
                where: { id: reclamationId },
                data: {
                    customerName,
                    contactEmail,
                    phone: phone || null,
                    serialNumber,
                    deviceModel: model,
                    description,
                    interventionType,
                    sageCode: pn || null,
                    checklist: stringifyChecklistPayload(checklistPayload),
                    attachmentUrl: firstAttachmentUrl
                }
            });

            const hasAttachmentChanges = Array.isArray(body.attachments);

            if (reclamation.ticket?.id && hasAttachmentChanges && attachments.length > 0) {
                const requestedUserId = Number(body.userId);
                const historyUserId = Number.isFinite(requestedUserId) && requestedUserId > 0
                    ? requestedUserId
                    : reclamation.ticket.creatorId;

                const historyPayload: Record<string, unknown> = {
                    message: `Documents client mis à jour: ${attachments.length}`,
                    attachments: attachments.map((item) => ({
                        name: item.name,
                        title: item.title,
                        type: item.type,
                        kind: item.kind,
                        url: item.dataUrl
                    }))
                };

                await prisma.sav_history.create({
                    data: {
                        ticketId: reclamation.ticket.id,
                        equipmentId: reclamation.ticket.equipmentId,
                        userId: historyUserId,
                        action: actorRole === "ADV" ? "ADV_UPDATE" : "CLIENT_UPDATE",
                        note: JSON.stringify(historyPayload)
                    }
                });
            }

            return NextResponse.json(updated);
        }

        // Mode simple : mise à jour statut et/ou ticket, avec possibilité
        // de persister les infos ADV (note de vérification + marchandise facultative)
            const hasContractualDocuments = Array.isArray(body?.contractualDocuments);
            const allowMerchandiseUpdate = Boolean(body?.allowMerchandiseUpdate);
            const incomingTopMedicalWarrantyLimit =
                body?.topMedicalWarrantyLimit && typeof body.topMedicalWarrantyLimit === "object"
                    ? body.topMedicalWarrantyLimit as Record<string, unknown>
                    : body?.metadata?.topMedicalWarrantyLimit && typeof body.metadata.topMedicalWarrantyLimit === "object"
                        ? body.metadata.topMedicalWarrantyLimit as Record<string, unknown>
                        : null;
            const needsChecklistUpdate =
                body?.advVerificationNote !== undefined ||
                body?.depositAgency !== undefined ||
                (body?.technicalDiagnosis && typeof body.technicalDiagnosis === "object") ||
                (body?.merchandiseInfo && typeof body.merchandiseInfo === "object") ||
                (body?.metadata?.merchandiseInfo && typeof body.metadata.merchandiseInfo === "object") ||
                Boolean(incomingTopMedicalWarrantyLimit) ||
                hasContractualDocuments;

        // Historique requis pour certains changements de statut
        const historyStatuses = ["TAKEN_IN_CHARGE", "NOT_TAKEN_IN_CHARGE", "READY_FOR_TECH_MANAGER_ASSIGNMENT"];
        const needsHistory = status !== undefined && historyStatuses.includes(String(status));
        const needsMerchandiseHistory = body?.merchandiseInfo && (body?.merchandiseInfo as any)?.filledBy === "ADV";

        const currentRec = (needsChecklistUpdate || needsHistory || needsMerchandiseHistory)
            ? await prisma.reclamation.findUnique({
                where: { id: reclamationId },
                select: {
                    status: true,
                    checklist: true,
                    ticketId: true,
                    ticket: {
                        select: {
                            id: true,
                            equipmentId: true,
                            savHistory: {
                                where: {
                                    action: "ADV_MERCHANDISE_REVIEW"
                                },
                                take: 1,
                                select: { id: true }
                            }
                        }
                    }
                }
              })
            : null;

        let updatedChecklist: string | undefined;
        let technicalDiagnosisToSync: Record<string, unknown> | null = null;
        if (currentRec && needsChecklistUpdate) {
            const parsed = parseChecklistPayload(currentRec.checklist);
            const existingMeta = (parsed.metadata || {}) as Record<string, unknown>;
            const existingMerchandiseInfo =
                existingMeta.merchandiseInfo && typeof existingMeta.merchandiseInfo === "object"
                    ? existingMeta.merchandiseInfo as Record<string, unknown>
                    : {};
            const existingStoreReview =
                existingMeta.storeReview && typeof existingMeta.storeReview === "object"
                    ? existingMeta.storeReview as Record<string, unknown>
                    : {};
            const incomingMerch = body?.merchandiseInfo && typeof body.merchandiseInfo === "object"
                ? body.merchandiseInfo as Record<string, unknown>
                : body?.metadata?.merchandiseInfo && typeof body.metadata.merchandiseInfo === "object"
                    ? body.metadata.merchandiseInfo as Record<string, unknown>
                    : null;
            const topMedicalWarrantyLimitFromMerch = incomingMerch && (
                incomingMerch.topMedicalWarrantyContractDate !== undefined
                || incomingMerch.topMedicalWarrantyDuration !== undefined
                || incomingMerch.topMedicalWarrantyLimitDate !== undefined
                || incomingMerch.advWarrantyLimitDate !== undefined
            )
                ? {
                    contractDate: incomingMerch.topMedicalWarrantyContractDate,
                    duration: incomingMerch.topMedicalWarrantyDuration,
                    limitDate: incomingMerch.topMedicalWarrantyLimitDate || incomingMerch.advWarrantyLimitDate
                } as Record<string, unknown>
                : null;
            const normalizedTopMedicalWarrantyLimit = incomingTopMedicalWarrantyLimit || topMedicalWarrantyLimitFromMerch;
            const normalizedTopMedicalContractDate = String(normalizedTopMedicalWarrantyLimit?.contractDate || "").trim();
            const normalizedTopMedicalDuration = String(normalizedTopMedicalWarrantyLimit?.duration || "").trim();
            const normalizedTopMedicalLimitDate = String(normalizedTopMedicalWarrantyLimit?.limitDate || "").trim();
            const mergedMerchandiseInfo = incomingMerch
                ? {
                    ...existingMerchandiseInfo,
                    ...incomingMerch
                } as Record<string, unknown>
                : existingMerchandiseInfo;
            const merchandiseInfoWithTopMedicalLimit = normalizedTopMedicalWarrantyLimit
                ? {
                    ...mergedMerchandiseInfo,
                    topMedicalWarrantyContractDate: normalizedTopMedicalContractDate || null,
                    topMedicalWarrantyDuration: normalizedTopMedicalDuration || null,
                    topMedicalWarrantyLimitDate: normalizedTopMedicalLimitDate || null,
                    advWarrantyLimitDate: normalizedTopMedicalLimitDate || null,
                    equipmentMerchandiseItems: Array.isArray((mergedMerchandiseInfo as any).equipmentMerchandiseItems)
                        ? ((mergedMerchandiseInfo as any).equipmentMerchandiseItems as unknown[]).map((item) => {
                            if (!item || typeof item !== "object") return item;
                            return {
                                ...(item as Record<string, unknown>),
                                topMedicalWarrantyContractDate: normalizedTopMedicalContractDate || null,
                                topMedicalWarrantyDuration: normalizedTopMedicalDuration || null,
                                topMedicalWarrantyLimitDate: normalizedTopMedicalLimitDate || null,
                                advWarrantyLimitDate: normalizedTopMedicalLimitDate || null
                            };
                        })
                        : (mergedMerchandiseInfo as any).equipmentMerchandiseItems
                }
                : mergedMerchandiseInfo;
            const rawIncomingTechnicalDiagnosis = body?.technicalDiagnosis && typeof body.technicalDiagnosis === "object"
                ? body.technicalDiagnosis as Record<string, unknown>
                : null;
            const deletedImportRequestRefs = normalizeDeletedImportRequestRefs(rawIncomingTechnicalDiagnosis?.deletedImportRequestRefs);
            const incomingTechnicalDiagnosis = rawIncomingTechnicalDiagnosis
                ? Object.fromEntries(
                    Object.entries(rawIncomingTechnicalDiagnosis).filter(([key]) => key !== "deletedImportRequestRefs")
                )
                : null;
            technicalDiagnosisToSync = incomingTechnicalDiagnosis;
            const normalizedContractualDocuments = hasContractualDocuments
                ? normalizeContractualDocuments(body.contractualDocuments)
                : null;
            const notTakenMotif = body?.notTakenInChargeMotif ? String(body.notTakenInChargeMotif).trim() : null;
            const depositAgency = body?.depositAgency !== undefined ? String(body.depositAgency || "").trim() : null;
            const hasExistingMerchandisePayload = [
                existingMerchandiseInfo.articleCode,
                existingMerchandiseInfo.warrantyLabel,
                existingMerchandiseInfo.invoiceDate,
                existingMerchandiseInfo.shippingDate
            ].some((value) => Boolean(String(value || "").trim()));
            const merchandiseAlreadyRecorded =
                String(existingMerchandiseInfo.filledBy || "").toUpperCase() === "ADV"
                || String(existingMerchandiseInfo.filledAt || "").trim().length > 0
                || hasExistingMerchandisePayload
                || Boolean(currentRec?.ticket?.savHistory?.length);

            if (
                incomingMerch
                && !allowMerchandiseUpdate
                && (
                    String((incomingMerch as any).filledBy || "").toUpperCase() === "ADV"
                    || String((incomingMerch as any).filledAt || "").trim().length > 0
                )
                && (
                    String(currentRec?.status || "").toUpperCase() !== "PENDING_ADV_VERIFICATION"
                    || merchandiseAlreadyRecorded
                    || String(existingStoreReview.lastAction || "").toUpperCase() === "VALIDATE_AND_FORWARD"
                )
            ) {
                return NextResponse.json(
                    { error: "La vérification marchandise ADV a déjà été enregistrée pour ce dossier." },
                    { status: 400 }
                );
            }

            const updatedMeta: Record<string, unknown> = {
                ...existingMeta,
                ...(body?.advVerificationNote !== undefined ? { advVerificationNote: String(body.advVerificationNote || "") } : {}),
                ...(body?.depositAgency !== undefined ? { depositAgency: depositAgency || undefined } : {}),
                ...(notTakenMotif ? { notTakenInChargeMotif: notTakenMotif } : {}),
                ...(normalizedContractualDocuments ? {
                    storeReview: {
                        ...existingStoreReview,
                        contractualDocuments: normalizedContractualDocuments
                    }
                } : {}),
                ...((incomingMerch || normalizedTopMedicalWarrantyLimit) ? {
                    merchandiseInfo: merchandiseInfoWithTopMedicalLimit
                } : {}),
                ...(normalizedTopMedicalWarrantyLimit ? {
                    topMedicalWarrantyLimit: {
                        ...((existingMeta.topMedicalWarrantyLimit as Record<string, unknown>) || {}),
                        contractDate: normalizedTopMedicalContractDate || null,
                        duration: normalizedTopMedicalDuration || null,
                        limitDate: normalizedTopMedicalLimitDate || null
                    }
                } : {}),
                ...(incomingTechnicalDiagnosis ? {
                    technicalDiagnosis: {
                        ...((existingMeta.technicalDiagnosis as Record<string, unknown>) || {}),
                        ...incomingTechnicalDiagnosis
                    }
                } : {})
            };
            updatedChecklist = stringifyChecklistPayload({ sosAnswers: parsed.sosAnswers || {}, metadata: updatedMeta }) ?? undefined;
        }

        // Persist motif dans checklist si NOT_TAKEN_IN_CHARGE
        if (status === "NOT_TAKEN_IN_CHARGE" && body?.notTakenInChargeMotif && currentRec) {
            const parsed = parseChecklistPayload(currentRec.checklist);
            const existingMeta = (parsed.metadata || {}) as Record<string, unknown>;
            const updatedMeta: Record<string, unknown> = {
                ...existingMeta,
                notTakenInChargeMotif: String(body.notTakenInChargeMotif).trim()
            };
            updatedChecklist = stringifyChecklistPayload({ sosAnswers: parsed.sosAnswers || {}, metadata: updatedMeta }) ?? undefined;
        }

        const updated = await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                ...(status !== undefined ? { status } : {}),
                ...(ticketId !== undefined ? { ticketId: ticketId ? Number(ticketId) : null } : {}),
                ...(updatedChecklist !== undefined ? { checklist: updatedChecklist } : {})
            }
        });

        // Logger l'historique si le ticket existe
        const ticketForHistory = currentRec?.ticket;
        if (ticketForHistory && ticketForHistory.id && ticketForHistory.equipmentId) {
            const userId = body?.userId ? Number(body.userId) : 1;
            const ticketId_ = ticketForHistory.id;
            const equipmentId_ = ticketForHistory.equipmentId;

            if (technicalDiagnosisToSync?.repairEntries) {
                await syncPiecesTableRows({
                    ticketId: ticketId_,
                    equipmentId: equipmentId_,
                    userId,
                    entries: technicalDiagnosisToSync.repairEntries
                }).catch((error) => {
                    console.error("Synchronisation tableau pieces error:", error);
                });
            }

            const deletedImportRequestRefs = normalizeDeletedImportRequestRefs((body?.technicalDiagnosis as Record<string, unknown> | undefined)?.deletedImportRequestRefs);
            if (deletedImportRequestRefs.length > 0) {
                await prisma.purchase_order.deleteMany({
                    where: {
                        ref: { in: deletedImportRequestRefs },
                        ticketId: ticketId_
                    }
                }).catch((error) => {
                    console.error("Suppression demande import error:", error);
                });
            }

            if (status === "TAKEN_IN_CHARGE") {
                await createSavHistoryOnce({
                    ticketId: ticketId_,
                    equipmentId: equipmentId_,
                    userId,
                    action: "ADV_DECISION_TAKEN",
                    note: "Demande d'intervention prise en charge et transmise au responsable technique."
                }).catch(() => {});
            } else if (status === "READY_FOR_TECH_MANAGER_ASSIGNMENT") {
                await createSavHistoryOnce({
                    ticketId: ticketId_,
                    equipmentId: equipmentId_,
                    userId,
                    action: "ADV_DECISION_TAKEN",
                    note: "Devis approuvé par le client. Dossier transmis au responsable technique pour affectation."
                }).catch(() => {});
            } else if (status === "NOT_TAKEN_IN_CHARGE") {
                const motif = body?.notTakenInChargeMotif ? String(body.notTakenInChargeMotif).trim() : "Non précisé";
                await createSavHistoryOnce({
                    ticketId: ticketId_,
                    equipmentId: equipmentId_,
                    userId,
                    action: "ADV_DECISION_REFUS",
                    note: `Non prise en charge. Motif: ${motif}`
                }).catch(() => {});
            } else if (needsMerchandiseHistory) {
                await createSavHistoryOnce({
                    ticketId: ticketId_,
                    equipmentId: equipmentId_,
                    userId,
                    action: "ADV_MERCHANDISE_REVIEW",
                    note: "Vérification marchandise ADV enregistrée."
                }).catch(() => {});
            }
        }

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("PATCH error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    context: any
) {
    const params = await context.params;
    try {
        const { id } = await params;
        const reclamationId = parseInt(id);
        await prisma.reclamation.delete({
            where: { id: reclamationId }
        });
        await resetReclamationAutoIncrementIfEmpty();
        return NextResponse.json({ message: "Réclamation supprimée" });
    } catch (error: any) {
        console.error("DELETE error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


