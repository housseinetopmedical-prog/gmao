"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import InterventionEntriesWorkspace from "@/composants/espace-tickets/SaisieInterventionsPieces";
import AiTicketInsights from "@/composants/commun/ResumeIATicket";
import { extractClientDocuments, isFailureMediaAttachment, parseChecklistPayload } from "@/metier/workflow-client";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";
import { TECH_STATUS_OPTIONS, formatDate, getInterventionLabel, getStatusLabel, normalizeTechProgressStatus } from "@/metier/workflow-technicien";
import { replaceReclamationByIntervention } from "@/metier/texte-intervention";
import { formatImportReference } from "@/metier/workflow-import";

type TicketDetail = {
    id: number;
    status?: string | null;
    displayId?: string | null;
    ticketReference?: string | null;
    assignedTo?: { id: number; name: string } | null;
    equipment?: {
        name?: string | null;
        serialNumber?: string | null;
        brand?: string | null;
        model?: string | null;
        client?: string | null;
        location?: string | null;
        agence?: string | null;
    } | null;
    reclamation?: {
        id?: number;
        customerName?: string | null;
        contactEmail?: string | null;
        phone?: string | null;
        deviceModel?: string | null;
        serialNumber?: string | null;
        description?: string | null;
        interventionType?: string | null;
        checklist?: string | null;
        createdAt?: string | null;
        updatedAt?: string | null;
        attachmentUrl?: string | null;
    } | null;
    savHistory?: Array<{
        id: number;
        action: string;
        note?: string | null;
        createdAt: string;
        user?: { id: number; name: string; role: string } | null;
    }>;
};

type ImportOrderSummary = {
    id: number;
    ref?: string | null;
    status?: string | null;
    supplier?: string | null;
    supplierContact?: string | null;
    trackingNumber?: string | null;
    expectedDate?: string | null;
    receivedDate?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
    ticket?: { id?: number | null } | null;
    items?: Array<{ name?: string | null; ref?: string | null; qty?: number | null }>;
};

const STATUS_UPDATE_OPTIONS = [...TECH_STATUS_OPTIONS, "NON_REPARE"] as const;

const ESTABLISHMENT_TYPE_LABELS: Record<string, string> = {
    CLINIQUE: "Clinique",
    HOPITAL: "Hôpital",
    SOCIETE: "Société",
    CABINET_MEDICAL: "Cabinet médical"
};

const SPECIALTY_SECTOR_LABELS: Record<string, string> = {
    PRIVE: "Privé",
    PUBLIC: "Public"
};

const CARD_STYLE = {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
    padding: "1rem"
} as const;

const INNER_CARD_STYLE = {
    border: "1px solid #dbe3ea",
    borderRadius: "12px",
    padding: "0.75rem",
    background: "#ffffff"
} as const;

const IMPORT_STATUS_LABELS: Record<string, string> = {
    DEMAND: "Demande transmise à l'import",
    QUOTATION: "Devis import en cours",
    ORDERED: "Commande lancée",
    SHIPPED: "Expédiée",
    RECEIVED: "Marchandise reçue",
    CHECKED: "Contrôlée",
    CONSUMED: "Consommée"
};

function getLocalUserId() {
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        return Number(user?.id || 0) || null;
    } catch {
        return null;
    }
}

function hasDisplayValue(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text) return false;
    const lowered = text.toLowerCase();
    return lowered !== "-" && lowered !== "non renseigné" && lowered !== "non renseigne" && lowered !== "unknown";
}

function valueOrDash(value: unknown) {
    const text = String(value ?? "").trim();
    if (text.toLowerCase() === "unknown") return "-";
    return text || "-";
}

function DetailField({ label, value, multiline = false }: { label: string; value: unknown; multiline?: boolean }) {
    if (!hasDisplayValue(value)) return null;
    return (
        <div style={{ display: "grid", gap: "0.18rem", paddingBottom: "0.5rem", borderBottom: "1px solid #e2e8f0" }}>
            <span className={styles.label}>{label}</span>
            <span style={{ color: "#0f172a", whiteSpace: multiline ? "pre-wrap" : "normal", lineHeight: 1.5 }}>{String(value).trim()}</span>
        </div>
    );
}

function formatDateTime(value: unknown) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function getImportStatusLabel(status: unknown) {
    const normalized = String(status || "").trim().toUpperCase();
    return IMPORT_STATUS_LABELS[normalized] || valueOrDash(status);
}

function buildImportItemsLabel(items: ImportOrderSummary["items"]) {
    if (!Array.isArray(items) || items.length === 0) return "Pièce non renseignée";
    return items
        .map((item) => String(item?.name || "Pièce").trim())
        .join(", ");
}

function getImportRefsFromTicket(ticket: TicketDetail | null) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
    const entries = Array.isArray(technicalDiagnosis.repairEntries) ? technicalDiagnosis.repairEntries : [];
    return new Set(
        entries
            .map((entry: any) => String(entry?.importRequestRef || "").trim())
            .filter(Boolean)
    );
}

function resolvePerEquipmentValue(rawValue: unknown, equipmentItem: ReturnType<typeof getTicketEquipmentItems>[number]) {
    const text = String(rawValue || "").trim();
    if (!text) return "";

    const segments = text.split("|").map((part) => part.trim()).filter(Boolean);
    const itemKeys = [
        equipmentItem.designation,
        formatEquipmentLabel(equipmentItem),
        equipmentItem.serialNumber,
        equipmentItem.pn,
        `materiel${equipmentItem.index + 1}`,
        `materiel${equipmentItem.index}`
    ].map((value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean);

    for (const segment of segments) {
        const separatorIndex = segment.indexOf(":");
        if (separatorIndex <= 0) continue;
        const label = segment.slice(0, separatorIndex).toLowerCase().replace(/[^a-z0-9]+/g, "");
        const value = segment.slice(separatorIndex + 1).trim();
        if (value && itemKeys.includes(label)) return value;
    }

    return segments.length === 1 ? text : "";
}

function buildDepotPrincipalItems(equipmentItems: ReturnType<typeof getTicketEquipmentItems>, merchandiseInfo: any) {
    const existingItems = Array.isArray(merchandiseInfo?.equipmentMerchandiseItems) ? merchandiseInfo.equipmentMerchandiseItems : [];
    if (existingItems.length > 0) {
        return existingItems.map((entry: any, index: number) => {
            const materialIndex = Number(entry?.materialIndex ?? entry?.index ?? index);
            const fallbackEquipment = equipmentItems.find((equipmentItem) => equipmentItem.index === materialIndex);
            return {
                index: materialIndex,
                designation: String(entry?.label || fallbackEquipment?.designation || `Matériel ${materialIndex + 1}`).trim(),
                serialNumber: String(fallbackEquipment?.serialNumber || "").trim(),
                pn: String(fallbackEquipment?.pn || "").trim(),
                quantity: Number(entry?.quantity) > 0 ? Number(entry.quantity) : Number(fallbackEquipment?.quantity) > 0 ? Number(fallbackEquipment?.quantity) : 1,
                articleCode: String(entry?.articleCode || "").trim(),
                warrantyLabel: String(entry?.warrantyLabel || "").trim(),
                invoiceDate: String(entry?.invoiceDate || "").trim(),
                shippingDate: String(entry?.shippingDate || "").trim(),
                topMedicalWarrantyLimitDate: String(entry?.topMedicalWarrantyLimitDate || entry?.advWarrantyLimitDate || merchandiseInfo?.topMedicalWarrantyLimitDate || merchandiseInfo?.advWarrantyLimitDate || "").trim(),
                warrantyLimitDate: String(entry?.warrantyLimitDate || merchandiseInfo?.warrantyLimitDate || "").trim()
            };
        });
    }

    return equipmentItems.map((equipmentItem) => ({
        ...equipmentItem,
        articleCode: resolvePerEquipmentValue(merchandiseInfo?.articleCode, equipmentItem),
        warrantyLabel: resolvePerEquipmentValue(merchandiseInfo?.warrantyLabel, equipmentItem) || String(merchandiseInfo?.warrantyLabel || "").trim(),
        invoiceDate: resolvePerEquipmentValue(merchandiseInfo?.invoiceDate, equipmentItem) || String(merchandiseInfo?.invoiceDate || "").trim(),
        shippingDate: resolvePerEquipmentValue(merchandiseInfo?.shippingDate, equipmentItem) || String(merchandiseInfo?.shippingDate || "").trim(),
        topMedicalWarrantyLimitDate: resolvePerEquipmentValue(merchandiseInfo?.topMedicalWarrantyLimitDate || merchandiseInfo?.advWarrantyLimitDate, equipmentItem) || String(merchandiseInfo?.topMedicalWarrantyLimitDate || merchandiseInfo?.advWarrantyLimitDate || "").trim(),
        warrantyLimitDate: resolvePerEquipmentValue(merchandiseInfo?.warrantyLimitDate, equipmentItem) || String(merchandiseInfo?.warrantyLimitDate || "").trim()
    }));
}

function AttachmentCard({ item, index }: { item: any; index: number }) {
    const name = item.name || `Document ${index + 1}`;
    const isMedia = isFailureMediaAttachment(item);
    const title = item.title ? replaceReclamationByIntervention(item.title) : name;
    const showTitle = !isMedia && title;
    return (
        <div style={INNER_CARD_STYLE}>
            {showTitle ? <div className={styles.itemTitle} style={{ fontSize: "0.98rem" }}>{title}</div> : null}
            <div className={styles.itemMeta}>{name}</div>
            {isMedia ? (
                <div style={{ marginTop: "0.65rem" }}>
                    {String(item.type || "").toLowerCase().startsWith("video/") || /\.(mp4|webm|mov)$/i.test(String(name || item.dataUrl || "")) ? (
                        <video controls preload="metadata" style={{ width: "100%", maxHeight: "280px", borderRadius: "10px", background: "#0f172a" }}>
                            <source src={item.dataUrl || ""} type={item.type || undefined} />
                        </video>
                    ) : (
                        <img src={item.dataUrl || ""} alt={name} style={{ width: "100%", maxHeight: "280px", objectFit: "contain", borderRadius: "10px", background: "#f8fafc" }} />
                    )}
                </div>
            ) : null}
            <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap", marginTop: "0.65rem" }}>
                <a className="btn btn-outline" href={item.dataUrl || "#"} target="_blank" rel="noreferrer">Ouvrir</a>
                <a className="btn btn-outline" href={item.dataUrl || "#"} download={name} target="_blank" rel="noreferrer">Télécharger</a>
            </div>
        </div>
    );
}

export function ImportTrackingSection({ orders }: { orders: ImportOrderSummary[] }) {
    return (
        <section className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Suivi des demandes import</h3>
            {orders.length === 0 ? (
                <div className={styles.empty}>Aucune demande de pièce transmise à l'import pour ce ticket.</div>
            ) : (
                <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                    {orders.map((order) => {
                        const status = String(order.status || "").trim().toUpperCase();
                        return (
                            <article key={`rt-import-tracking-${order.id}`} className={styles.listItem} style={{ borderRadius: "14px" }}>
                                <div className={styles.itemMain} style={{ alignItems: "flex-start", gap: "1rem" }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div className={styles.itemTitle}>{formatImportReference(order.ref) || `Demande import #${order.id}`}</div>
                                        <div className={styles.itemMeta} style={{ marginTop: "0.25rem" }}>
                                            {buildImportItemsLabel(order.items)}
                                        </div>
                                    </div>
                                    <span className={`${styles.statusBadge} ${status === "RECEIVED" || status === "CHECKED" || status === "CONSUMED" ? styles.statusSuccess : status === "ORDERED" || status === "SHIPPED" ? styles.statusWarn : styles.statusInfo}`}>
                                        {getImportStatusLabel(status)}
                                    </span>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.55rem", marginTop: "0.75rem" }}>
                                    <DetailField label="Contact fournisseur" value={order.supplierContact} />
                                    <DetailField label="Numéro de suivi" value={order.trackingNumber} />
                                    <DetailField label="Date prévisionnelle" value={formatDateTime(order.expectedDate)} />
                                    <DetailField label="Date de réception" value={formatDateTime(order.receivedDate)} />
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

type ResponsableTechniqueTicketDetailContentProps = {
    ticketIdOverride?: number | null;
    backHref?: string;
    readOnly?: boolean;
    forceFollowUp?: boolean;
};

export function ResponsableTechniqueTicketDetailContent({
    ticketIdOverride = null,
    backHref = "/responsable-technique/affectation",
    readOnly = false,
    forceFollowUp = false
}: ResponsableTechniqueTicketDetailContentProps = {}) {
    const params = useParams<{ ticketId: string }>();
    const searchParams = useSearchParams();
    const ticketId = ticketIdOverride || Number(params?.ticketId || 0) || null;
    const openFollowUp = !readOnly && (forceFollowUp || searchParams.get("section") === "suivi");

    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [ticket, setTicket] = useState<TicketDetail | null>(null);
    const [importOrders, setImportOrders] = useState<ImportOrderSummary[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [showFollowUp, setShowFollowUp] = useState(openFollowUp);
    const [showReport, setShowReport] = useState(false);
    const [nextStatus, setNextStatus] = useState("DIAGNOSTIC");
    const [clientComment, setClientComment] = useState("");
    const [estimatedDuration, setEstimatedDuration] = useState("");
    const [quoteArticleCode, setQuoteArticleCode] = useState("");
    const [repairAmount, setRepairAmount] = useState("");
    const [needsQuote, setNeedsQuote] = useState(false);
    const [feedback, setFeedback] = useState("");

    const fetchTicket = async () => {
        if (!ticketId) return;
        setLoadingDetail(true);
        try {
            const [response, importResponse] = await Promise.all([
                fetch(`/api/tickets/${ticketId}`, { cache: "no-store" }),
                fetch("/api/import/overview?role=RESPONSABLE_TECHNIQUE", { cache: "no-store" })
            ]);
            const data = await response.json().catch(() => null);
            if (!response.ok) throw new Error(data?.error || "Ticket introuvable.");
            setTicket(data);
            const importData = await importResponse.json().catch(() => ({}));
            const refs = getImportRefsFromTicket(data);
            const allOrders = [
                ...(Array.isArray(importData?.pendingOrders) ? importData.pendingOrders : []),
                ...(Array.isArray(importData?.alertOrders) ? importData.alertOrders : []),
                ...(Array.isArray(importData?.historyOrders) ? importData.historyOrders : [])
            ];
            const seen = new Set<number>();
            setImportOrders(
                allOrders
                    .filter((order: ImportOrderSummary) => {
                        const id = Number(order?.id || 0);
                        if (!id || seen.has(id)) return false;
                        const linkedByTicket = Number(order?.ticket?.id || 0) === Number(ticketId);
                        const linkedByRef = refs.has(String(order?.ref || "").trim());
                        if (!linkedByTicket && !linkedByRef) return false;
                        seen.add(id);
                        return true;
                    })
                    .sort((a: ImportOrderSummary, b: ImportOrderSummary) =>
                        new Date(String(b.updatedAt || b.createdAt || 0)).getTime()
                        - new Date(String(a.updatedAt || a.createdAt || 0)).getTime()
                    )
            );
            setNextStatus(normalizeTechProgressStatus(data?.status));
            const metadata = parseChecklistPayload(data?.reclamation?.checklist).metadata || {};
            const diagnosis = (metadata as any)?.technicalDiagnosis || {};
            setEstimatedDuration(String(diagnosis.advQuoteEstimatedDuration || diagnosis.estimatedDuration || ""));
            setQuoteArticleCode(String(diagnosis.advQuoteArticleCode || ""));
            setRepairAmount(diagnosis.repairAmount === null || diagnosis.repairAmount === undefined || diagnosis.repairAmount === "" ? "" : String(diagnosis.repairAmount));
            setNeedsQuote(Boolean(diagnosis.advQuoteReportedAt));
        } catch (error: any) {
            setFeedback(error?.message || "Impossible de charger le ticket.");
            setTicket(null);
            setImportOrders([]);
        } finally {
            setLoading(false);
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        setCurrentUserId(getLocalUserId());
        void fetchTicket();
    }, [ticketId]);

    useEffect(() => {
        if (openFollowUp) setShowFollowUp(true);
    }, [openFollowUp]);

    const checklistMeta = useMemo(() => parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {}, [ticket?.reclamation?.checklist]);
    const storeReview = (checklistMeta as any).storeReview || {};
    const merchandiseInfo = (checklistMeta as any).merchandiseInfo || {};
    const entryRepairSlip = (checklistMeta as any).entryRepairSlip || {};
    const technicalDiagnosis = (checklistMeta as any).technicalDiagnosis || {};

    const equipmentItems = useMemo(
        () => getTicketEquipmentItems({
            checklist: ticket?.reclamation?.checklist,
            deviceModel: ticket?.reclamation?.deviceModel,
            serialNumber: ticket?.reclamation?.serialNumber || ticket?.equipment?.serialNumber,
            pn: (checklistMeta as any).pn,
            equipmentName: (checklistMeta as any).equipmentName || ticket?.equipment?.name,
            description: ticket?.reclamation?.description
        }),
        [checklistMeta, ticket]
    );

    const depotPrincipalItems = useMemo(() => buildDepotPrincipalItems(equipmentItems, merchandiseInfo), [equipmentItems, merchandiseInfo]);
    const allDocuments = useMemo(
        () => extractClientDocuments(ticket?.reclamation ? { ...ticket.reclamation, ticket } : null, { viewerRole: "RESPONSABLE_TECHNIQUE" }).filter((item) => Boolean(item.dataUrl)),
        [ticket]
    );
    const contractualDocuments = Array.isArray(storeReview.contractualDocuments)
        ? storeReview.contractualDocuments.map((item: any) => ({ ...item, title: item.title || "Contrat de garantie" })).filter((item: any) => item.dataUrl)
        : [];
    const medias = allDocuments.filter((item) => isFailureMediaAttachment(item));
    const documents = [...allDocuments.filter((item) => !isFailureMediaAttachment(item)), ...contractualDocuments];
    const ticketNumber = ticket?.displayId || ticket?.ticketReference || ticket?.id || "-";
    const failureDescription = valueOrDash(entryRepairSlip.failureDescription || ticket?.reclamation?.description);
    const depositAgency = valueOrDash((checklistMeta as any).depositAgency || storeReview.depositAgency || ticket?.equipment?.agence || ticket?.equipment?.location);
    const warrantyLabel = merchandiseInfo.warrantyStatus === "UNDER_WARRANTY"
        ? "Sous garantie"
        : merchandiseInfo.warrantyStatus === "OUT_OF_WARRANTY"
            ? "Hors garantie"
            : valueOrDash(merchandiseInfo.warrantyLabel || storeReview.warrantyLabel);
    const quoteAlreadySent = Boolean(technicalDiagnosis.advQuoteReportedAt);
    const needsRepairAmount = nextStatus === "READY_FOR_DELIVERY" || nextStatus === "NON_REPARE";
    const accessoriesValue = entryRepairSlip.accessories || (checklistMeta as any).accessories || (checklistMeta as any).facturationCreatedTicket?.accessories;
    const reclamationStatus = String((ticket?.reclamation as any)?.status || "").toUpperCase();
    const statusLockedUntilQuoteValidation =
        merchandiseInfo.warrantyStatus === "OUT_OF_WARRANTY"
        && !["QUOTE_APPROVED", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE"].includes(reclamationStatus);

    const applyFollowUp = async () => {
        if (!ticketId || !currentUserId || !ticket || saving) return;
        setSaving(true);
        setFeedback("");
        try {
            const parsedRepairAmount = repairAmount.trim() === "" ? Number.NaN : Number(repairAmount);
            if (needsRepairAmount && (!Number.isFinite(parsedRepairAmount) || parsedRepairAmount < 0)) {
                throw new Error("Le montant de réparation est obligatoire et doit être supérieur ou égal à 0.");
            }

            const requests: Promise<Response>[] = [
                fetch(`/api/tickets/${ticketId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        status: nextStatus === "NON_REPARE" ? "CLOSED" : nextStatus,
                        finalOutcome: nextStatus === "NON_REPARE" ? "NON_REPARE" : undefined,
                        userId: currentUserId
                    })
                })
            ];

            if (clientComment.trim()) {
                requests.push(fetch(`/api/tickets/${ticketId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId: currentUserId,
                        action: "COMMENT_CLIENT",
                        message: clientComment.trim()
                    })
                }));
            }

            if (needsRepairAmount && ticket.reclamation?.id) {
                requests.push(fetch(`/api/reclamations/${ticket.reclamation.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        technicalDiagnosis: {
                            repairAmount: parsedRepairAmount,
                            reportedByUserId: currentUserId
                        }
                    })
                }));
            }

            const responses = await Promise.all(requests);
            for (const response of responses) {
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data?.error || "Impossible de mettre à jour le suivi.");
                }
            }

            setClientComment("");
            await fetchTicket();
            setFeedback("Suivi enregistré.");
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant la mise à jour du suivi.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement du détail ticket...</div>;
    }

    if (!ticket) {
        return (
            <section className={styles.sectionCard}>
                <Link className="btn btn-outline" href={backHref}>Retour</Link>
                <div className={styles.empty} style={{ marginTop: "0.85rem" }}>{feedback || "Ticket introuvable."}</div>
            </section>
        );
    }

    if (openFollowUp) {
        return (
            <section style={{ display: "grid", gap: "0.85rem" }}>
                <section className={styles.sectionCard}>
                    <div className={styles.itemMain}>
                        <div>
                            <h2 className={styles.sectionTitle}>Suivi ticket #{ticketNumber}</h2>
                        </div>
                        <Link className="btn btn-outline" href={backHref}>Retour</Link>
                    </div>

                    <div style={{ marginTop: "0.85rem" }}>
                        <div className={styles.formGrid2}>
                            <div className={styles.field} style={{ marginTop: 0 }}>
                                <label className={styles.label}>Statut</label>
                                <select
                                    className={styles.select}
                                    value={nextStatus}
                                    disabled={statusLockedUntilQuoteValidation}
                                    onChange={(event) => setNextStatus(event.target.value)}
                                >
                                    {STATUS_UPDATE_OPTIONS.map((status) => (
                                        <option key={status} value={status}>{getStatusLabel(status)}</option>
                                    ))}
                                </select>
                                {statusLockedUntilQuoteValidation ? (
                                    <div className={styles.helper} style={{ marginTop: "0.35rem" }}>
                                        Statut verrouillé jusqu'à la validation du devis client.
                                    </div>
                                ) : null}
                            </div>
                            <div className={styles.field} style={{ marginTop: 0 }}>
                                    <label className={styles.label}>Commentaire pour le client</label>
                                <textarea className={styles.textarea} value={clientComment} onChange={(event) => setClientComment(event.target.value)} placeholder="Message visible par le client." />
                            </div>
                        </div>
                        {needsRepairAmount ? (
                            <div className={styles.field} style={{ marginTop: "0.75rem" }}>
                                <label className={styles.label}>Montant de la réparation</label>
                                <input
                                    className={styles.input}
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={repairAmount}
                                    onChange={(event) => setRepairAmount(event.target.value)}
                                    placeholder="0"
                                />
                            </div>
                        ) : null}
                        <div className={styles.actions} style={{ marginTop: "0.75rem" }}>
                            <button className="btn btn-primary" type="button" onClick={applyFollowUp} disabled={saving || loadingDetail}>
                                {saving ? "Mise à jour..." : "Enregistrer le suivi"}
                            </button>
                            <button className="btn btn-outline" type="button" onClick={() => setShowReport((value) => !value)}>
                                Rapport d'intervention
                            </button>
                        </div>
                        {feedback ? <div className={styles.helper} style={{ marginTop: "0.6rem" }}>{feedback}</div> : null}
                    </div>
                </section>

                <ImportTrackingSection orders={importOrders} />

                {showReport ? (
                    <section className={styles.sectionCard}>
                        <h3 className={styles.sectionTitle}>Rapport d'intervention</h3>
                        {quoteAlreadySent ? (
                            <div className={styles.helper} style={{ marginTop: "0.55rem" }}>
                                Rapport déjà transmis à l'ADV pour devis. Estimation enregistrée : {estimatedDuration || "-"}
                            </div>
                        ) : (
                            <label className={styles.field} style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.55rem" }}>
                                <input type="checkbox" checked={needsQuote} onChange={(event) => setNeedsQuote(event.target.checked)} />
                                <span className={styles.label} style={{ margin: 0 }}>Besoin d'un devis ADV</span>
                            </label>
                        )}
                        {needsQuote || quoteAlreadySent ? (
                            <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                                <div className={styles.field} style={{ marginTop: 0 }}>
                                    <label className={styles.label}>Estimation du temps d'intervention</label>
                                    <input
                                        className={styles.input}
                                        value={estimatedDuration}
                                        readOnly={quoteAlreadySent}
                                        onChange={(event) => setEstimatedDuration(event.target.value)}
                                        placeholder="Exemple : 5 jours ouvrés"
                                    />
                                </div>
                                <div className={styles.field} style={{ marginTop: 0 }}>
                                    <label className={styles.label}>Code article</label>
                                    <input
                                        className={styles.input}
                                        value={quoteArticleCode}
                                        readOnly={quoteAlreadySent}
                                        onChange={(event) => setQuoteArticleCode(event.target.value)}
                                        placeholder="Code article optionnel"
                                    />
                                </div>
                            </div>
                        ) : null}
                        <div style={{ marginTop: "0.85rem" }}>
                            <InterventionEntriesWorkspace
                                viewerRole="RESPONSABLE_TECHNIQUE"
                                initialTicketId={ticket.id}
                                hideTicketSelector
                                title="Tableau des pièces et autres"
                                sendToAdvOnSave={needsQuote && !quoteAlreadySent}
                                advEstimatedDuration={needsQuote ? estimatedDuration : ""}
                                advQuoteArticleCode={needsQuote ? quoteArticleCode : ""}
                                onSaved={fetchTicket}
                            />
                        </div>
                    </section>
                ) : null}
            </section>
        );
    }

    return (
        <section style={{ display: "grid", gap: "0.85rem" }}>
            <section className={styles.sectionCard}>
                <div className={styles.itemMain}>
                    <div>
                        <h2 className={styles.sectionTitle}>Détail ticket #{ticketNumber}</h2>
                        <div className={styles.helper}>
                            {getStatusLabel(ticket.status || "")} · Affecté à {ticket.assignedTo?.name || "-"} · Garantie ADV : {warrantyLabel}
                        </div>
                    </div>
                    <Link className="btn btn-outline" href={backHref}>Retour</Link>
                </div>
            </section>

            <section className={styles.formGrid2}>
                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>Client</h3>
                    <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.75rem" }}>
                        <DetailField label="Nom" value={ticket.reclamation?.customerName || ticket.equipment?.client} />
                        <DetailField label="E-mail" value={ticket.reclamation?.contactEmail} />
                        <DetailField label="Portable" value={ticket.reclamation?.phone} />
                        <DetailField label="Fixe" value={(checklistMeta as any).phoneFixed} />
                        <DetailField label="Établissement" value={(checklistMeta as any).establishment} />
                        <DetailField label="Type d'établissement" value={ESTABLISHMENT_TYPE_LABELS[String((checklistMeta as any).establishmentType || "")] || (checklistMeta as any).establishmentType} />
                        <DetailField label="Secteur" value={SPECIALTY_SECTOR_LABELS[String((checklistMeta as any).specialtySector || "")] || (checklistMeta as any).specialtySector} />
                        <DetailField label="Spécialité" value={(checklistMeta as any).specialty === "AUTRE" ? (checklistMeta as any).specialtyOther : (checklistMeta as any).specialty} />
                    </div>
                </article>

                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>{equipmentItems.length > 1 ? "Matériels concernés" : "Matériel concerné"}</h3>
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
                        {equipmentItems.map((item, index) => (
                            <div key={`rt-detail-equipment-${item.index}-${index}`} style={INNER_CARD_STYLE}>
                                <div className={styles.itemTitle}>{formatEquipmentLabel(item)}</div>
                                {formatEquipmentMeta(item) ? <div className={styles.itemMeta}>{formatEquipmentMeta(item)}</div> : null}
                            </div>
                        ))}
                        <DetailField label="Marque" value={(checklistMeta as any).brand || ticket.equipment?.brand} />
                        <DetailField label="Modèle" value={(checklistMeta as any).model || ticket.equipment?.model || ticket.reclamation?.deviceModel} />
                        <DetailField label="Accessoires" value={accessoriesValue} />
                        <DetailField label="Type d'intervention" value={getInterventionLabel(ticket.reclamation?.interventionType || "")} />
                        <DetailField label="Description de la panne" value={failureDescription} multiline />
                    </div>
                </article>
            </section>

            <AiTicketInsights ticket={ticket as any} />

            <section className={styles.formGrid2}>
                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>Infos DP et agence de dépôt</h3>
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
                        <DetailField label="Agence de dépôt" value={depositAgency} />
                        {depotPrincipalItems.map((item: any, index: number) => (
                            <div key={`rt-detail-dp-${item.index}-${index}`} style={INNER_CARD_STYLE}>
                                <div className={styles.itemTitle}>{formatEquipmentLabel(item)}</div>
                                <DetailField label="Code matériel à réparer" value={item.articleCode} />
                                <DetailField label="Date facture fournisseur" value={item.invoiceDate ? formatDate(item.invoiceDate) : ""} />
                                <DetailField label="Date garantie Top Medical" value={item.topMedicalWarrantyLimitDate ? formatDate(item.topMedicalWarrantyLimitDate) : ""} />
                                <DetailField label="Date d'expédition" value={item.shippingDate ? formatDate(item.shippingDate) : ""} />
                                <DetailField label="Date limite fournisseur" value={item.warrantyLimitDate ? formatDate(item.warrantyLimitDate) : ""} />
                            </div>
                        ))}
                        <DetailField label="Note dépôt principal" value={storeReview.note} multiline />
                    </div>
                </article>

                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>Documents envoyés par le client</h3>
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
                        {documents.length === 0 ? <div className={styles.empty}>Aucun document transmis.</div> : documents.map((item, index) => (
                            <AttachmentCard key={`${item.dataUrl || item.name}-${index}`} item={item} index={index} />
                        ))}
                    </div>
                </article>
            </section>

            <section className={styles.sectionCard} style={CARD_STYLE}>
                <h3 className={styles.sectionTitle}>Images et vidéos de la panne</h3>
                <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
                    {medias.length === 0 ? <div className={styles.empty}>Aucune image ou vidéo de panne transmise.</div> : medias.map((item, index) => (
                        <AttachmentCard key={`${item.dataUrl || item.name}-${index}`} item={item} index={index} />
                    ))}
                </div>
            </section>

        </section>
    );
}

export default function ResponsableTechniqueTicketDetailPage() {
    return <ResponsableTechniqueTicketDetailContent />;
}
