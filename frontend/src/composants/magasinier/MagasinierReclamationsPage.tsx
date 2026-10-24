"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getReclamationStatusLabel } from "@/metier/workflow-adv";
import { formatEquipmentSummary, getTicketEquipmentItems } from "@/metier/materiel-ticket";

type ReclamationItem = {
    id: number;
    status: string;
    customerName: string;
    deviceModel: string;
    serialNumber: string;
    createdAt: string;
    checklist?: string | null;
    ticket?: {
        id: number;
        status: string;
        savHistory?: Array<{
            id: number;
            action?: string | null;
            note?: string | null;
            createdAt?: string | null;
        }> | null;
    } | null;
};

type ReviewAction = "SAVE_DRAFT" | "RETURN_INCOMPLETE" | "VALIDATE_AND_FORWARD" | "RESEND_TO_ADV";

type EquipmentMerchandiseItem = {
    entryId: string;
    materialIndex: number;
    label: string;
    quantity: number;
    serialNumber: string;
    pn: string;
    supplier: string;
    articleCode: string;
    warrantyLabel: string;
    invoiceDate: string;
    shippingDate: string;
    warrantyLimitDate?: string;
};

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

function calculateWarrantyLimitDate(shippingDate: unknown, warrantyLabel: unknown) {
    const normalizedShippingDate = String(shippingDate || "").trim();
    const months = parseWarrantyMonths(warrantyLabel);
    if (!normalizedShippingDate || !months) return "";
    const date = new Date(`${normalizedShippingDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

function formatDateFr(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(`${text}T00:00:00`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("fr-FR");
}

function buildEquipmentMerchandiseItems(checklist: any, selected: ReclamationItem | null): EquipmentMerchandiseItem[] {
    const entryRepairSlip = checklist?.metadata?.entryRepairSlip || {};
    const rawEquipment = Array.isArray(entryRepairSlip?.equipmentItems) && entryRepairSlip.equipmentItems.length > 0
        ? entryRepairSlip.equipmentItems
        : [{ designation: selected?.deviceModel || "Matériel", quantity: 1 }];
    const existing = Array.isArray(checklist?.metadata?.merchandiseInfo?.equipmentMerchandiseItems)
        ? checklist.metadata.merchandiseInfo.equipmentMerchandiseItems
        : [];

    const rows: EquipmentMerchandiseItem[] = rawEquipment.flatMap((item: any, index: number) => {
        const label = String(item?.designation || `Matériel ${index + 1}`);
        const quantity = Math.max(1, Number(item?.quantity || 1) || 1);
        const serialNumber = String(item?.serialNumber || (index === 0 ? selected?.serialNumber || "" : ""));
        const pn = String(item?.pn || "");
        const matches = existing.filter((entry: any) => {
            const materialIndex = Number(entry?.materialIndex ?? entry?.index);
            return materialIndex === index || String(entry?.label || "").trim() === label.trim();
        });

        if (matches.length === 0) {
            return [{
                entryId: `${index}-0`,
                materialIndex: index,
                label,
                quantity,
                serialNumber,
                pn,
                supplier: "",
                articleCode: "",
                warrantyLabel: "",
                invoiceDate: "",
                shippingDate: "",
                warrantyLimitDate: ""
            }];
        }

        const fullRows = matches.filter((entry: any) => !entry?.fieldScope);
        if (fullRows.length > 0) {
            return fullRows.map((entry: any, matchIndex: number) => ({
                entryId: String(entry?.entryId || `${index}-${matchIndex}`),
                materialIndex: index,
                label,
                quantity,
                serialNumber,
                pn,
                supplier: String(entry?.supplier || entry?.fournisseur || ""),
                articleCode: String(entry?.articleCode || ""),
                warrantyLabel: String(entry?.warrantyLabel || ""),
                invoiceDate: String(entry?.invoiceDate || ""),
                shippingDate: String(entry?.shippingDate || ""),
                warrantyLimitDate: String(entry?.warrantyLimitDate || calculateWarrantyLimitDate(entry?.shippingDate, entry?.warrantyLabel))
            }));
        }

        const articles = matches.filter((entry: any) => entry?.fieldScope === "articleCode").map((entry: any) => String(entry?.articleCode || ""));
        const warranties = matches.filter((entry: any) => entry?.fieldScope === "warrantyLabel").map((entry: any) => String(entry?.warrantyLabel || ""));
        const invoices = matches.filter((entry: any) => entry?.fieldScope === "invoiceDate").map((entry: any) => String(entry?.invoiceDate || ""));
        const shippings = matches.filter((entry: any) => entry?.fieldScope === "shippingDate").map((entry: any) => String(entry?.shippingDate || ""));
        const rowCount = Math.max(articles.length, warranties.length, invoices.length, shippings.length, 1);

        return Array.from({ length: rowCount }, (_, rowIndex) => ({
            entryId: `${index}-${rowIndex}`,
            materialIndex: index,
            label,
            quantity,
            serialNumber,
            pn,
            supplier: "",
            articleCode: articles[rowIndex] || "",
            warrantyLabel: warranties[rowIndex] || "",
            invoiceDate: invoices[rowIndex] || "",
            shippingDate: shippings[rowIndex] || "",
            warrantyLimitDate: calculateWarrantyLimitDate(shippings[rowIndex] || "", warranties[rowIndex] || "")
        }));
    });

    const usedEntryIds = new Set<string>();
    return rows.map((row: EquipmentMerchandiseItem, rowIndex: number) => {
        const baseEntryId = String(row.entryId || `${row.materialIndex}-${rowIndex}`).trim() || `${row.materialIndex}-${rowIndex}`;
        let uniqueEntryId = baseEntryId;
        let suffix = 1;

        while (usedEntryIds.has(uniqueEntryId)) {
            uniqueEntryId = `${baseEntryId}-${rowIndex}-${suffix}`;
            suffix += 1;
        }

        usedEntryIds.add(uniqueEntryId);
        return { ...row, entryId: uniqueEntryId };
    });
}

function getMaterialPreview(item: ReclamationItem | null) {
    if (!item) {
        return "";
    }

    const materialItems = getTicketEquipmentItems({
        checklist: item.checklist,
        deviceModel: item.deviceModel,
        serialNumber: item.serialNumber,
        equipmentName: item.deviceModel
    });

    if (materialItems.length === 0) {
        return `${item.deviceModel} - SN : ${item.serialNumber}`;
    }

    return materialItems.map(formatEquipmentSummary).join(" / ");
}

function getUniqueValues(values: Array<string | null | undefined>) {
    const seen = new Set<string>();

    return values.reduce<string[]>((accumulator, value) => {
        const normalizedValue = String(value || "").trim();
        if (!normalizedValue) return accumulator;

        const key = normalizedValue.toLowerCase();
        if (seen.has(key)) return accumulator;

        seen.add(key);
        accumulator.push(normalizedValue);
        return accumulator;
    }, []);
}

function getLocalUser() {
    try {
        const raw = localStorage.getItem("user");
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            id: Number(parsed?.id || 0) || null,
            role: String(parsed?.role || "")
        };
    } catch {
        return {
            id: null,
            role: ""
        };
    }
}

type MagasinierReclamationsPageProps = {
    historyOnly?: boolean;
    historyPath?: string;
    backHref?: string;
};

export default function MagasinierReclamationsPage({
    historyOnly = false,
    historyPath = "/ticket/infos-DP/historique",
    backHref = "/ticket/infos-DP"
}: MagasinierReclamationsPageProps = {}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedTicketId = Number(searchParams.get("ticketId") || 0) || null;
    const [loading, setLoading] = useState(true);
    const [savingAction, setSavingAction] = useState<ReviewAction | null>(null);
    const [reclamations, setReclamations] = useState<ReclamationItem[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [historySelectedId, setHistorySelectedId] = useState<number | null>(null);
    const [note, setNote] = useState("");
    const [historySearch, setHistorySearch] = useState("");
    const [equipmentMerchandiseItems, setEquipmentMerchandiseItems] = useState<EquipmentMerchandiseItem[]>([]);
    const shouldSelectActiveTicketsRef = useRef(false);

    const fetchReclamations = async () => {
        setLoading(true);
        try {
            const user = getLocalUser();
            const response = await fetch("/api/reclamations?light=1&includeStoreReview=1&historyLimit=20", {
                headers: {
                    "x-user-role": user.role,
                    "x-user-id": String(user.id || "")
                }
            });
            const data = await response.json();
            const list = Array.isArray(data) ? data : [];
            const visible = list.filter((item: ReclamationItem) => {
                const status = String(item.status || "").toUpperCase();
                const ticketStatus = String(item?.ticket?.status || "").toUpperCase();
                const checklist = parseChecklistPayload(item.checklist);
                const metadata = checklist?.metadata || {};
                const merchandiseInfo = (metadata as any)?.merchandiseInfo || {};
                const storeReview = (metadata as any)?.storeReview || {};

                const sentToMagasinier = status === "PENDING_STORE_REVIEW";
                const alreadyProcessedByMagasinier = ["PENDING_TECHNICAL_MANAGER_REVIEW", "PENDING_ADV", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE", "DECISION_OUT_OF_WARRANTY", "PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED"].includes(status)
                    && Boolean(String(storeReview?.updatedAt || "").trim() || String(storeReview?.lastAction || "").trim());

                const canStillBeEditedByMagasinier = ticketStatus !== "READY_FOR_DELIVERY" && ticketStatus !== "CLOSED";

                return canStillBeEditedByMagasinier && (sentToMagasinier || alreadyProcessedByMagasinier);
            });

            setReclamations(visible);
            setSelectedId((prev) => {
                const activeItems = visible.filter((item: ReclamationItem) => String(item.status || "").toUpperCase() === "PENDING_STORE_REVIEW");
                if (shouldSelectActiveTicketsRef.current) {
                    shouldSelectActiveTicketsRef.current = false;
                    return activeItems[0]?.id || null;
                }
                if (requestedTicketId && visible.some((item: ReclamationItem) => item.id === requestedTicketId)) return requestedTicketId;
                if (prev && activeItems.some((item: ReclamationItem) => item.id === prev)) return prev;
                return activeItems[0]?.id || null;
            });
            setHistorySelectedId((prev) => (prev && visible.some((item: ReclamationItem) => item.id === prev) ? prev : null));
        } catch (error) {
            console.error("Magasinier fetch error:", error);
            setReclamations([]);
            setSelectedId(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReclamations();
    }, [requestedTicketId]);

    const selected = useMemo(
        () => reclamations.find((item) => item.id === selectedId) || null,
        [reclamations, selectedId]
    );
    const activeReclamations = useMemo(
        () => reclamations.filter((item) => String(item.status || "").toUpperCase() === "PENDING_STORE_REVIEW"),
        [reclamations]
    );
    const historicalReclamations = useMemo(
        () => reclamations.filter((item) => ["PENDING_TECHNICAL_MANAGER_REVIEW", "PENDING_ADV", "READY_FOR_TECH_MANAGER_ASSIGNMENT", "TAKEN_IN_CHARGE", "DECISION_OUT_OF_WARRANTY", "PENDING_ADV_QUOTE", "QUOTE_SENT_TO_CLIENT", "QUOTE_APPROVED"].includes(String(item.status || "").toUpperCase())),
        [reclamations]
    );
    const filteredHistoricalReclamations = useMemo(() => {
        const query = historySearch.trim().toLowerCase();
        if (!query) return historicalReclamations;

        return historicalReclamations.filter((item) => {
            const itemChecklist = parseChecklistPayload(item.checklist);
            const itemEquipmentEntries = buildEquipmentMerchandiseItems(itemChecklist, item);
            const historyEntries = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
            const lastReviewEntry = [...historyEntries].find((entry) => String(entry?.action || "").startsWith("MAGASINIER_CONTRACT_REVIEW_"));
            const searchableText = [
                (item.ticket as any)?.displayId,
                item.ticket?.id,
                item.id,
                item.customerName,
                item.deviceModel,
                item.serialNumber,
                lastReviewEntry?.createdAt ? new Date(String(lastReviewEntry.createdAt)).toLocaleString("fr-FR") : "",
                ...itemEquipmentEntries.flatMap((entry) => [entry.label, entry.serialNumber, entry.pn, entry.articleCode, entry.supplier])
            ].filter(Boolean).join(" ").toLowerCase();

            return searchableText.includes(query);
        });
    }, [historicalReclamations, historySearch]);
    const isHistoryEditing = useMemo(
        () => Boolean(selected && historicalReclamations.some((item) => item.id === selected.id)),
        [historicalReclamations, selected]
    );
    const selectableReclamations = useMemo(
        () => (isHistoryEditing && selected ? [selected] : activeReclamations),
        [activeReclamations, isHistoryEditing, selected]
    );

    const selectedChecklist = useMemo(() => parseChecklistPayload(selected?.checklist), [selected?.checklist]);
    const materialSummary = useMemo(
        () => getUniqueValues(
            equipmentMerchandiseItems.map((item) => {
                const label = String(item.label || "").trim();
                if (!label) return "";

                return formatEquipmentSummary({
                    index: 0,
                    designation: label,
                    serialNumber: item.serialNumber,
                    pn: item.pn,
                    articleCode: "",
                    quantity: Math.max(1, Number(item.quantity || 1) || 1)
                });
            })
        ),
        [equipmentMerchandiseItems]
    );

    const summaryLines = useMemo(
        () => [
            { label: "Numéro ticket", value: `#${selected?.ticket?.id || "-"}` },
            { label: "Nom du client", value: selected?.customerName || "-" },
            {
                label: "Matériel à réparer",
                value: materialSummary.length > 0 ? (
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        {materialSummary.map((summary, index) => {
                            const segments = summary.split(" - ");
                            const [title, ...metaParts] = segments;

                            return (
                                <div
                                    key={`material-summary-${index}`}
                                    style={{
                                        border: "1px solid #e2e8f0",
                                        borderRadius: "8px",
                                        padding: "0.45rem 0.55rem",
                                        background: "#f8fafc"
                                    }}
                                >
                                    <div style={{ fontWeight: 700, lineHeight: 1.3 }}>{title}</div>
                                    {metaParts.length > 0 ? (
                                        <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.15rem", lineHeight: 1.25 }}>
                                            {metaParts.join(" - ")}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                ) : getMaterialPreview(selected) || selected?.deviceModel || "-"
            },
            {
                label: "Garantie Top Medical",
                value: String(selectedChecklist?.metadata?.merchandiseInfo?.warrantyStatus || "").toUpperCase() === "UNDER_WARRANTY"
                    ? "Sous garantie"
                    : String(selectedChecklist?.metadata?.merchandiseInfo?.warrantyStatus || "").toUpperCase() === "OUT_OF_WARRANTY"
                        ? "Hors garantie"
                        : "Non renseigné"
            }
        ].filter((item) => item.value),
        [materialSummary, selected, selectedChecklist?.metadata?.merchandiseInfo?.warrantyStatus]
    );

    useEffect(() => {
        if (!selected) {
            setNote("");
            setEquipmentMerchandiseItems([]);
            return;
        }

        const storeReview = selectedChecklist?.metadata?.storeReview || {};
        setNote(String(storeReview.note || ""));
        setEquipmentMerchandiseItems(buildEquipmentMerchandiseItems(selectedChecklist, selected));
    }, [selected?.id, selectedChecklist?.metadata]);

    const equipmentMerchandiseGroups = useMemo(
        () => equipmentMerchandiseItems.reduce<EquipmentMerchandiseItem[]>((accumulator, item) => {
            if (!accumulator.some((entry) => entry.materialIndex === item.materialIndex)) {
                accumulator.push(item);
            }
            return accumulator;
        }, []),
        [equipmentMerchandiseItems]
    );

    const updateEquipmentMerchandiseItem = (index: number, field: keyof Pick<EquipmentMerchandiseItem, "articleCode" | "supplier" | "warrantyLabel" | "invoiceDate" | "shippingDate">, value: string) => {
        setEquipmentMerchandiseItems((prev) => prev.map((item, itemIndex) => {
            if (itemIndex !== index) return item;
            const next = { ...item, [field]: value };
            return {
                ...next,
                warrantyLimitDate: calculateWarrantyLimitDate(next.shippingDate, next.warrantyLabel)
            };
        }));
    };

    const addEquipmentMerchandiseItem = (materialIndex: number) => {
        setEquipmentMerchandiseItems((prev) => {
            const sample = prev.find((item) => item.materialIndex === materialIndex);
            if (!sample) return prev;

            return [
                ...prev,
                {
                    entryId: `${materialIndex}-${Date.now()}`,
                    materialIndex,
                    label: sample.label,
                    quantity: sample.quantity,
                    serialNumber: sample.serialNumber,
                    pn: sample.pn,
                    supplier: "",
                    articleCode: "",
                    warrantyLabel: "",
                    invoiceDate: "",
                    shippingDate: "",
                    warrantyLimitDate: ""
                }
            ];
        });
    };

    const removeEquipmentMerchandiseItem = (entryId: string) => {
        setEquipmentMerchandiseItems((prev) => {
            const target = prev.find((item) => item.entryId === entryId);
            if (!target) return prev;

            const sameMaterialCount = prev.filter((item) => item.materialIndex === target.materialIndex).length;
            if (sameMaterialCount <= 1) return prev;
            return prev.filter((item) => item.entryId !== entryId);
        });
    };

    const submitReview = async (actionType: ReviewAction) => {
        if (!selected || savingAction) return;
        const shouldReturnToActiveTickets = isHistoryEditing && actionType === "SAVE_DRAFT";

        setSavingAction(actionType);
        try {
            const user = getLocalUser();

            const response = await fetch(`/api/magasinier/reclamations/${selected.id}/contract-review`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-role": user.role,
                    "x-user-id": String(user.id || "")
                },
                body: JSON.stringify({
                    actionType,
                    userId: user.id,
                    note,
                    equipmentMerchandiseItems: equipmentMerchandiseItems.map((item, index) => ({
                        entryId: item.entryId,
                        materialIndex: item.materialIndex,
                        index: item.materialIndex,
                        label: item.label,
                        quantity: item.quantity,
                        supplier: item.supplier.trim() || null,
                        articleCode: item.articleCode.trim() || null,
                        warrantyLabel: item.warrantyLabel.trim() || null,
                        invoiceDate: item.invoiceDate || null,
                        shippingDate: item.shippingDate || null,
                        warrantyLimitDate: calculateWarrantyLimitDate(item.shippingDate, item.warrantyLabel) || null
                    }))
                })
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                alert(payload?.error || "Impossible d'enregistrer les informations propres au dépôt principal.");
                return;
            }

            if (actionType === "VALIDATE_AND_FORWARD") {
                alert("Informations propres au dépôt principal validées et transmises au responsable technique.");
            } else if (actionType === "RESEND_TO_ADV") {
                alert("Informations modifiées et renvoyées à l'ADV.");
            } else if (actionType === "RETURN_INCOMPLETE") {
                alert("Ticket retourné à l'ADV pour complément.");
            } else {
                alert("Informations propres au dépôt principal enregistrées.");
            }

            if (shouldReturnToActiveTickets) {
                shouldSelectActiveTicketsRef.current = true;
            }
            await fetchReclamations();
            if (shouldReturnToActiveTickets) {
                router.replace(backHref);
            }
        } catch (error: any) {
            console.error("Magasinier submit error:", error);
            alert(error?.message || "Erreur pendant l'enregistrement.");
        } finally {
            setSavingAction(null);
        }
    };

    if (loading) {
        return (
            <div className="card" style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
                <Loader2 size={18} className="animate-spin" />
                Chargement des informations propres au dépôt principal...
            </div>
        );
    }

    const historyTable = (
        <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <input
                    className={styles.searchInput}
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Rechercher par ticket, client ou matériel..."
                    style={{ maxWidth: "420px" }}
                />
            </div>
            {historicalReclamations.length === 0 ? (
                <div>Aucun historique disponible.</div>
            ) : filteredHistoricalReclamations.length === 0 ? (
                <div>Aucun résultat trouvé.</div>
            ) : (
                <div style={{ overflowX: "auto", border: "1px solid var(--border-color)", borderRadius: "12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
                        <thead>
                            <tr style={{ background: "#111111" }}>
                                <th style={historyHeaderStyle}>Ticket</th>
                                <th style={historyHeaderStyle}>Client</th>
                                <th style={historyHeaderStyle}>Dernier envoi</th>
                                <th style={historyHeaderStyle}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredHistoricalReclamations.map((item) => {
                                const historyEntries = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
                                const lastReviewEntry = [...historyEntries].find((entry) => String(entry?.action || "").startsWith("MAGASINIER_CONTRACT_REVIEW_"));
                                const itemChecklist = parseChecklistPayload(item.checklist);
                                const itemEquipmentEntries = buildEquipmentMerchandiseItems(itemChecklist, item);

                                return (
                                    <tr key={`history-${item.id}`}>
                                        <td style={historyCellStyle}>
                                            <div style={{ fontWeight: 700 }}>#{(item.ticket as any)?.displayId || item.ticket?.id || item.id}</div>
                                            <div style={{ color: "var(--text-secondary)", fontSize: "0.84rem" }}>
                                                {getUniqueValues(itemEquipmentEntries.map((entry) => entry.label)).join(" / ") || item.deviceModel}
                                            </div>
                                        </td>
                                        <td style={historyCellStyle}>{item.customerName || "-"}</td>
                                        <td style={historyCellStyle}>{lastReviewEntry?.createdAt ? new Date(String(lastReviewEntry.createdAt)).toLocaleString("fr-FR") : "-"}</td>
                                        <td style={historyCellStyle}>
                                            <Link className="btn btn-outline" href={`${backHref}?ticketId=${item.id}`}>
                                                Modifier les infos
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );

    if (historyOnly) {
        return (
            <div className={styles.dashboardContainer}>
                <div className={styles.pageHeader} style={{ justifyContent: "flex-end" }}>
                    <Link className="btn btn-outline" href={backHref}>Retour aux infos DP</Link>
                </div>
                {historyTable}
            </div>
        );
    }

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Infos DP</h1>
                </div>
                <Link className="btn btn-outline" href={historyPath}>Historique</Link>
            </div>
            {!selected && activeReclamations.length === 0 ? (
                <section className="card" style={{ padding: "1rem" }}>
                    <div>Aucun ticket en attente d'informations propres au dépôt principal.</div>
                </section>
            ) : selected ? (
                <>
                <section className="card" style={{ padding: "1rem", display: "grid", gap: "0.9rem" }}>
                    <div style={{ display: "grid", gap: "0.35rem" }}>
                        <label style={{ display: "block", fontWeight: 600 }}>Ticket</label>
                        <select
                            value={selected.id}
                            onChange={(event) => setSelectedId(Number(event.target.value) || null)}
                            style={{ width: "100%", maxWidth: "320px", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.65rem" }}
                        >
                            {selectableReclamations.map((item) => (
                                <option key={item.id} value={item.id}>
                                    Ticket #{(item.ticket as any)?.displayId || item.ticket?.id || item.id}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", alignItems: "start" }}>
                        {summaryLines.map((item) => (
                            <InfoLine key={item.label} label={item.label} value={item.value} />
                        ))}
                    </div>

                    <div>
                        <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>Infos DP</div>
                        <div style={{ display: "grid", gap: "0.85rem" }}>
                            {equipmentMerchandiseGroups.map((item) => (
                                <div key={`material-${item.materialIndex}`} style={{ border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.85rem", background: "var(--card-bg)" }}>
                                    <div style={{ display: "grid", gap: "0.85rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                                        <EquipmentMerchandiseRowsEditor
                                            rows={equipmentMerchandiseItems.filter((entry) => entry.materialIndex === item.materialIndex)}
                                            onAdd={() => addEquipmentMerchandiseItem(item.materialIndex)}
                                            onRemove={(entryId) => removeEquipmentMerchandiseItem(entryId)}
                                            onChange={(entryId, field, value) => {
                                                const rowIndex = equipmentMerchandiseItems.findIndex((entry) => entry.entryId === entryId);
                                                if (rowIndex >= 0) updateEquipmentMerchandiseItem(rowIndex, field, value);
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Note</label>
                        <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            style={{ width: "100%", minHeight: "110px", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}
                        />
                    </div>

                    <div style={{ display: "flex", gap: "0.55rem", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {isHistoryEditing ? (
                            <button className="btn btn-primary" onClick={() => submitReview("SAVE_DRAFT")} disabled={Boolean(savingAction)}>
                                {savingAction === "SAVE_DRAFT" ? "Enregistrement..." : "Enregistrer les modifications"}
                            </button>
                        ) : (
                            <>
                                <button className="btn btn-primary" onClick={() => submitReview("VALIDATE_AND_FORWARD")} disabled={Boolean(savingAction)}>
                                    {savingAction === "VALIDATE_AND_FORWARD" ? "Validation..." : "Valider et transmettre"}
                                </button>
                            </>
                        )}
                    </div>
                </section>
                </>
            ) : null}
        </div>
    );
}

const historyHeaderStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "0.75rem",
    fontSize: "0.76rem",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "#ffffff",
    borderBottom: "1px solid var(--border-color)"
};

const historyCellStyle: React.CSSProperties = {
    padding: "0.75rem",
    borderBottom: "1px solid #e2e8f0",
    verticalAlign: "top"
};

function InfoLine({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div style={{ border: "1px solid var(--border-color)", borderRadius: "10px", padding: "0.65rem 0.75rem", background: "var(--card-bg)", minHeight: "100%" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.76rem", marginBottom: "0.2rem", lineHeight: 1.2 }}>{label}</div>
            <div style={{ fontWeight: 700, lineHeight: 1.3, wordBreak: "break-word" }}>{value || "-"}</div>
        </div>
    );
}

function Field({ label, value, onChange, placeholder = "", type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
    return (
        <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>{label}</label>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}
                placeholder={placeholder}
            />
        </div>
    );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>{label}</label>
            <input
                value={value || "-"}
                readOnly
                style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem", background: "#f8fafc" }}
            />
        </div>
    );
}

function EquipmentMerchandiseRowsEditor({
    rows,
    onChange,
    onAdd,
    onRemove
}: {
    rows: EquipmentMerchandiseItem[];
    onChange: (entryId: string, field: keyof Pick<EquipmentMerchandiseItem, "articleCode" | "supplier" | "warrantyLabel" | "invoiceDate" | "shippingDate">, value: string) => void;
    onAdd: () => void;
    onRemove: (entryId: string) => void;
}) {
    return (
        <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
                <label style={{ display: "block", fontWeight: 600 }}>Informations DP</label>
                <button className="btn btn-outline" type="button" onClick={onAdd}>
                    Ajouter
                </button>
            </div>
            <div style={{ display: "grid", gap: "0.45rem" }}>
                {rows.map((item) => (
                    <div key={`${item.materialIndex}-${item.entryId}`} style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.7rem", background: "#fff" }}>
                        <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                            <Field label="Code matériel à réparer" value={item.articleCode} onChange={(value) => onChange(item.entryId, "articleCode", value)} placeholder="Ex: ART-001" />
                            <Field label="Date facture fournisseur" value={item.invoiceDate} onChange={(value) => onChange(item.entryId, "invoiceDate", value)} type="date" />
                            <Field label="Garantie contractuelle fournisseur" value={item.warrantyLabel} onChange={(value) => onChange(item.entryId, "warrantyLabel", value)} placeholder="Ex: 12 mois" />
                            <Field label="Date d'expédition fournisseur" value={item.shippingDate} onChange={(value) => onChange(item.entryId, "shippingDate", value)} type="date" />
                            <ReadOnlyField label="Date limite fournisseur" value={formatDateFr(item.warrantyLimitDate || calculateWarrantyLimitDate(item.shippingDate, item.warrantyLabel))} />
                        </div>
                        {rows.length > 1 ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.7rem" }}>
                                <button className="btn btn-outline" type="button" onClick={() => onRemove(item.entryId)}>
                                    Supprimer
                                </button>
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}


