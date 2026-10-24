"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import styles from "../../technicien.module.css";
import InterventionEntriesWorkspace from "@/composants/espace-tickets/SaisieInterventionsPieces";
import { extractClientDocuments, isFailureMediaAttachment, parseChecklistPayload } from "@/metier/workflow-client";
import { formatImportReference } from "@/metier/workflow-import";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";
import {
    TECH_STATUS_OPTIONS,
    canTechnicianModifyRepairStatus,
    formatDate,
    getInterventionLabel,
    getStatusLabel,
    normalizeTechProgressStatus
} from "@/metier/workflow-technicien";

type TicketDetail = {
    id: number;
    status?: string | null;
    displayId?: string | number | null;
    ticketReference?: string | null;
    assignedTo?: { id?: number | null; name?: string | null } | null;
    equipment?: {
        name?: string | null;
        serialNumber?: string | null;
        brand?: string | null;
        model?: string | null;
        client?: string | null;
        location?: string | null;
    } | null;
    reclamation?: {
        id?: number;
        customerName?: string | null;
        deviceModel?: string | null;
        serialNumber?: string | null;
        description?: string | null;
        interventionType?: string | null;
        checklist?: string | null;
        status?: string | null;
    } | null;
};

type ImportOrderSummary = {
    id: number;
    ref?: string | null;
    status?: string | null;
    supplierContact?: string | null;
    trackingNumber?: string | null;
    expectedDate?: string | null;
    receivedDate?: string | null;
    updatedAt?: string | null;
    createdAt?: string | null;
    ticket?: { id?: number | null } | null;
    items?: Array<{ name?: string | null; qty?: number | null }>;
};

const STATUS_UPDATE_OPTIONS = [...TECH_STATUS_OPTIONS, "NON_REPARE"] as const;
const CARD_STYLE = {
    background: "#f8fafc",
    border: "1px solid #cbd5e1",
    borderRadius: "14px",
    padding: "1rem"
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

function getLocalUser() {
    try {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        return {
            id: Number(user?.id || 0) || null,
            role: String(user?.role || "").trim().toUpperCase()
        };
    } catch {
        return { id: null, role: "" };
    }
}

function valueOrDash(value: unknown) {
    const text = String(value ?? "").trim();
    if (!text || text.toLowerCase() === "unknown") return "-";
    return text;
}

function hasValue(value: unknown) {
    return valueOrDash(value) !== "-";
}

function DetailField({ label, value, multiline = false }: { label: string; value: unknown; multiline?: boolean }) {
    if (!hasValue(value)) return null;
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
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("fr-FR");
}

function getClientDisplayName(ticket: TicketDetail | null) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const firstName = String((metadata as any)?.firstName || "").trim();
    const lastName = String((metadata as any)?.lastName || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || ticket?.reclamation?.customerName || ticket?.equipment?.client || "-";
}

function buildImportItemsLabel(items: ImportOrderSummary["items"]) {
    if (!Array.isArray(items) || items.length === 0) return "Pièce non renseignée";
    return items.map((item) => String(item?.name || "Pièce").trim()).join(", ");
}

function getImportStatusLabel(status: unknown) {
    const normalized = String(status || "").trim().toUpperCase();
    return IMPORT_STATUS_LABELS[normalized] || valueOrDash(status);
}

function getImportRefsFromTicket(ticket: TicketDetail | null) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const diagnosis = (metadata as any).technicalDiagnosis || {};
    const entries = Array.isArray(diagnosis.repairEntries) ? diagnosis.repairEntries : [];
    return new Set(entries.map((entry: any) => String(entry?.importRequestRef || "").trim()).filter(Boolean));
}

function AttachmentCard({ item, index }: { item: any; index: number }) {
    const name = item.name || `Document ${index + 1}`;
    const isMedia = isFailureMediaAttachment(item);
    return (
        <div style={{ border: "1px solid #dbe3ea", borderRadius: "12px", padding: "0.75rem", background: "#fff" }}>
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

function ImportTrackingSection({ orders }: { orders: ImportOrderSummary[] }) {
    return (
        <section className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Suivi des demandes import</h3>
            {orders.length === 0 ? (
                <div className={styles.empty}>Aucune demande de pièce transmise à l'import pour ce ticket.</div>
            ) : (
                <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                    {orders.map((order) => (
                        <article key={`technicien-import-${order.id}`} className={styles.listItem}>
                            <div className={styles.itemMain} style={{ alignItems: "flex-start", gap: "1rem" }}>
                                <div style={{ minWidth: 0 }}>
                                    <div className={styles.itemTitle}>{formatImportReference(order.ref) || `Demande import #${order.id}`}</div>
                                    <div className={styles.itemMeta} style={{ marginTop: "0.25rem" }}>{buildImportItemsLabel(order.items)}</div>
                                </div>
                                <span
                                    style={{
                                        display: "inline-flex",
                                        padding: "0.2rem 0.55rem",
                                        borderRadius: "999px",
                                        background: "#fff7ed",
                                        color: "#9a3412",
                                        fontWeight: 800,
                                        fontSize: "0.78rem"
                                    }}
                                >
                                    {getImportStatusLabel(order.status)}
                                </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.55rem", marginTop: "0.75rem" }}>
                                <DetailField label="Contact fournisseur" value={order.supplierContact} />
                                <DetailField label="Numéro de suivi" value={order.trackingNumber} />
                                <DetailField label="Date prévisionnelle" value={formatDateTime(order.expectedDate)} />
                                <DetailField label="Date de réception" value={formatDateTime(order.receivedDate)} />
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

export default function TechnicienTicketDetailPage() {
    const params = useParams<{ ticketId: string }>();
    const searchParams = useSearchParams();
    const ticketId = Number(params?.ticketId || 0) || null;
    const openFollowUp = searchParams.get("section") === "suivi";

    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [ticket, setTicket] = useState<TicketDetail | null>(null);
    const [importOrders, setImportOrders] = useState<ImportOrderSummary[]>([]);
    const [currentUserId, setCurrentUserId] = useState<number | null>(null);
    const [showReport, setShowReport] = useState(false);
    const [nextStatus, setNextStatus] = useState("DIAGNOSTIC");
    const [estimatedDuration, setEstimatedDuration] = useState("");
    const [quoteArticleCode, setQuoteArticleCode] = useState("");
    const [repairAmount, setRepairAmount] = useState("");
    const [needsQuote, setNeedsQuote] = useState(false);
    const [feedback, setFeedback] = useState("");

    const fetchTicket = async () => {
        if (!ticketId) return;
        setLoadingDetail(true);
        try {
            const localUser = getLocalUser();
            const [ticketResponse, importResponse] = await Promise.all([
                fetch(`/api/tickets/${ticketId}`, { cache: "no-store" }),
                fetch(`/api/import/overview?role=TECHNICIAN&userId=${localUser.id || ""}`, { cache: "no-store" })
            ]);
            const data = await ticketResponse.json().catch(() => null);
            if (!ticketResponse.ok) throw new Error(data?.error || "Ticket introuvable.");
            if (localUser.id && Number(data?.assignedTo?.id || 0) !== Number(localUser.id)) {
                throw new Error("Ce ticket n'est pas affecté à ce technicien.");
            }

            setTicket(data);
            setNextStatus(normalizeTechProgressStatus(data?.status));

            const metadata = parseChecklistPayload(data?.reclamation?.checklist).metadata || {};
            const diagnosis = (metadata as any)?.technicalDiagnosis || {};
            setEstimatedDuration(String(diagnosis.advQuoteEstimatedDuration || diagnosis.estimatedDuration || ""));
            setQuoteArticleCode(String(diagnosis.advQuoteArticleCode || ""));
            setRepairAmount(diagnosis.repairAmount === null || diagnosis.repairAmount === undefined || diagnosis.repairAmount === "" ? "" : String(diagnosis.repairAmount));
            setNeedsQuote(Boolean(diagnosis.advQuoteReportedAt));

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
        } catch (error: any) {
            setTicket(null);
            setImportOrders([]);
            setFeedback(error?.message || "Impossible de charger le ticket.");
        } finally {
            setLoading(false);
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        const localUser = getLocalUser();
        setCurrentUserId(localUser.id);
        void fetchTicket();
    }, [ticketId]);

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
    const allDocuments = useMemo(
        () => extractClientDocuments(ticket?.reclamation ? { ...ticket.reclamation, ticket } : null, { viewerRole: "TECHNICIAN" }).filter((item) => Boolean(item.dataUrl)),
        [ticket]
    );
    const medias = useMemo(() => allDocuments.filter((item) => isFailureMediaAttachment(item)), [allDocuments]);

    const ticketNumber = ticket?.displayId || ticket?.ticketReference || ticket?.id || "-";
    const failureDescription = valueOrDash(entryRepairSlip.failureDescription || ticket?.reclamation?.description);
    const warrantyTopMedical = merchandiseInfo.topMedicalWarrantyLimitDate || merchandiseInfo.advWarrantyLimitDate;
    const quoteAlreadySent = Boolean(technicalDiagnosis.advQuoteReportedAt);
    const needsRepairAmount = nextStatus === "READY_FOR_DELIVERY" || nextStatus === "NON_REPARE";
    const canUpdateStatus = ticket ? canTechnicianModifyRepairStatus(ticket) : false;

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

            await fetchTicket();
            setFeedback("Suivi enregistré.");
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant la mise à jour du suivi.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className={styles.empty}>Chargement du détail ticket...</div>;

    if (!ticket) {
        return (
            <section className={styles.sectionCard}>
                <Link className="btn btn-outline" href="/technicien/mes-tickets">Retour</Link>
                <div className={styles.empty} style={{ marginTop: "0.85rem" }}>{feedback || "Ticket introuvable."}</div>
            </section>
        );
    }

    if (openFollowUp) {
        return (
            <section style={{ display: "grid", gap: "0.85rem" }}>
                <section className={styles.sectionCard}>
                    <div className={styles.itemMain}>
                        <h2 className={styles.sectionTitle}>Suivi ticket #{ticketNumber}</h2>
                        <Link className="btn btn-outline" href="/technicien/mes-tickets">Retour</Link>
                    </div>

                    <div style={{ marginTop: "0.85rem" }}>
                        <div className={styles.field}>
                            <label className={styles.label}>Statut</label>
                            <select
                                className={styles.select}
                                value={nextStatus}
                                disabled={!canUpdateStatus}
                                onChange={(event) => setNextStatus(event.target.value)}
                            >
                                {STATUS_UPDATE_OPTIONS.map((status) => (
                                    <option key={status} value={status}>{getStatusLabel(status)}</option>
                                ))}
                            </select>
                            {!canUpdateStatus ? (
                                <div className={styles.helper} style={{ marginTop: "0.35rem" }}>
                                    Statut verrouillé jusqu'à la validation du devis client.
                                </div>
                            ) : null}
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
                        <button className="btn btn-primary" type="button" onClick={applyFollowUp} disabled={saving || loadingDetail || !canUpdateStatus}>
                            {saving ? "Mise à jour..." : "Enregistrer le suivi"}
                        </button>
                        <button className="btn btn-outline" type="button" onClick={() => setShowReport((value) => !value)}>
                            Rapport d'intervention
                        </button>
                    </div>
                    {feedback ? <div className={styles.helper} style={{ marginTop: "0.6rem" }}>{feedback}</div> : null}
                </section>

                <ImportTrackingSection orders={importOrders} />

                {showReport ? (
                    <section className={styles.sectionCard}>
                        <h3 className={styles.sectionTitle}>Rapport d'intervention</h3>
                        {quoteAlreadySent ? (
                            <div className={styles.helper}>Rapport déjà transmis à l'ADV pour devis. Estimation enregistrée : {estimatedDuration || "-"}</div>
                        ) : (
                            <label className={styles.field} style={{ marginTop: "0.75rem", display: "flex", alignItems: "center", gap: "0.55rem" }}>
                                <input type="checkbox" checked={needsQuote} onChange={(event) => setNeedsQuote(event.target.checked)} />
                                <span className={styles.label} style={{ margin: 0 }}>Besoin d'un devis ADV</span>
                            </label>
                        )}

                        {needsQuote || quoteAlreadySent ? (
                            <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Estimation du temps d'intervention</label>
                                    <input
                                        className={styles.input}
                                        value={estimatedDuration}
                                        readOnly={quoteAlreadySent}
                                        onChange={(event) => setEstimatedDuration(event.target.value)}
                                        placeholder="Exemple : 5 jours ouvrés"
                                    />
                                </div>
                                <div className={styles.field}>
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
                                viewerRole="TECHNICIAN"
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
                        <div className={styles.helper}>{getStatusLabel(ticket.status)} · Affecté à {ticket.assignedTo?.name || "-"}</div>
                    </div>
                    <Link className="btn btn-outline" href="/technicien/mes-tickets">Retour</Link>
                </div>
            </section>

            <section className={styles.formGrid2}>
                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>Client</h3>
                    <DetailField label="Nom et prénom" value={getClientDisplayName(ticket)} />
                </article>

                <article className={styles.sectionCard} style={CARD_STYLE}>
                    <h3 className={styles.sectionTitle}>{equipmentItems.length > 1 ? "Matériels concernés" : "Matériel concerné"}</h3>
                    <div style={{ display: "grid", gap: "0.65rem", marginTop: "0.75rem" }}>
                        {equipmentItems.map((item, index) => (
                            <div key={`technicien-detail-equipment-${item.index}-${index}`} style={{ border: "1px solid #dbe3ea", borderRadius: "12px", padding: "0.75rem", background: "#fff" }}>
                                <div className={styles.itemTitle}>{formatEquipmentLabel(item)}</div>
                                {formatEquipmentMeta(item) ? <div className={styles.itemMeta}>{formatEquipmentMeta(item)}</div> : null}
                            </div>
                        ))}
                        <DetailField label="Marque" value={(checklistMeta as any).brand || ticket.equipment?.brand} />
                        <DetailField label="Modèle" value={(checklistMeta as any).model || ticket.equipment?.model || ticket.reclamation?.deviceModel} />
                        <DetailField label="Accessoires" value={(checklistMeta as any).accessories} />
                        <DetailField label="Type d'intervention" value={getInterventionLabel(ticket.reclamation?.interventionType || "")} />
                        <DetailField label="Description de la panne" value={failureDescription} multiline />
                    </div>
                </article>
            </section>

            <section className={styles.sectionCard} style={CARD_STYLE}>
                <h3 className={styles.sectionTitle}>Infos DP</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.65rem", marginTop: "0.75rem" }}>
                    <DetailField label="Agence de dépôt" value={(checklistMeta as any).depositAgency || storeReview.depositAgency || merchandiseInfo.depositAgency || ticket.equipment?.location} />
                    <DetailField label="Date garantie Top Medical" value={warrantyTopMedical ? formatDate(warrantyTopMedical) : ""} />
                </div>
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
