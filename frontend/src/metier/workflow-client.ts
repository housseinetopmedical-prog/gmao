import { formatFallbackStatusLabel } from "@/metier/libelles-statut";
import { hasHistoryGraceExpired } from "@/metier/historique-ticket";

export type ClientAttachment = {
    name: string;
    type?: string;
    title?: string;
    kind?: "DOCUMENT" | "MEDIA";
    dataUrl?: string;
    sentAt?: string;
};

// Cette structure regroupe presque toutes les donnÃ©es mÃ©tier ajoutÃ©es au ticket :
// matÃ©riel, devis, documents, suivi, validation, import, diagnostic, etc.
export type ClientChecklistMetadata = {
    breCode?: string;
    firstName?: string;
    lastName?: string;
    clientCode?: string;
    establishment?: string;
    establishmentType?: string;
    city?: string;
    specialtySector?: string;
    specialty?: string;
    specialtyOther?: string;
    pn?: string;
    service?: string;
    contactPerson?: string;
    urgency?: string;
    publicMarketNumber?: string;
    location?: string;
    equipmentName?: string;
    accessories?: string;
    brand?: string;
    model?: string;
    phoneFixed?: string;
    errorMessageDetails?: string;
    submittedByRole?: string;
    source?: string;
    depositAgency?: string;
    entryRepairSlip?: {
        designation?: string;
        serialNumber?: string;
        pn?: string;
        city?: string | null;
        equipmentItems?: Array<{
            designation?: string;
            serialNumber?: string;
            pn?: string;
            articleCode?: string | null;
            quantity?: number | null;
        }>;
        priority?: string;
        quantity?: number | null;
        accessories?: string | null;
        failureDescription?: string | null;
        clientFirstName?: string;
        clientLastName?: string;
        phone?: string;
        mobilePhones?: string[];
        landlinePhone?: string;
        email?: string;
        diagnosticPrice?: number | null;
        diagnosticPaymentStatus?: string;
        diagnosticPaymentMethod?: string;
        submittedAt?: string;
        submittedByUserId?: number | null;
    };
    merchandiseInfo?: {
        articleCode?: string | null;
        warrantyLabel?: string | null;
        warrantyStatus?: string | null;
        topMedicalWarrantyContractDate?: string | null;
        topMedicalWarrantyDuration?: string | null;
        topMedicalWarrantyLimitDate?: string | null;
        advWarrantyLimitDate?: string | null;
        invoiceDate?: string | null;
        shippingDate?: string | null;
        warrantyLimitDate?: string | null;
        equipmentMerchandiseItems?: Array<{
            entryId?: string;
            materialIndex?: number | null;
            index?: number | null;
            label?: string;
            quantity?: number | null;
            supplier?: string | null;
            articleCode?: string | null;
            warrantyLabel?: string | null;
            invoiceDate?: string | null;
            shippingDate?: string | null;
            warrantyLimitDate?: string | null;
            topMedicalWarrantyContractDate?: string | null;
            topMedicalWarrantyDuration?: string | null;
            topMedicalWarrantyLimitDate?: string | null;
            advWarrantyLimitDate?: string | null;
        }>;
        magasinierNotes?: string | null;
        filledBy?: string | null;
        filledByUserId?: number | null;
        filledAt?: string | null;
        updatedAt?: string;
        updatedByUserId?: number | null;
    };
    technicalManagerReview?: {
        decision?: string;
        managerNote?: string | null;
        reviewedAt?: string;
        reviewedByUserId?: number | null;
    };
    technicalDiagnosis?: {
        repairEntries?: Array<{
            id?: string;
            equipmentIndex?: number | null;
            equipmentLabel?: string;
            equipmentMeta?: string;
            nature?: string | null;
            designation?: string | null;
            quantity?: number | null;
            laborHours?: number | null;
            supplierCode?: string | null;
            sageCode?: string | null;
            costPrice?: number | null;
            purchasePrice?: number | null;
            purchaseCurrency?: string | null;
            exportPrice?: number | null;
            exportCurrency?: string | null;
            salePriceTtc?: number | null;
            importRequestRef?: string | null;
            importSentAt?: string | null;
            partsToReplace?: string | null;
            supplierReference?: string | null;
            sageReference?: string | null;
            partsToRepair?: string | null;
            purchasedComponentsPrice?: number | null;
            partsToFabricate?: string | null;
            softwareUpdate?: string | null;
            softwareInstallation?: string | null;
        }>;
        repairType?: string | null;
        partsToReplace?: string | null;
        partsToRepair?: string | null;
        comment?: string | null;
        estimatedDuration?: string | null;
        advQuotePartsToReplace?: string | null;
        advQuotePartsToRepair?: string | null;
        advQuoteComment?: string | null;
        advQuoteEstimatedDuration?: string | null;
        advQuoteReportedAt?: string;
        advQuoteReportedByUserId?: number | null;
        repairAmount?: number | null;
        usedParts?: Array<{
            name?: string;
            price?: number | null;
            equipmentIndex?: number | null;
            equipmentLabel?: string;
            equipmentSerialNumber?: string;
            equipmentPn?: string;
        }>;
        usedPartsUpdatedAt?: string;
        usedPartsUpdatedByUserId?: number | null;
        reportedAt?: string;
        reportedByUserId?: number | null;
    };
    quote?: {
        amount?: number;
        comment?: string | null;
        sageNumber?: string | null;
        delay?: string | null;
        status?: string;
        sentAt?: string;
        sentByUserId?: number | null;
        clientComment?: string | null;
        clientDecisionAt?: string;
        documents?: ClientAttachment[];
    };
    facturationInvoice?: ClientAttachment;
    facturationCreatedTicket?: {
        clientCode?: string | null;
        specialty?: string | null;
        diagnosticPrice?: string | number | null;
        diagnosticPaymentStatus?: string | null;
        diagnosticPaymentMethod?: string | null;
        failureDescription?: string | null;
        accessories?: string | null;
        updatedAt?: string | null;
    };
    attachments?: ClientAttachment[];
    storeReview?: {
        customsClearanceDate?: string;
        note?: string;
        updatedAt?: string;
        updatedByUserId?: number | null;
        lastAction?: string;
        contractualDocuments?: ClientAttachment[];
    };
};

export type ClientChecklistPayload = {
    sosAnswers?: Record<string, boolean | null>;
    metadata?: ClientChecklistMetadata;
};

export type TimelineEvent = {
    id: string;
    label: string;
    detail?: string;
    actor?: "CLIENT" | "ADV" | "SAV" | "TECHNICIAN" | "RESPONSABLE_TECHNIQUE";
    downloadUrl?: string;
    downloadLabel?: string;
    at: string;
};

export const SOS_CHECKLIST_TITLE = "Contrôles préalables";

export const SOS_LABELS_FR: Record<string, string> = {
    breaker: "Avez-vous vérifié le disjoncteur qui contrôle la prise ?",
    indicator: "Le voyant de mise sous tension est-il actif ?",
    socket: "La prise de l'appareil est-elle fonctionnelle ?",
    cables: "Le câble d'alimentation est-il bien inséré et fonctionnel ?",
    error: "Un message d'erreur apparaît ?",
    restart: "Avez-vous tenté de redémarrer l'équipement ?",
    safety: "Existe-t-il un risque électrique visible ? (câble brûlé, prise cassée, étincelle...)"
};

export const SOS_QUESTION_ORDER = ["breaker", "socket", "cables", "indicator", "restart", "error", "safety"] as const;

export const SOS_QUESTIONS = SOS_QUESTION_ORDER.map((key, index) => ({
    id: key,
    label: `${index + 1}. ${SOS_LABELS_FR[key]}`
}));

// Normalise les clÃ©s des questions SOS pour accepter plusieurs variantes d'Ã©criture.
function normalizeSosKey(rawKey: string): string {
    const normalized = String(rawKey || "")
        .trim()
        .toLowerCase()
        .replace(/^sos[_-]?/, "");

    if (normalized === "voyant" || normalized === "led" || normalized === "light" || normalized === "indicator_light") {
        return "indicator";
    }

    return normalized;
}

export function getSosLabelFr(rawKey: string): string {
    const normalized = normalizeSosKey(rawKey);

    if (!normalized) return "Élément SOS";
    if (SOS_LABELS_FR[normalized]) return SOS_LABELS_FR[normalized];

    return normalized
        .split(/[_-]+/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

const TICKET_STATUS_LABELS: Record<string, string> = {
    OPEN: "Nouveau",
    PENDING_ADV_VERIFICATION: "Vérification ADV en cours",
        DIAGNOSTIC: "Diagnostic SAV",
    DECISION: "Décision",
    PENDING_PARTS: "Attente pièces",
    REPAIR: "Réparation en cours",
    QUALITY_TEST: "Réparation en cours",
    READY_FOR_DELIVERY: "Matériel réparé à livrer",
    CLOSED: "Dossier clôturé"
};

export const CLIENT_ATTACHMENT_RETENTION_MONTHS = 6;

function getClientAttachmentRetentionCutoff(referenceDate: Date = new Date()) {
    const cutoff = new Date(referenceDate);
    cutoff.setMonth(cutoff.getMonth() - CLIENT_ATTACHMENT_RETENTION_MONTHS);
    return cutoff;
}

function toValidDate(raw: unknown): Date | null {
    const value = String(raw || "").trim();
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toOptionalNumber(raw: unknown): number | undefined {
    if (raw === null || raw === undefined || raw === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
}

export function isClientAttachmentExpired(
    attachment: Pick<ClientAttachment, "sentAt"> | null | undefined,
    fallbackSentAt?: string | null,
    referenceDate: Date = new Date()
): boolean {
    const sentAt = toValidDate(attachment?.sentAt || fallbackSentAt || "");
    if (!sentAt) return false;
    return sentAt.getTime() <= getClientAttachmentRetentionCutoff(referenceDate).getTime();
}

export function pruneExpiredClientAttachments(
    attachments: ClientAttachment[] | null | undefined,
    fallbackSentAt?: string | null,
    referenceDate: Date = new Date()
): ClientAttachment[] {
    if (!Array.isArray(attachments)) return [];
    return attachments.filter((attachment) => !isClientAttachmentExpired(attachment, fallbackSentAt, referenceDate));
}

export function shouldApplyRepairedTicketDocumentRetention(reclamation: any): boolean {
    const ticketStatus = String(reclamation?.ticket?.status || reclamation?.status || "").trim().toUpperCase();
    if (["READY_FOR_DELIVERY", "CLOSED", "TREATED", "TRAITE", "TRAITÉ"].includes(ticketStatus)) return true;

    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    return history.some((entry: any) => {
        const action = String(entry?.action || "").trim().toUpperCase();
        const note = String(entry?.note || "").trim().toUpperCase();
        return action.includes("READY_FOR_DELIVERY")
            || action.includes("ADMINISTRATIVE_CLOSURE")
            || action.includes("ADV_CLOSURE")
            || action.includes("CLOSED")
            || note.includes("MATÉRIEL RÉPARÉ À LIVRER")
            || note.includes("MATERIEL REPARE A LIVRER")
            || note.includes("TICKET TRAITÉ")
            || note.includes("TICKET TRAITE");
    });
}

export function parseChecklistPayload(raw: unknown): ClientChecklistPayload {
    if (!raw) return {};

    const fromObject = (value: Record<string, unknown>): ClientChecklistPayload => {
        const hasStructuredPayload = "sosAnswers" in value || "metadata" in value;
        if (hasStructuredPayload) {
            const metadata = value.metadata && typeof value.metadata === "object"
                ? (value.metadata as Record<string, unknown>)
                : undefined;
            const attachmentsRaw = metadata?.attachments;
            const storeReviewDocsRaw =
                metadata?.storeReview && typeof metadata.storeReview === "object"
                    ? ((metadata.storeReview as Record<string, unknown>).contractualDocuments as unknown)
                    : undefined;
            const attachments: ClientAttachment[] | undefined = Array.isArray(attachmentsRaw)
                ? attachmentsRaw
                      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                      .map((item) => {
                          const kind: ClientAttachment["kind"] =
                              item.kind === "MEDIA" ? "MEDIA" : item.kind === "DOCUMENT" ? "DOCUMENT" : undefined;

                          return {
                              name: String(item.name || "Pièce jointe"),
                              type: item.type ? String(item.type) : undefined,
                              title: item.title ? String(item.title) : undefined,
                              kind,
                              dataUrl: item.dataUrl ? String(item.dataUrl) : undefined,
                              sentAt: item.sentAt ? String(item.sentAt) : undefined
                          };
                      })
                      .filter((item) => Boolean(item.dataUrl))
                : undefined;
            const storeReviewDocs: ClientAttachment[] | undefined = Array.isArray(storeReviewDocsRaw)
                ? storeReviewDocsRaw
                      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                      .map((item) => ({
                          name: String(item.name || "Document contractuel"),
                          type: item.type ? String(item.type) : undefined,
                          title: item.title ? String(item.title) : undefined,
                          kind: item.kind === "MEDIA" ? "MEDIA" : "DOCUMENT",
                          dataUrl: item.dataUrl ? String(item.dataUrl) : undefined
                      }))
                : undefined;

            return {
                sosAnswers:
                    value.sosAnswers && typeof value.sosAnswers === "object"
                        ? (value.sosAnswers as Record<string, boolean | null>)
                        : undefined,
                metadata: {
                    breCode: metadata?.breCode ? String(metadata.breCode) : undefined,
                    firstName: metadata?.firstName ? String(metadata.firstName) : undefined,
                    lastName: metadata?.lastName ? String(metadata.lastName) : undefined,
                    establishment: metadata?.establishment ? String(metadata.establishment) : undefined,
                    establishmentType: metadata?.establishmentType ? String(metadata.establishmentType) : undefined,
                    city: metadata?.city ? String(metadata.city) : undefined,
                    specialtySector: metadata?.specialtySector ? String(metadata.specialtySector) : undefined,
                    specialty: metadata?.specialty ? String(metadata.specialty) : undefined,
                    specialtyOther: metadata?.specialtyOther ? String(metadata.specialtyOther) : undefined,
                    pn: metadata?.pn ? String(metadata.pn) : undefined,
                    service: metadata?.service ? String(metadata.service) : undefined,
                    contactPerson: metadata?.contactPerson ? String(metadata.contactPerson) : undefined,
                    urgency: metadata?.urgency ? String(metadata.urgency) : undefined,
                    location: metadata?.location ? String(metadata.location) : undefined,
                    equipmentName: metadata?.equipmentName ? String(metadata.equipmentName) : undefined,
                    accessories: metadata?.accessories ? String(metadata.accessories) : undefined,
                    brand: metadata?.brand ? String(metadata.brand) : undefined,
                    model: metadata?.model ? String(metadata.model) : undefined,
                    phoneFixed: metadata?.phoneFixed ? String(metadata.phoneFixed) : undefined,
                    errorMessageDetails: metadata?.errorMessageDetails ? String(metadata.errorMessageDetails) : undefined,
                    publicMarketNumber: metadata?.publicMarketNumber ? String(metadata.publicMarketNumber) : undefined,
                    submittedByRole: metadata?.submittedByRole ? String(metadata.submittedByRole) : undefined,
                    source: metadata?.source ? String(metadata.source) : undefined,
                    depositAgency: metadata?.depositAgency ? String(metadata.depositAgency) : undefined,
                    entryRepairSlip:
                        metadata?.entryRepairSlip && typeof metadata.entryRepairSlip === "object"
                            ? {
                                  designation: (metadata.entryRepairSlip as Record<string, unknown>).designation
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).designation)
                                      : undefined,
                                  serialNumber: (metadata.entryRepairSlip as Record<string, unknown>).serialNumber
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).serialNumber)
                                      : undefined,
                                  pn: (metadata.entryRepairSlip as Record<string, unknown>).pn
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).pn)
                                      : undefined,
                                  equipmentItems: Array.isArray((metadata.entryRepairSlip as Record<string, unknown>).equipmentItems)
                                      ? ((metadata.entryRepairSlip as Record<string, unknown>).equipmentItems as unknown[])
                                            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                                            .map((item) => ({
                                                designation: item.designation ? String(item.designation) : undefined,
                                                serialNumber: item.serialNumber ? String(item.serialNumber) : undefined,
                                                pn: item.pn ? String(item.pn) : undefined,
                                                quantity: toOptionalNumber(item.quantity)
                                            }))
                                            .filter((item) => Boolean(item.designation || item.serialNumber || item.pn))
                                      : undefined,
                                  quantity: toOptionalNumber((metadata.entryRepairSlip as Record<string, unknown>).quantity),
                                  accessories: (metadata.entryRepairSlip as Record<string, unknown>).accessories
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).accessories)
                                      : undefined,
                                  failureDescription: (metadata.entryRepairSlip as Record<string, unknown>).failureDescription
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).failureDescription)
                                      : undefined,
                                  clientFirstName: (metadata.entryRepairSlip as Record<string, unknown>).clientFirstName
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).clientFirstName)
                                      : undefined,
                                  clientLastName: (metadata.entryRepairSlip as Record<string, unknown>).clientLastName
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).clientLastName)
                                      : undefined,
                                  phone: (metadata.entryRepairSlip as Record<string, unknown>).phone
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).phone)
                                      : undefined,
                                  mobilePhones: Array.isArray((metadata.entryRepairSlip as Record<string, unknown>).mobilePhones)
                                      ? ((metadata.entryRepairSlip as Record<string, unknown>).mobilePhones as unknown[])
                                            .map((item) => String(item || "").trim())
                                            .filter(Boolean)
                                      : undefined,
                                  landlinePhone: (metadata.entryRepairSlip as Record<string, unknown>).landlinePhone
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).landlinePhone)
                                      : undefined,
                                  email: (metadata.entryRepairSlip as Record<string, unknown>).email
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).email)
                                      : undefined,
                                  diagnosticPrice: Number((metadata.entryRepairSlip as Record<string, unknown>).diagnosticPrice || 0) || undefined,
                                  diagnosticPaymentStatus: (metadata.entryRepairSlip as Record<string, unknown>).diagnosticPaymentStatus
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).diagnosticPaymentStatus)
                                      : undefined,
                                  diagnosticPaymentMethod: (metadata.entryRepairSlip as Record<string, unknown>).diagnosticPaymentMethod
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).diagnosticPaymentMethod)
                                      : undefined,
                                  submittedAt: (metadata.entryRepairSlip as Record<string, unknown>).submittedAt
                                      ? String((metadata.entryRepairSlip as Record<string, unknown>).submittedAt)
                                      : undefined,
                                  submittedByUserId: Number((metadata.entryRepairSlip as Record<string, unknown>).submittedByUserId || 0) || undefined
                              }
                            : undefined,
                    merchandiseInfo:
                        metadata?.merchandiseInfo && typeof metadata.merchandiseInfo === "object"
                            ? {
                                  articleCode: (metadata.merchandiseInfo as Record<string, unknown>).articleCode
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).articleCode)
                                      : undefined,
                                  warrantyLabel: (metadata.merchandiseInfo as Record<string, unknown>).warrantyLabel
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).warrantyLabel)
                                      : undefined,
                                  warrantyStatus: (metadata.merchandiseInfo as Record<string, unknown>).warrantyStatus
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).warrantyStatus)
                                      : undefined,
                                  topMedicalWarrantyContractDate: (metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyContractDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyContractDate)
                                      : undefined,
                                  topMedicalWarrantyDuration: (metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyDuration
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyDuration)
                                      : undefined,
                                  topMedicalWarrantyLimitDate: (metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyLimitDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).topMedicalWarrantyLimitDate)
                                      : undefined,
                                  advWarrantyLimitDate: (metadata.merchandiseInfo as Record<string, unknown>).advWarrantyLimitDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).advWarrantyLimitDate)
                                      : undefined,
                                  invoiceDate: (metadata.merchandiseInfo as Record<string, unknown>).invoiceDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).invoiceDate)
                                      : undefined,
                                  shippingDate: (metadata.merchandiseInfo as Record<string, unknown>).shippingDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).shippingDate)
                                      : undefined,
                                  warrantyLimitDate: (metadata.merchandiseInfo as Record<string, unknown>).warrantyLimitDate
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).warrantyLimitDate)
                                      : undefined,
                                  equipmentMerchandiseItems: Array.isArray((metadata.merchandiseInfo as Record<string, unknown>).equipmentMerchandiseItems)
                                      ? ((metadata.merchandiseInfo as Record<string, unknown>).equipmentMerchandiseItems as Array<Record<string, unknown>>).map((item, index) => ({
                                            entryId: item.entryId ? String(item.entryId) : undefined,
                                            materialIndex: Number(item.materialIndex ?? item.index ?? index),
                                            index: Number(item.index ?? item.materialIndex ?? index),
                                            label: item.label ? String(item.label) : undefined,
                                            quantity: Number(item.quantity || 1) || 1,
                                            supplier: item.supplier ? String(item.supplier) : undefined,
                                            articleCode: item.articleCode ? String(item.articleCode) : undefined,
                                            warrantyLabel: item.warrantyLabel ? String(item.warrantyLabel) : undefined,
                                            invoiceDate: item.invoiceDate ? String(item.invoiceDate) : undefined,
                                            shippingDate: item.shippingDate ? String(item.shippingDate) : undefined,
                                            warrantyLimitDate: item.warrantyLimitDate ? String(item.warrantyLimitDate) : undefined,
                                            topMedicalWarrantyContractDate: item.topMedicalWarrantyContractDate ? String(item.topMedicalWarrantyContractDate) : undefined,
                                            topMedicalWarrantyDuration: item.topMedicalWarrantyDuration ? String(item.topMedicalWarrantyDuration) : undefined,
                                            topMedicalWarrantyLimitDate: item.topMedicalWarrantyLimitDate ? String(item.topMedicalWarrantyLimitDate) : undefined,
                                            advWarrantyLimitDate: item.advWarrantyLimitDate ? String(item.advWarrantyLimitDate) : undefined
                                        }))
                                      : undefined,
                                  magasinierNotes: (metadata.merchandiseInfo as Record<string, unknown>).magasinierNotes
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).magasinierNotes)
                                      : undefined,
                                  filledBy: (metadata.merchandiseInfo as Record<string, unknown>).filledBy
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).filledBy)
                                      : undefined,
                                  filledByUserId: Number((metadata.merchandiseInfo as Record<string, unknown>).filledByUserId || 0) || undefined,
                                  filledAt: (metadata.merchandiseInfo as Record<string, unknown>).filledAt
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).filledAt)
                                      : undefined,
                                  updatedAt: (metadata.merchandiseInfo as Record<string, unknown>).updatedAt
                                      ? String((metadata.merchandiseInfo as Record<string, unknown>).updatedAt)
                                      : undefined,
                                  updatedByUserId: Number((metadata.merchandiseInfo as Record<string, unknown>).updatedByUserId || 0) || undefined
                              }
                            : undefined,
                    technicalManagerReview:
                        metadata?.technicalManagerReview && typeof metadata.technicalManagerReview === "object"
                            ? {
                                  decision: (metadata.technicalManagerReview as Record<string, unknown>).decision
                                      ? String((metadata.technicalManagerReview as Record<string, unknown>).decision)
                                      : undefined,
                                  managerNote: (metadata.technicalManagerReview as Record<string, unknown>).managerNote
                                      ? String((metadata.technicalManagerReview as Record<string, unknown>).managerNote)
                                      : undefined,
                                  reviewedAt: (metadata.technicalManagerReview as Record<string, unknown>).reviewedAt
                                      ? String((metadata.technicalManagerReview as Record<string, unknown>).reviewedAt)
                                      : undefined,
                                  reviewedByUserId: Number((metadata.technicalManagerReview as Record<string, unknown>).reviewedByUserId || 0) || undefined
                              }
                            : undefined,
                    technicalDiagnosis:
                        metadata?.technicalDiagnosis && typeof metadata.technicalDiagnosis === "object"
                            ? {
                                  repairEntries: Array.isArray((metadata.technicalDiagnosis as Record<string, unknown>).repairEntries)
                                      ? ((metadata.technicalDiagnosis as Record<string, unknown>).repairEntries as unknown[])
                                            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                                            .map((item, index) => ({
                                                id: item.id ? String(item.id) : `entry-${index}`,
                                                equipmentIndex: Number(item.equipmentIndex || 0) || 0,
                                                equipmentLabel: item.equipmentLabel ? String(item.equipmentLabel) : undefined,
                                                equipmentMeta: item.equipmentMeta ? String(item.equipmentMeta) : undefined,
                                                nature: item.nature ? String(item.nature) : undefined,
                                                designation: item.designation ? String(item.designation) : undefined,
                                                quantity: toOptionalNumber(item.quantity),
                                                laborHours: toOptionalNumber(item.laborHours),
                                                supplierCode: item.supplierCode ? String(item.supplierCode) : undefined,
                                                sageCode: item.sageCode ? String(item.sageCode) : undefined,
                                                 costPrice: toOptionalNumber(item.costPrice),
                                                 purchasePrice: toOptionalNumber(item.purchasePrice),
                                                 purchaseCurrency: item.purchaseCurrency ? String(item.purchaseCurrency) : undefined,
                                                 exportPrice: toOptionalNumber(item.exportPrice),
                                                 exportCurrency: item.exportCurrency ? String(item.exportCurrency) : undefined,
                                                 salePriceTtc: toOptionalNumber(item.salePriceTtc),
                                                importRequestRef: item.importRequestRef ? String(item.importRequestRef) : undefined,
                                                importSentAt: item.importSentAt ? String(item.importSentAt) : undefined,
                                                partsToReplace: item.partsToReplace ? String(item.partsToReplace) : undefined,
                                                supplierReference: item.supplierReference ? String(item.supplierReference) : undefined,
                                                sageReference: item.sageReference ? String(item.sageReference) : undefined,
                                                partsToRepair: item.partsToRepair ? String(item.partsToRepair) : undefined,
                                                purchasedComponentsPrice: toOptionalNumber(item.purchasedComponentsPrice),
                                                partsToFabricate: item.partsToFabricate ? String(item.partsToFabricate) : undefined,
                                                softwareUpdate: item.softwareUpdate ? String(item.softwareUpdate) : undefined,
                                                softwareInstallation: item.softwareInstallation ? String(item.softwareInstallation) : undefined
                                            }))
                                            .filter((item) =>
                                                Boolean(
                                                    item.designation
                                                    || item.quantity !== undefined
                                                    || item.laborHours !== undefined
                                                    || item.supplierCode
                                                    || item.sageCode
                                                    || item.costPrice !== undefined
                                                     || item.purchasePrice !== undefined
                                                     || item.purchaseCurrency
                                                     || item.exportPrice !== undefined
                                                     || item.exportCurrency
                                                     || item.salePriceTtc !== undefined
                                                    || item.importRequestRef
                                                    || item.importSentAt
                                                    || item.partsToReplace
                                                    || item.supplierReference
                                                    || item.sageReference
                                                    || item.partsToRepair
                                                    || item.purchasedComponentsPrice !== undefined
                                                    || item.partsToFabricate
                                                    || item.softwareUpdate
                                                    || item.softwareInstallation
                                                )
                                            )
                                      : undefined,
                                  partsToReplace: (metadata.technicalDiagnosis as Record<string, unknown>).partsToReplace
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).partsToReplace)
                                      : undefined,
                                  repairType: (metadata.technicalDiagnosis as Record<string, unknown>).repairType
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).repairType)
                                      : undefined,
                                  partsToRepair: (metadata.technicalDiagnosis as Record<string, unknown>).partsToRepair
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).partsToRepair)
                                      : undefined,
                                  comment: (metadata.technicalDiagnosis as Record<string, unknown>).comment
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).comment)
                                      : undefined,
                                  estimatedDuration: (metadata.technicalDiagnosis as Record<string, unknown>).estimatedDuration
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).estimatedDuration)
                                      : undefined,
                                  repairAmount: toOptionalNumber((metadata.technicalDiagnosis as Record<string, unknown>).repairAmount),
                                  usedParts: Array.isArray((metadata.technicalDiagnosis as Record<string, unknown>).usedParts)
                                      ? ((metadata.technicalDiagnosis as Record<string, unknown>).usedParts as unknown[])
                                            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
                                            .map((item) => ({
                                                name: item.name ? String(item.name) : undefined,
                                                price: toOptionalNumber(item.price),
                                                equipmentIndex: Number(item.equipmentIndex || 0) || 0,
                                                equipmentLabel: item.equipmentLabel ? String(item.equipmentLabel) : undefined,
                                                equipmentSerialNumber: item.equipmentSerialNumber ? String(item.equipmentSerialNumber) : undefined,
                                                equipmentPn: item.equipmentPn ? String(item.equipmentPn) : undefined
                                            }))
                                            .filter((item) => Boolean(item.name || item.price !== null))
                                      : undefined,
                                  usedPartsUpdatedAt: (metadata.technicalDiagnosis as Record<string, unknown>).usedPartsUpdatedAt
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).usedPartsUpdatedAt)
                                      : undefined,
                                  usedPartsUpdatedByUserId: Number((metadata.technicalDiagnosis as Record<string, unknown>).usedPartsUpdatedByUserId || 0) || undefined,
                                  reportedAt: (metadata.technicalDiagnosis as Record<string, unknown>).reportedAt
                                      ? String((metadata.technicalDiagnosis as Record<string, unknown>).reportedAt)
                                      : undefined,
                                  reportedByUserId: Number((metadata.technicalDiagnosis as Record<string, unknown>).reportedByUserId || 0) || undefined
                              }
                            : undefined,
                    quote:
                        metadata?.quote && typeof metadata.quote === "object"
                            ? {
                                  amount: Number((metadata.quote as Record<string, unknown>).amount || 0) || undefined,
                                  comment: (metadata.quote as Record<string, unknown>).comment
                                      ? String((metadata.quote as Record<string, unknown>).comment)
                                      : undefined,
                                  sageNumber: (metadata.quote as Record<string, unknown>).sageNumber
                                      ? String((metadata.quote as Record<string, unknown>).sageNumber)
                                      : undefined,
                                  delay: (metadata.quote as Record<string, unknown>).delay
                                      ? String((metadata.quote as Record<string, unknown>).delay)
                                      : undefined,
                                  status: (metadata.quote as Record<string, unknown>).status
                                      ? String((metadata.quote as Record<string, unknown>).status)
                                      : undefined,
                                  sentAt: (metadata.quote as Record<string, unknown>).sentAt
                                      ? String((metadata.quote as Record<string, unknown>).sentAt)
                                      : undefined,
                                  sentByUserId: Number((metadata.quote as Record<string, unknown>).sentByUserId || 0) || undefined,
                                  clientComment: (metadata.quote as Record<string, unknown>).clientComment
                                      ? String((metadata.quote as Record<string, unknown>).clientComment)
                                      : undefined,
                                  clientDecisionAt: (metadata.quote as Record<string, unknown>).clientDecisionAt
                                      ? String((metadata.quote as Record<string, unknown>).clientDecisionAt)
                                      : undefined,
                                  documents: Array.isArray((metadata.quote as Record<string, unknown>).documents)
                                      ? ((metadata.quote as Record<string, unknown>).documents as Array<Record<string, unknown>>)
                                            .map((doc) => {
                                                const kind: ClientAttachment["kind"] = doc.kind === "MEDIA" ? "MEDIA" : "DOCUMENT";
                                                return {
                                                    name: String(doc.name || "Document devis"),
                                                    type: doc.type ? String(doc.type) : undefined,
                                                    title: doc.title ? String(doc.title) : undefined,
                                                    kind,
                                                    dataUrl: doc.dataUrl ? String(doc.dataUrl) : undefined,
                                                    sentAt: doc.sentAt ? String(doc.sentAt) : undefined
                                                };
                                            })
                                            .filter((doc) => Boolean(doc.dataUrl))
                                      : undefined
                              }
                            : undefined,
                    facturationInvoice:
                        metadata?.facturationInvoice && typeof metadata.facturationInvoice === "object"
                            ? {
                                  name: String((metadata.facturationInvoice as Record<string, unknown>).name || "Facture"),
                                  type: (metadata.facturationInvoice as Record<string, unknown>).type
                                      ? String((metadata.facturationInvoice as Record<string, unknown>).type)
                                      : undefined,
                                  title: (metadata.facturationInvoice as Record<string, unknown>).title
                                      ? String((metadata.facturationInvoice as Record<string, unknown>).title)
                                      : "Facture",
                                  kind: "DOCUMENT",
                                  dataUrl: (metadata.facturationInvoice as Record<string, unknown>).dataUrl
                                      ? String((metadata.facturationInvoice as Record<string, unknown>).dataUrl)
                                      : undefined,
                                  sentAt: (metadata.facturationInvoice as Record<string, unknown>).uploadedAt
                                      ? String((metadata.facturationInvoice as Record<string, unknown>).uploadedAt)
                                      : undefined
                              }
                            : undefined,
                    attachments,
                    storeReview:
                        metadata?.storeReview && typeof metadata.storeReview === "object"
                            ? {
                                  customsClearanceDate: (metadata.storeReview as Record<string, unknown>).customsClearanceDate
                                      ? String((metadata.storeReview as Record<string, unknown>).customsClearanceDate)
                                      : undefined,
                                  note: (metadata.storeReview as Record<string, unknown>).note
                                      ? String((metadata.storeReview as Record<string, unknown>).note)
                                      : undefined,
                                  updatedAt: (metadata.storeReview as Record<string, unknown>).updatedAt
                                      ? String((metadata.storeReview as Record<string, unknown>).updatedAt)
                                      : undefined,
                                  updatedByUserId: Number((metadata.storeReview as Record<string, unknown>).updatedByUserId || 0) || undefined,
                                  lastAction: (metadata.storeReview as Record<string, unknown>).lastAction
                                      ? String((metadata.storeReview as Record<string, unknown>).lastAction)
                                      : undefined,
                                  contractualDocuments: storeReviewDocs
                              }
                            : undefined
                }
            };
        }

        const legacyAnswers: Record<string, boolean | null> = {};
        Object.entries(value).forEach(([key, entryValue]) => {
            if (typeof entryValue === "boolean") {
                legacyAnswers[key] = entryValue;
            }
        });

        return {
            sosAnswers: Object.keys(legacyAnswers).length > 0 ? legacyAnswers : undefined
        };
    };

    if (typeof raw === "string") {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                return fromObject(parsed as Record<string, unknown>);
            }
            return {};
        } catch {
            return {};
        }
    }

    if (typeof raw === "object") {
        return fromObject(raw as Record<string, unknown>);
    }

    return {};
}

export function getSosAnswerLabel(value: boolean | null | undefined): string {
    if (value === true) return "Oui";
    if (value === false) return "Non";
    return "Non renseigné";
}

export function getOrderedSosAnswers(raw: unknown): Array<{ key: string; label: string; value: boolean | null }> {
    const payload = parseChecklistPayload(raw);
    const answers = payload?.sosAnswers || {};
    const normalizedAnswers = new Map<string, boolean | null>();

    Object.entries(answers).forEach(([rawKey, rawValue]) => {
        const key = normalizeSosKey(rawKey);
        if (!key) return;
        normalizedAnswers.set(key, typeof rawValue === "boolean" ? rawValue : null);
    });

    const orderedKeys = [
        ...SOS_QUESTION_ORDER,
        ...Array.from(normalizedAnswers.keys()).filter((key) => !SOS_QUESTION_ORDER.includes(key as (typeof SOS_QUESTION_ORDER)[number]))
    ];

    return orderedKeys.map((key) => ({
        key,
        label: getSosLabelFr(key),
        value: normalizedAnswers.has(key) ? normalizedAnswers.get(key) ?? null : null
    }));
}

export function stringifyChecklistPayload(raw: unknown): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "string") return raw;

    try {
        return JSON.stringify(raw);
    } catch {
        return null;
    }
}

export function getTicketStatusLabel(status: string | null | undefined): string {
    if (!status) return "En attente";
    return TICKET_STATUS_LABELS[status] || formatFallbackStatusLabel(status);
}

type ParsedHistoryNote = {
    text: string;
    downloadUrl?: string;
    reportNumber?: string;
};

type QualificationHistoryDocument = {
    name?: string;
    type?: string;
    url?: string;
    id?: string;
};

type QualificationHistoryPayload = {
    documents?: QualificationHistoryDocument[];
    outOfWarrantyDocuments?: QualificationHistoryDocument[];
    maintenanceContractDocuments?: QualificationHistoryDocument[];
};

export function normalizeDocumentUrl(raw: string | null | undefined): string | undefined {
    const value = String(raw || "").trim();
    if (!value) return undefined;

    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("/api/uploads")) return value;

    const uploadLike = value.startsWith("/uploads/")
        ? value
        : value.startsWith("uploads/")
            ? `/${value}`
            : `/uploads/${value.replace(/^\/+/, "")}`;

    return `/api/uploads?path=${encodeURIComponent(uploadLike)}`;
}

function extractBasenameFromValue(raw: string | null | undefined): string {
    const value = String(raw || "").trim();
    if (!value) return "";

    try {
        const parsed = new URL(value, "http://localhost");
        const pathPart = parsed.pathname || "";
        const base = pathPart.split("/").pop() || "";
        return decodeURIComponent(base).trim();
    } catch {
        const sanitized = value.split("?")[0].split("#")[0];
        const base = sanitized.split("/").pop() || "";
        return decodeURIComponent(base).trim();
    }
}

function canonicalAttachmentName(raw: string | null | undefined): string {
    let base = extractBasenameFromValue(raw).toLowerCase();
    if (!base) return "";

    // Nettoyage des prefixes generes automatiquement par upload.
    for (let i = 0; i < 3; i += 1) {
        const next = base.replace(/^\d{10,}-[a-z0-9]+-/i, "");
        if (next === base) break;
        base = next;
    }

    // Nettoyage des suffixes "(1)", "(2)" juste avant extension.
    base = base.replace(/\(\d+\)(?=\.[a-z0-9]+$)/i, "");
    return base;
}

function buildAttachmentDedupKey(doc: ClientAttachment): string {
    const normalizedUrl = String(doc.dataUrl || "").trim().toLowerCase();
    const canonicalFromUrl = canonicalAttachmentName(doc.dataUrl);
    const canonicalFromName = canonicalAttachmentName(doc.name);
    const canonical = canonicalFromUrl || canonicalFromName;

    if (normalizedUrl.length > 0) return `url:${normalizedUrl}`;
    if (canonical) return `canonical:${canonical}|${doc.kind || ""}|${doc.type || ""}|${normalizeAttachmentDescriptor(doc.title)}`;
    return `meta:${doc.kind || ""}|${doc.type || ""}|${String(doc.name || "").trim().toLowerCase()}`;
}

function extractFirstUrl(note: string): string | undefined {
    const match = note.match(/(https?:\/\/[^\s]+|\/api\/uploads\?[^\s]+|\/uploads\/[^\s]+)/i);
    if (!match || !match[1]) return undefined;
    const raw = match[1].replace(/[),.;]+$/g, "");
    return normalizeDocumentUrl(raw);
}

function isPdfUrl(url: string | undefined | null): boolean {
    if (!url) return false;
    return /\.pdf($|[?#])/i.test(url);
}

function summarizeNoteText(text: string, maxLength = 180): string {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (!compact) return "";
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength).trim()}...`;
}

function parseHistoryNote(note: string | null | undefined): ParsedHistoryNote {
    if (!note) return { text: "" };
    const raw = String(note).trim();
    if (!raw) return { text: "" };

    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            const payload = parsed as Record<string, unknown>;
            const textCandidate = [
                payload.message,
                payload.detail,
                payload.summary,
                payload.text
            ].find((item) => typeof item === "string" && String(item).trim().length > 0);

            const urlCandidate = [
                payload.pdfUrl,
                payload.reportUrl,
                payload.url,
                payload.attachmentUrl
            ].find((item) => typeof item === "string" && String(item).trim().length > 0);

            const onlyUpdateTimestamp =
                typeof payload.updatedAt === "string"
                && Object.keys(payload).every((key) => key === "updatedAt" || key === "attachments");

            return {
                text: onlyUpdateTimestamp ? "" : typeof textCandidate === "string" ? textCandidate : raw,
                downloadUrl: normalizeDocumentUrl(typeof urlCandidate === "string" ? urlCandidate : extractFirstUrl(raw)),
                reportNumber: typeof payload.reportNumber === "string" ? payload.reportNumber : undefined
            };
        }
    } catch {
        // Keep legacy plain text history notes.
    }

    return {
        text: raw,
        downloadUrl: extractFirstUrl(raw)
    };
}

function resolveHistoryDocumentUrl(document: QualificationHistoryDocument): string | undefined {
    const url = typeof document?.url === "string" ? document.url.trim() : "";
    if (url) return normalizeDocumentUrl(url);

    const id = typeof document?.id === "string" ? document.id.trim() : "";
    return normalizeDocumentUrl(id);
}

function extractAdvQualificationDocuments(entry: any, applyRetention = true): ClientAttachment[] {
    try {
        const payload = JSON.parse(String(entry?.note || "{}")) as QualificationHistoryPayload;
        const docs = [...(payload.documents || []), ...(payload.outOfWarrantyDocuments || []), ...(payload.maintenanceContractDocuments || [])];
        const sentAt = String(entry?.createdAt || "").trim() || undefined;

        return docs
            .filter((doc) => typeof doc?.name === "string" && String(doc.name).trim().length > 0)
            .map((doc) => ({
                name: String(doc.name),
                type: typeof doc.type === "string" ? doc.type : undefined,
                kind: "DOCUMENT" as const,
                dataUrl: resolveHistoryDocumentUrl(doc),
                sentAt
            }))
            .filter((doc) => !applyRetention || !isClientAttachmentExpired(doc, sentAt));
    } catch {
        return [];
    }
}

function normalizeHistoryAttachments(raw: unknown, fallbackSentAt?: string | null, applyRetention = true): ClientAttachment[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => {
            const dataUrl = normalizeDocumentUrl(typeof item.url === "string" ? item.url : typeof item.dataUrl === "string" ? item.dataUrl : "");
            const type = typeof item.type === "string" ? item.type : undefined;
            const kind = item.kind === "MEDIA"
                ? "MEDIA"
                : item.kind === "DOCUMENT"
                    ? "DOCUMENT"
                    : undefined;

            return {
                name: String(item.name || item.title || "Pièce jointe client"),
                title: typeof item.title === "string" ? item.title : undefined,
                type,
                kind,
                dataUrl,
                sentAt: typeof item.sentAt === "string" && item.sentAt.trim().length > 0 ? item.sentAt.trim() : fallbackSentAt || undefined
            } satisfies ClientAttachment;
        })
        .filter((item) => Boolean(item.dataUrl) && (!applyRetention || !isClientAttachmentExpired(item, fallbackSentAt)));
}

function extractClientHistoryDocuments(entry: any, applyRetention = true): ClientAttachment[] {
    try {
        const payload = JSON.parse(String(entry?.note || "{}"));
        if (!payload || typeof payload !== "object") return [];
        const fallbackSentAt = String((payload as any).updatedAt || entry?.createdAt || "").trim() || null;
        return normalizeHistoryAttachments((payload as any).attachments, fallbackSentAt, applyRetention);
    } catch {
        return [];
    }
}

function buildFallbackAttachmentFromUrl(reclamation: any, fallbackSentAt: string | null, applyRetention = true): ClientAttachment[] {
    const normalizedUrl = normalizeDocumentUrl(String(reclamation?.attachmentUrl || ""));
    if (!normalizedUrl || (applyRetention && isClientAttachmentExpired(null, fallbackSentAt))) return [];

    const inferredName = extractBasenameFromValue(reclamation?.attachmentUrl) || "Pièce jointe principale";
    const fallbackAttachment: ClientAttachment = {
        name: inferredName,
        type: undefined,
        kind: /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(inferredName) ? "MEDIA" : "DOCUMENT",
        dataUrl: normalizedUrl,
        sentAt: fallbackSentAt || undefined
    };

    return [fallbackAttachment];
}

function hasNonRepareOutcome(reclamation: any): boolean {
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    return history.some((entry: any) => String(entry?.action || "") === "FINAL_OUTCOME_NON_REPARE");
}

export function hasAdvAdministrativeClosure(reclamation: any): boolean {
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    return history.some((entry: any) =>
        ["INTERVENTION_VALIDATED", "SATISFACTION_REQUESTED"].includes(String(entry?.action || ""))
    );
}

function getQuoteMetadata(reclamation: any) {
    return parseChecklistPayload(reclamation?.checklist).metadata?.quote as Record<string, unknown> | undefined;
}

function hasClientApprovedQuote(reclamation: any): boolean {
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    const quote = getQuoteMetadata(reclamation);
    const quoteStatus = String(quote?.status || "").trim().toUpperCase();
    return history.some((entry: any) => String(entry?.action || "") === "CLIENT_QUOTE_APPROVED")
        || quoteStatus === "APPROVED"
        || (String(quote?.clientDecisionAt || "").trim().length > 0 && quoteStatus !== "REJECTED");
}

function hasQuoteBeenSent(reclamation: any): boolean {
    const quote = getQuoteMetadata(reclamation);
    const quoteStatus = String(quote?.status || "").trim().toUpperCase();
    const documents = Array.isArray(quote?.documents) ? quote.documents : [];
    return String(quote?.sentAt || "").trim().length > 0
        || documents.length > 0
        || quoteStatus === "SENT";
}

export function getClientVisibleStatus(reclamation: any): string {
    const ticketStatus = String(reclamation?.ticket?.status || "");
    const reclamationStatus = String(reclamation?.status || "").toUpperCase();
    if (reclamationStatus === "QUOTE_APPROVED" && !hasClientApprovedQuote(reclamation)) {
        return hasQuoteBeenSent(reclamation)
            ? "Devis envoyé - en attente de votre décision"
            : "Devis en préparation par l'administration des ventes";
    }
    if (reclamationStatus === "TAKEN_IN_CHARGE" && !hasClientApprovedQuote(reclamation)) {
        return "Prise en charge SAV";
    }
    if (ticketStatus === "READY_FOR_DELIVERY") return getTicketStatusLabel(ticketStatus);
    if (reclamation?.status === "NOT_TAKEN_IN_CHARGE") return "Non prise en charge";
    if (reclamation?.status === "PENDING_STORE_REVIEW") return "Attente infos DP";
    if (reclamation?.status === "PENDING_TECHNICAL_MANAGER_REVIEW") return "Analyse responsable technique en cours";
    if (reclamation?.status === "PENDING_ADV_QUOTE") return "Devis en préparation par l'administration des ventes";
    if (reclamation?.status === "QUOTE_SENT_TO_CLIENT") return "Devis envoyé - en attente de votre décision";
    if (reclamation?.status === "QUOTE_APPROVED") return "Devis validé - reprise SAV en cours";
    if (reclamation?.status === "TAKEN_IN_CHARGE") return "Devis validé - ticket repris en charge par le SAV";
    if (reclamation?.status === "QUOTE_REJECTED") return "Devis refusé - dossier clôturé automatiquement";
    if (reclamation?.status === "READY_FOR_TECH_MANAGER_ASSIGNMENT") return "Prise en charge validée - affectation technicien en cours";
    if (reclamation?.status === "QUALIFIED_PENDING_ASSIGNMENT") return "Vérification terminée - affectation technicien en cours";
    if (ticketStatus === "DIAGNOSTIC") return "Diagnostic SAV";
    if (["PENDING_PARTS", "REPAIR", "QUALITY_TEST"].includes(ticketStatus)) return "Réparation en cours";
    if (hasNonRepareOutcome(reclamation)) {
        return hasAdvAdministrativeClosure(reclamation)
            ? "Intervention terminée - non réparée"
            : "Intervention terminée - validation administration des ventes en cours";
    }
    if (reclamation?.status === "PENDING_ADV" || reclamation?.status === "PENDING") return "Demande d'intervention reçue";
    if (ticketStatus === "CLOSED" && !hasAdvAdministrativeClosure(reclamation)) {
        return "Validation administrative par l'administration des ventes en cours";
    }
    return getTicketStatusLabel(ticketStatus || "QUALIFICATION");
}

export function getCurrentStep(reclamation: any): string {
    const ticketStatus = String(reclamation?.ticket?.status || "");
    const reclamationStatus = String(reclamation?.status || "").toUpperCase();
    if (reclamationStatus === "QUOTE_APPROVED" && !hasClientApprovedQuote(reclamation)) {
        return hasQuoteBeenSent(reclamation) ? "Validation devis côté client" : "Devis administration des ventes à préparer";
    }
    if (reclamationStatus === "TAKEN_IN_CHARGE" && !hasClientApprovedQuote(reclamation)) {
        return "Prise en charge SAV";
    }
    if (ticketStatus === "READY_FOR_DELIVERY") return "Matériel réparé à livrer";
    if (reclamation?.status === "NOT_TAKEN_IN_CHARGE") return "Décision administration des ventes finalisée";
    if (reclamation?.status === "PENDING_STORE_REVIEW") return "Attente infos DP";
    if (reclamation?.status === "PENDING_TECHNICAL_MANAGER_REVIEW") return "Analyse responsable technique";
    if (reclamation?.status === "PENDING_ADV_QUOTE") return "Devis administration des ventes à préparer";
    if (reclamation?.status === "QUOTE_SENT_TO_CLIENT") return "Validation devis côté client";
    if (reclamation?.status === "QUOTE_APPROVED") return "Reprise SAV après accord devis";
    if (reclamation?.status === "TAKEN_IN_CHARGE") return "Réparation relancée après accord devis";
    if (reclamation?.status === "QUOTE_REJECTED") return "Dossier clôturé après refus du devis";
    if (reclamation?.status === "READY_FOR_TECH_MANAGER_ASSIGNMENT") return "Affectation technicien par responsable technique";
    if (reclamation?.status === "QUALIFIED_PENDING_ASSIGNMENT") return "Vérification terminée - affectation technicien en cours";
    if (ticketStatus === "DIAGNOSTIC") return "Diagnostic SAV";
    if (["PENDING_PARTS", "REPAIR", "QUALITY_TEST"].includes(ticketStatus)) return "Réparation en cours";
    if (hasNonRepareOutcome(reclamation)) {
        return hasAdvAdministrativeClosure(reclamation)
            ? "Intervention terminée - non réparée"
            : "Validation administrative par l'administration des ventes";
    }
    if (reclamation?.status === "PENDING_ADV" || reclamation?.status === "PENDING") return "Analyse administration des ventes";

    const status = reclamation?.ticket?.status;
    if (!status) return "Analyse administration des ventes";
    if (status === "CLOSED" && !hasAdvAdministrativeClosure(reclamation)) return "Validation administrative par l'administration des ventes";

    const steps: Record<string, string> = {
        OPEN: "Analyse initiale",
        QUALIFICATION: "Validation",
        DIAGNOSTIC: "Diagnostic SAV",
        DECISION: "Décision de traitement",
        PENDING_PARTS: "Attente de pièces",
        REPAIR: "Réparation en cours",
        QUALITY_TEST: "Réparation en cours",
        READY_FOR_DELIVERY: "Matériel réparé à livrer",
        CLOSED: "Dossier clôturé"
    };

    return steps[status] || getTicketStatusLabel(status);
}

export function isOpenForClient(reclamation: any): boolean {
    if (reclamation?.status === "NOT_TAKEN_IN_CHARGE") return false;
    if (reclamation?.status === "QUOTE_REJECTED") return false;
    if (hasSatisfaction(reclamation)) return false;
    if (hasAdvAdministrativeClosure(reclamation) && hasHistoryGraceExpired(reclamation, 7)) return false;
    const ticketStatus = reclamation?.ticket?.status;
    if (!ticketStatus) return true;
    if (ticketStatus === "CLOSED" && hasAdvAdministrativeClosure(reclamation) && !hasHistoryGraceExpired(reclamation, 7)) {
        return true;
    }
    return ticketStatus !== "CLOSED";
}

export function isHistoryItem(reclamation: any): boolean {
    if (reclamation?.status === "NOT_TAKEN_IN_CHARGE") return true;
    if (reclamation?.status === "QUOTE_REJECTED") return true;
    if (hasSatisfaction(reclamation)) return true;
    return hasAdvAdministrativeClosure(reclamation) && hasHistoryGraceExpired(reclamation, 7);
}

function readableStatusChange(action: string): string {
    const match = action.match(/->\s*([A-Z_]+)/);
    if (!match) return "Mise à jour du ticket";
    return `Statut: ${getTicketStatusLabel(match[1])}`;
}

const CLIENT_REPAIR_TYPE_LABELS: Record<string, string> = {
    SUPPLIER_RETURN_WAIT: "Attente retour du fournisseur",
    LOCAL_PART_PURCHASE: "Achat local de pièce détachée",
    DP_PART_RETURN: "Retour pièce du DP",
    MAJ: "Mise à jour logicielle",
    SOFTWARE_UPDATE: "Mise à jour logicielle",
    SOFTWARE_INSTALLATION: "Installation licence / logiciel",
    PART_TO_MANUFACTURE: "Pièce à fabriquer"
};

const CLIENT_PROGRESS_STATUS_LABELS: Record<string, string> = {
    DIAGNOSTIC: "Diagnostic SAV",
    REPAIR: "Réparation en cours",
    PENDING_PARTS: "Attente pièces",
    QUALITY_TEST: "Contrôle qualité",
    READY_FOR_DELIVERY: "Matériel réparé à livrer",
    CLOSED: "Ticket traité par l'administration des ventes",
    NON_REPARE: "Intervention terminée - non réparée"
};

function parseClientHistoryLineMap(note: string | null | undefined) {
    const out: Record<string, string> = {};
    String(note || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const separator = line.indexOf(":");
            if (separator < 0) return;
            const key = line.slice(0, separator).trim();
            const value = line.slice(separator + 1).trim();
            if (!key || !value) return;
            out[key] = value;
        });
    return out;
}

function formatClientRepairType(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    if (!normalized) return "";
    if (normalized === "UNKNOWN" || normalized === "STATUT INCONNU") return "";
    return CLIENT_REPAIR_TYPE_LABELS[normalized] || formatFallbackStatusLabel(value);
}

function formatClientProgressStatus(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    return CLIENT_PROGRESS_STATUS_LABELS[normalized] || formatFallbackStatusLabel(value);
}

function buildClientRepairProgress(note: string | null | undefined, fallbackStatus?: string | null) {
    const text = String(note || "").trim();
    const lineMap = parseClientHistoryLineMap(text);
    const freeLines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.includes(":"));
    const rawStatus = lineMap["Statut avancement"] || fallbackStatus || "";
    const statusLabel = formatClientProgressStatus(rawStatus);
    const repairType = formatClientRepairType(lineMap["Nature de réparation"]);
    const freeText = freeLines.find((line) => !/mise à jour intervention enregistrée/i.test(line)) || "";

    if (/transmis à l'adv pour devis/i.test(text)) {
        return null;
    }

    const comment = String(lineMap["Commentaire"] || lineMap["Commentaire technique"] || "").trim();
    const preferredLabel = statusLabel || (repairType ? "Réparation en cours" : "");
    const detail = [
        comment ? `Commentaire: ${comment}` : ""
    ].filter(Boolean).join(". ");

    if (!preferredLabel && !detail) return null;

    return {
        label: preferredLabel || "Suivi SAV",
        detail
    };
}

function toTimestamp(value: string | null | undefined) {
    const parsed = new Date(String(value || "").trim());
    return Number.isNaN(parsed.getTime()) ? Number.NaN : parsed.getTime();
}

function addMilliseconds(rawDate: string | null | undefined, milliseconds: number) {
    const base = toTimestamp(rawDate);
    if (!Number.isFinite(base)) return new Date().toISOString();
    return new Date(base + milliseconds).toISOString();
}

function isClientDiagnosticEntry(entry: any) {
    const action = String(entry?.action || "");
    if (action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC"
        || /^Status changed\s*:\s*[A-Z_]+\s*->\s*DIAGNOSTIC$/i.test(action)) {
        return true;
    }

    if (action !== "INTERVENTION_LOG" && action !== "Progress update") {
        return false;
    }

    const lineMap = parseClientHistoryLineMap(entry?.note);
    const progressStatus = String(lineMap["Statut avancement"] || "").trim().toUpperCase();
    const repairType = String(lineMap["Nature de réparation"] || "").trim();
    const noteText = String(entry?.note || "").trim();

    if (progressStatus === "DIAGNOSTIC") {
        return true;
    }

    return !repairType && /^diagnostic\b/i.test(noteText);
}

function isClientProgressCommentTarget(entry: any) {
    const action = String(entry?.action || "");
    if (action === "INTERVENTION_LOG" || action === "Progress update" || action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC") {
        return true;
    }

    if (/^Status changed\s*:/i.test(action)) {
        const nextStatus = action.match(/->\s*([A-Z_]+)/)?.[1] || "";
        return ["DIAGNOSTIC", "REPAIR", "PENDING_PARTS", "QUALITY_TEST", "READY_FOR_DELIVERY", "CLOSED", "NON_REPARE"].includes(
            String(nextStatus).toUpperCase()
        );
    }

    return false;
}

function appendClientSavComment(detail: string | null | undefined, comment: string | undefined) {
    const cleanDetail = String(detail || "").trim();
    const cleanComment = String(comment || "").trim();
    if (!cleanComment || cleanDetail.toLowerCase().includes("commentaire:")) return cleanDetail;
    return [cleanDetail, `Commentaire: ${cleanComment}`].filter(Boolean).join(". ");
}

function getFirstMatchingHistoryDate(history: any[], matcher: (entry: any) => boolean) {
    const match = [...history]
        .filter((entry) => matcher(entry))
        .sort((left, right) => toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt))[0];
    return String(match?.createdAt || "").trim();
}

export function buildClientTimeline(reclamation: any): TimelineEvent[] {
    const timeline: TimelineEvent[] = [];
    const baseId = String(reclamation?.id ?? "unknown");
    const createdAt = reclamation?.createdAt || new Date().toISOString();
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    const sortedHistory = [...history].sort((left: any, right: any) => toTimestamp(left?.createdAt) - toTimestamp(right?.createdAt));
    const commentByProgressEntryId = new Map<string, string>();
    const linkedCommentEntryIds = new Set<string>();
    const reportNotificationKeys = new Set<string>();
    const seenAdvDocumentKeys = new Set<string>();
    const reclamationStatus = String(reclamation?.status || "").toUpperCase();
    const ticketStatus = String(reclamation?.ticket?.status || "").toUpperCase();

    const qualificationCompletedByStatus = ["PENDING_STORE_REVIEW", "PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED", "TAKEN_IN_CHARGE", "QUOTE_REJECTED", "CLOSED"].includes(reclamationStatus)
        || ["DIAGNOSTIC", "DECISION", "PENDING_PARTS", "REPAIR", "QUALITY_TEST", "READY_FOR_DELIVERY", "CLOSED"].includes(ticketStatus);
    const qualificationLogged = qualificationCompletedByStatus && history.some((entry: any) => {
        const action = String(entry?.action || "");
        return action === "ADV_QUALIFICATION" || /^Status changed\s*:\s*[A-Z_]+\s*->\s*QUALIFICATION$/i.test(action);
    });
    const diagnosticLogged = history.some((entry: any) => isClientDiagnosticEntry(entry));
    const qualificationReached = qualificationLogged
        || qualificationCompletedByStatus;
    const diagnosticReached = ["DIAGNOSTIC", "DECISION", "PENDING_PARTS", "REPAIR", "QUALITY_TEST", "READY_FOR_DELIVERY", "CLOSED"].includes(ticketStatus)
        || ["PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE", "QUOTE_REJECTED"].includes(reclamationStatus);

    const qualificationAt = getFirstMatchingHistoryDate(history, (entry) => {
        const action = String(entry?.action || "");
        return action === "ADV_QUALIFICATION" || /^Status changed\s*:\s*[A-Z_]+\s*->\s*QUALIFICATION$/i.test(action);
    }) || addMilliseconds(createdAt, 1000);
    const assignmentAt = getFirstMatchingHistoryDate(history, (entry) => String(entry?.action || "").toLowerCase().includes("assignment"));
    const diagnosticAt = getFirstMatchingHistoryDate(history, (entry) => isClientDiagnosticEntry(entry))
        || (assignmentAt ? addMilliseconds(assignmentAt, 1000) : addMilliseconds(qualificationAt, 1000));

    history.forEach((entry: any) => {
        if (String(entry?.action || "") !== "CLIENT_NOTIFICATION") return;
        const parsed = parseHistoryNote(entry?.note);
        const hasPdf = isPdfUrl(parsed.downloadUrl);
        if (!hasPdf && !parsed.reportNumber) return;
        const key = String(parsed.reportNumber || parsed.downloadUrl || "").trim();
        if (key) reportNotificationKeys.add(key);
    });

    sortedHistory.forEach((entry: any, index: number) => {
        if (String(entry?.action || "") !== "COMMENT_CLIENT") return;
        const comment = summarizeNoteText(String(entry?.note || ""), 120);
        if (!comment) return;
        const commentAt = toTimestamp(entry?.createdAt);
        if (!Number.isFinite(commentAt)) return;

        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
            const candidate = sortedHistory[cursor];
            if (!isClientProgressCommentTarget(candidate)) continue;
            const candidateAt = toTimestamp(candidate?.createdAt);
            if (!Number.isFinite(candidateAt)) continue;
            if (commentAt - candidateAt > 30 * 60 * 1000) break;
            const candidateKey = String(candidate?.id || "");
            if (!candidateKey || commentByProgressEntryId.has(candidateKey)) break;
            commentByProgressEntryId.set(candidateKey, comment);
            linkedCommentEntryIds.add(String(entry?.id || ""));
            break;
        }

        if (linkedCommentEntryIds.has(String(entry?.id || ""))) return;

        for (let cursor = index + 1; cursor < sortedHistory.length; cursor += 1) {
            const candidate = sortedHistory[cursor];
            if (!isClientProgressCommentTarget(candidate)) continue;
            const candidateAt = toTimestamp(candidate?.createdAt);
            if (!Number.isFinite(candidateAt)) continue;
            if (candidateAt - commentAt > 30 * 60 * 1000) break;
            const candidateKey = String(candidate?.id || "");
            if (!candidateKey || commentByProgressEntryId.has(candidateKey)) break;
            commentByProgressEntryId.set(candidateKey, comment);
            linkedCommentEntryIds.add(String(entry?.id || ""));
            break;
        }
    });

    timeline.push({
        id: `${baseId}-created`,
        label: "Ticket créé",
        detail: "",
        actor: "CLIENT",
        at: createdAt
    });

    if (qualificationReached && !qualificationLogged) {
        timeline.push({
            id: `${baseId}-qualification-synthetic`,
            label: "Ticket validé",
            detail: "",
            actor: "ADV",
            at: qualificationAt
        });
    }

    if (diagnosticReached && !diagnosticLogged) {
        timeline.push({
            id: `${baseId}-diagnostic-synthetic`,
            label: "Diagnostic SAV",
            detail: "",
            actor: "SAV",
            at: diagnosticAt
        });
    }

    if (reclamation?.status === "NOT_TAKEN_IN_CHARGE") {
        const alreadyLogged = history.some((entry: any) =>
            ["ADV_DECISION_REFUS", "CLIENT_NOTIFICATION"].includes(String(entry?.action || ""))
        );
        if (!alreadyLogged) {
            timeline.push({
                id: `${baseId}-not-taken`,
                label: "Non prise en charge",
                detail: reclamation?.techComment || reclamation?.ticket?.rejectionMotive || "Décision administration des ventes: non prise en charge",
                at: reclamation?.updatedAt || createdAt
            });
        }
    } else if (reclamation?.status === "TAKEN_IN_CHARGE") {
        const alreadyLogged = history.some((entry: any) =>
            ["ADV_DECISION_TAKEN", "CLIENT_NOTIFICATION"].includes(String(entry?.action || ""))
        );
        if (!alreadyLogged) {
            timeline.push({
                id: `${baseId}-taken`,
                label: "Prise en charge SAV",
                at: reclamation?.updatedAt || createdAt
            });
        }
    }

    history.forEach((entry: any) => {
        const action = String(entry?.action || "");
        const actionLower = action.toLowerCase();

    // Masque les Ã©vÃ©nements magasinier dans l'historique client.
        if (action.startsWith("MAGASINIER_") || action.includes("STORE_REVIEW")) {
            return;
        }

        if (action === "COMMENT_CLIENT") {
            if (linkedCommentEntryIds.has(String(entry?.id || ""))) return;
            timeline.push({
                id: `${baseId}-comment-${entry.id}`,
                label: "Commentaire SAV",
                detail: summarizeNoteText(String(entry?.note || ""), 120),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "CLIENT_UPDATE") {
            return;
        }

        if (action === "CLIENT_ADDITIONAL_DOCUMENTS") {
            return;
        }

        if (action === "CLIENT_REMINDER") {
            const parsed = parseHistoryNote(entry?.note);
            timeline.push({
                id: `${baseId}-client-reminder-${entry.id}`,
                label: "Relance envoyée",
                detail: summarizeNoteText(parsed.text, 100),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "CLIENT_NOTIFICATION") {
            const parsed = parseHistoryNote(entry?.note);
            const lowerText = String(parsed.text || "").toLowerCase();
            const hasPdf = isPdfUrl(parsed.downloadUrl);
            const isRefusalDecision = lowerText.includes("non prise en charge");
            const isTakenDecision = lowerText.includes("prise en charge") && !isRefusalDecision;
            const isQuotePending = lowerText.includes("devis") && (lowerText.includes("suivi client") || lowerText.includes("disponible"));

            // Evite les doublons "prise/non prise en charge" deja portes par l'etape ADV.
            if (!hasPdf && (isRefusalDecision || isTakenDecision)) {
                return;
            }

            const label = hasPdf ? "Rapport final disponible" : isQuotePending ? "Devis en attente de validation" : "Mise à jour SAV";
            let detail = "";
            if (hasPdf) {
                detail = "PDF telechargeable.";
            } else if (isQuotePending) {
                detail = "";
            } else if (lowerText.includes("non prise en charge")) {
                detail = "Demande d'intervention non prise en charge.";
            } else if (lowerText.includes("prise en charge")) {
                detail = "Demande d'intervention prise en charge.";
            } else if (parsed.text) {
                detail = summarizeNoteText(parsed.text, 100);
            }
            timeline.push({
                id: `${baseId}-client-notification-${entry.id}`,
                label,
                detail,
                downloadUrl: parsed.downloadUrl,
                downloadLabel: hasPdf ? "Télécharger le rapport PDF" : parsed.downloadUrl ? "Télécharger le document" : undefined,
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "CLIENT_SUMMARY_SENT") {
            // RÃ©sumÃ© client masquÃ© du suivi simplifiÃ©.
            return;
        }

        if (action === "ADV_QUALIFICATION") {
            if (!qualificationReached) return;
            timeline.push({
                id: `${baseId}-adv-qualification-${entry.id}`,
                label: "Ticket validé",
                detail: "",
                actor: "ADV",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "ADV_DECISION_TAKEN") {
            timeline.push({
                id: `${baseId}-adv-taken-${entry.id}`,
                label: "Prise en charge SAV",
                detail: "",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "ADV_DECISION_REFUS") {
            timeline.push({
                id: `${baseId}-adv-refusal-${entry.id}`,
                label: "Décision administration des ventes: non prise en charge",
                detail: entry?.note || "",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "ADV_QUALIFICATION_DOCUMENTS") {
            const docs = extractAdvQualificationDocuments(entry);
            docs.forEach((doc, index) => {
                const docKey = buildAttachmentDedupKey(doc);
                if (seenAdvDocumentKeys.has(docKey)) return;
                seenAdvDocumentKeys.add(docKey);
                timeline.push({
                    id: `${baseId}-adv-doc-${entry.id}-${index}`,
                    label: "Document administration des ventes",
                detail: `Document administration des ventes: ${doc.name}`,
                downloadUrl: doc.dataUrl,
                downloadLabel: doc.dataUrl ? "Ouvrir le document" : undefined,
                at: entry?.createdAt || createdAt
                });
            });
            return;
        }

        if (action === "TECH_MANAGER_OUT_OF_WARRANTY_DIAGNOSTIC") {
            const linkedComment = commentByProgressEntryId.get(String(entry?.id || ""));
            timeline.push({
                id: `${baseId}-tech-manager-diagnostic-${entry.id}`,
                label: "Diagnostic SAV",
                detail: appendClientSavComment("", linkedComment),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "CLIENT_QUOTE_APPROVED") {
            timeline.push({
                id: `${baseId}-quote-approved-${entry.id}`,
                label: "Devis validé",
                detail: "Vous avez validé le devis.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "CLIENT_QUOTE_REJECTED") {
            timeline.push({
                id: `${baseId}-quote-rejected-${entry.id}`,
                label: "Devis refusé",
                detail: "Vous avez refusé le devis.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "QUOTE_REJECTION_AUTO_CLOSED") {
            timeline.push({
                id: `${baseId}-quote-auto-closed-${entry.id}`,
                label: "Clôture automatique",
                detail: "Le ticket a été clôturé automatiquement après votre refus du devis.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "INTERVENTION_LOG") {
            const progress = buildClientRepairProgress(entry?.note, reclamation?.ticket?.status);
            if (!progress) return;
            const linkedComment = commentByProgressEntryId.get(String(entry?.id || ""));
            timeline.push({
                id: `${baseId}-intervention-${entry.id}`,
                label: progress.label,
                detail: appendClientSavComment(progress.detail, linkedComment),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "Progress update") {
            const progress = buildClientRepairProgress(entry?.note, reclamation?.ticket?.status);
            if (!progress) return;
            const linkedComment = commentByProgressEntryId.get(String(entry?.id || ""));
            timeline.push({
                id: `${baseId}-progress-${entry.id}`,
                label: progress.label,
                detail: appendClientSavComment(progress.detail, linkedComment),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "PART_REQUEST") return;

        if (action === "FINAL_OUTCOME_NON_REPARE") {
            timeline.push({
                id: `${baseId}-non-repare-${entry.id}`,
                label: "Résultat final: non réparé",
                detail: "Intervention terminée : équipement non réparé.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "TECHNICAL_REPORT") {
            const parsed = parseHistoryNote(entry?.note);
            const reportKey = String(parsed.reportNumber || parsed.downloadUrl || "").trim();
            if (reportKey && reportNotificationKeys.has(reportKey)) {
                // Evite le doublon "Rapport technique" + "Rapport final disponible".
                return;
            }
            timeline.push({
                id: `${baseId}-report-${entry.id}`,
                label: "Rapport technique final",
                detail: parsed.reportNumber ? `Rapport ${parsed.reportNumber} disponible.` : "Rapport final disponible.",
                downloadUrl: parsed.downloadUrl,
                downloadLabel: parsed.downloadUrl ? "Télécharger le rapport PDF" : undefined,
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "SATISFACTION_REQUESTED") {
            timeline.push({
                id: `${baseId}-satisfaction-requested-${entry.id}`,
                label: "Enquête de satisfaction",
                detail: "Pour nous aider à améliorer, merci de noter votre niveau de satisfaction du SAV Top Medical.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (action === "SATISFACTION_CLIENT") {
            timeline.push({
                id: `${baseId}-satisfaction-${entry.id}`,
                label: "Satisfaction envoyée",
                detail: "Votre satisfaction a été enregistrée.",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (actionLower.includes("prise en charge")) {
            timeline.push({
                id: `${baseId}-adv-${entry.id}`,
                label: actionLower.includes("non prise en charge") ? "Non prise en charge" : "Prise en charge SAV",
                detail: "",
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (actionLower.startsWith("status changed")) {
            const nextStatus = action.match(/->\s*([A-Z_]+)/)?.[1] || reclamation?.ticket?.status;
            const linkedComment = commentByProgressEntryId.get(String(entry?.id || ""));
            if (String(nextStatus || "").toUpperCase() === "QUALIFICATION") {
                if (!qualificationReached) return;
                timeline.push({
                    id: `${baseId}-status-${entry.id}`,
                    label: "Ticket validé",
                    detail: "",
                    actor: "ADV",
                    at: entry?.createdAt || createdAt
                });
                return;
            }
            if (String(nextStatus || "").toUpperCase() === "DIAGNOSTIC") {
                timeline.push({
                    id: `${baseId}-status-${entry.id}`,
                    label: "Diagnostic SAV",
                    detail: appendClientSavComment("", linkedComment),
                    at: entry?.createdAt || createdAt
                });
                return;
            }
            const progress = buildClientRepairProgress(entry?.note, nextStatus);
            timeline.push({
                id: `${baseId}-status-${entry.id}`,
                label: progress?.label || readableStatusChange(action),
                detail: appendClientSavComment(progress?.detail || "", linkedComment),
                at: entry?.createdAt || createdAt
            });
            return;
        }

        if (actionLower.includes("assignment")) {
            timeline.push({
                id: `${baseId}-assign-${entry.id}`,
                label: "Affectation technicien",
                detail: "",
                at: entry?.createdAt || createdAt
            });
        }
    });

    const sorted = timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    // Dedoublonnage strict: une meme etape au meme moment ne doit apparaitre qu'une fois.
    // Le detail fait partie de la cle pour conserver toutes les natures de reparation.
    const byMinute = new Map<string, TimelineEvent>();
    sorted.forEach((event) => {
        const minuteKey = `${new Date(event.at).toISOString().slice(0, 16)}|${event.label}|${event.detail || ""}|${event.downloadUrl || ""}`;
        if (!byMinute.has(minuteKey)) {
            byMinute.set(minuteKey, event);
            return;
        }

        const existing = byMinute.get(minuteKey)!;
        if ((!existing.detail || existing.detail.length === 0) && event.detail) {
            byMinute.set(minuteKey, event);
        }
    });

    // Elimine les repetitions consecutives d'une meme etape dans une fenetre courte.
    const compact: TimelineEvent[] = [];
    Array.from(byMinute.values())
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
        .forEach((event) => {
            const previous = compact[compact.length - 1];
            if (!previous) {
                compact.push(event);
                return;
            }

            const sameLabel = previous.label === event.label;
            const sameDownload = (previous.downloadUrl || "") === (event.downloadUrl || "");
            const sameDetail = (previous.detail || "") === (event.detail || "");
            const closeTime = Math.abs(new Date(event.at).getTime() - new Date(previous.at).getTime()) <= 2 * 60 * 1000;

            if (sameLabel && sameDownload && sameDetail && closeTime) {
                compact[compact.length - 1] = {
                    ...event,
                    detail: event.detail || previous.detail,
                    downloadLabel: event.downloadLabel || previous.downloadLabel
                };
                return;
            }

            compact.push(event);
        });

    // Vue client simplifiÃ©e: garder uniquement la derniÃ¨re occurrence
    // des Ã©tapes de dÃ©cision ADV pour Ã©viter les redoublements visuels.
    const hasVisibleDiagnostic = compact.some((event) => String(event.label || "").toLowerCase().includes("diagnostic"));
    const firstAssignment = compact.find((event) => String(event.label || "").toLowerCase().includes("affectation"));
    if (!hasVisibleDiagnostic && firstAssignment && diagnosticReached) {
        compact.push({
            id: `${baseId}-diagnostic-after-assignment`,
            label: "Diagnostic",
            detail: "",
            actor: "SAV",
            at: addMilliseconds(firstAssignment.at, 1000)
        });
        compact.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    }

    const compactWithoutEmptyProgressDuplicates = compact.filter((event, index, allEvents) => {
        const label = String(event.label || "").trim().toLowerCase();
        const isSavProgress = label.includes("diagnostic")
            || label.includes("réparation")
            || label.includes("reparation")
            || label.includes("attente")
            || label.includes("qualit")
            || label.includes("livraison")
            || label.includes("trait");
        if (!isSavProgress || String(event.detail || "").trim()) return true;
        return !allEvents.some((candidate, candidateIndex) => {
            if (candidateIndex === index) return false;
            if (String(candidate.label || "").trim().toLowerCase() !== label) return false;
            if (!String(candidate.detail || "").trim()) return false;
            return Math.abs(new Date(candidate.at).getTime() - new Date(event.at).getTime()) <= 30 * 60 * 1000;
        });
    });

    const keepLatestByLabel = new Set<string>(["Prise en charge SAV", "Décision administration des ventes: non prise en charge"]);
    const lastIndexByLabel = new Map<string, number>();

    compactWithoutEmptyProgressDuplicates.forEach((event, index) => {
        if (keepLatestByLabel.has(event.label)) {
            lastIndexByLabel.set(event.label, index);
        }
    });

    return compactWithoutEmptyProgressDuplicates.filter((event, index) => {
        if (String(event.label || "").trim().toLowerCase() === "prise en charge sav") return false;
        if (!keepLatestByLabel.has(event.label)) return true;
        return lastIndexByLabel.get(event.label) === index;
    });
}

export function getLatestClientVisibleComment(reclamation: any): string {
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    const visibleActions = ["COMMENT_CLIENT", "CLIENT_UPDATE", "CLIENT_NOTIFICATION"];
    const latestVisible = history.find(
        (entry: any) => visibleActions.includes(String(entry?.action || "")) && typeof entry?.note === "string" && entry.note.trim().length > 0
    );
    if (latestVisible?.note) {
        const parsed = parseHistoryNote(latestVisible.note);
        const text = String(parsed.text || "").toLowerCase();
        if (isPdfUrl(parsed.downloadUrl)) return "Rapport PDF disponible.";
        if (text.includes("prise en charge")) return "Votre demande d'intervention est prise en charge.";
        if (text.includes("non prise en charge")) return "Votre demande d'intervention n'a pas été prise en charge.";
        if (!text.trim()) return "Aucun commentaire visible pour le moment.";
        if (parsed.text) return summarizeNoteText(parsed.text, 120);
    }
    if (typeof reclamation?.techComment === "string" && reclamation.techComment.trim().length > 0) {
        return reclamation.techComment.trim();
    }
    return "Aucun commentaire visible pour le moment.";
}

type ExtractClientDocumentsOptions = {
    viewerRole?: string | null;
    onlyMedia?: boolean;
};

function normalizeAttachmentDescriptor(value: unknown): string {
    return String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function isAdministrativeClientDocument(item: ClientAttachment): boolean {
    const title = normalizeAttachmentDescriptor(item?.title);
    const name = normalizeAttachmentDescriptor(item?.name);
    const haystack = `${title} ${name}`;

    return haystack.includes("facture")
        || haystack.includes("contrat")
        || haystack.includes("garantie")
        || haystack.includes("bl livraison")
        || haystack.includes("bon de livraison")
        || haystack.includes("devis")
        || haystack.includes("rapport");
}

export function isFailureMediaAttachment(item: ClientAttachment): boolean {
    const name = String(item?.name || item?.title || "").toLowerCase();
    const title = String(item?.title || "").toLowerCase();
    const type = String(item?.type || "").toLowerCase();
    const dataUrl = String(item?.dataUrl || "").toLowerCase();
    const kind = String(item?.kind || "").toUpperCase();

    if (kind === "MEDIA") {
        return true;
    }

    if (title.includes("photo") || title.includes("video") || title.includes("vidéo") || title.includes("panne")) {
        return true;
    }

    if (isAdministrativeClientDocument(item)) {
        return false;
    }

    return type.startsWith("image/")
        || type.startsWith("video/")
        || /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(name)
        || /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(dataUrl);
}

function canViewAdvQualificationDocuments(viewerRole: string | null | undefined): boolean {
    const normalized = String(viewerRole || "").trim().toUpperCase();
    return normalized === "ADMIN" || normalized === "ADV";
}

export function extractClientDocuments(reclamation: any, options?: ExtractClientDocumentsOptions): ClientAttachment[] {
    const checklistData = parseChecklistPayload(reclamation?.checklist);
    const fallbackSentAt = String(reclamation?.updatedAt || reclamation?.createdAt || "").trim() || null;
    const applyRetention = shouldApplyRepairedTicketDocumentRetention(reclamation);
    const rawChecklistAttachments = Array.isArray(checklistData.metadata?.attachments) ? checklistData.metadata.attachments : [];
    const fromChecklist = applyRetention
        ? pruneExpiredClientAttachments(rawChecklistAttachments, fallbackSentAt)
        : rawChecklistAttachments;
    const fromAttachmentUrl = buildFallbackAttachmentFromUrl(reclamation, fallbackSentAt, applyRetention);
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    const allowAdvDocs = canViewAdvQualificationDocuments(options?.viewerRole);
    const fromClientHistoryDocs: ClientAttachment[] = history
        .filter((entry: any) => ["CLIENT_UPDATE", "CLIENT_ADDITIONAL_DOCUMENTS"].includes(String(entry?.action || "")))
        .flatMap((entry: any) => extractClientHistoryDocuments(entry, applyRetention));
    const fromAdvQualificationDocs: ClientAttachment[] = allowAdvDocs
        ? history
              .filter((entry: any) => String(entry?.action || "") === "ADV_QUALIFICATION_DOCUMENTS")
              .flatMap((entry: any) => extractAdvQualificationDocuments(entry, applyRetention))
        : [];
    const fromReportPdf: ClientAttachment[] = history
        .filter((entry: any) => String(entry?.action || "") === "TECHNICAL_REPORT")
        .flatMap((entry: any) => {
            const parsed = parseHistoryNote(entry?.note);
            if (!isPdfUrl(parsed.downloadUrl)) return [];
            return [
                {
                    name: parsed.reportNumber ? `${parsed.reportNumber}.pdf` : "Rapport technique final.pdf",
                    type: "application/pdf",
                    kind: "DOCUMENT" as const,
                    dataUrl: normalizeDocumentUrl(parsed.downloadUrl)
                }
            ];
        });

    const combined: ClientAttachment[] = [
        // PrioritÃ© aux documents de checklist (nom rÃ©el saisi/upload par le client).
        ...fromChecklist,
        ...fromClientHistoryDocs,
    // attachmentUrl reste un fallback si aucune mÃ©tadonnÃ©e de piÃ¨ce jointe n'est prÃ©sente.
        ...fromAttachmentUrl,
        ...fromAdvQualificationDocs,
        ...fromReportPdf
    ].map((doc) => ({
        ...doc,
        dataUrl: normalizeDocumentUrl(doc.dataUrl)
    }));
    const dedup = new Map<string, ClientAttachment>();
    combined.forEach((doc) => {
        const key = buildAttachmentDedupKey(doc);
        if (!dedup.has(key)) {
            dedup.set(key, doc);
        }
    });
    const documents = Array.from(dedup.values());
    return options?.onlyMedia ? documents.filter((item) => isFailureMediaAttachment(item)) : documents;
}

export function hasSatisfaction(reclamation: any): boolean {
    if (typeof reclamation?.ticket?.satisfactionRate === "number" && reclamation.ticket.satisfactionRate > 0) {
        return true;
    }
    const history = Array.isArray(reclamation?.ticket?.savHistory) ? reclamation.ticket.savHistory : [];
    return history.some((entry: any) => entry?.action === "SATISFACTION_CLIENT");
}

/* RÃ©sumÃ© simple :
   Ce fichier pilote ce que le client voit et comprend dans son dossier SAV.
   Il rassemble les documents, les Ã©tapes, les rÃ©ponses SOS,
   l'Ã©tat du ticket et les informations mÃ©tier affichÃ©es dans l'interface. */




