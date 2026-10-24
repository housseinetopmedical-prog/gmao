"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { getAdministrativeClosureAt, hasSatisfactionRecorded } from "@/metier/historique-ticket";
import { formatDateTime } from "@/metier/workflow-technicien";
import { formatEquipmentLabel, formatEquipmentMeta, getTicketEquipmentItems } from "@/metier/materiel-ticket";
import { parseChecklistPayload } from "@/metier/workflow-client";

type ImportOrder = {
    id: number;
    status?: string | null;
    notes?: string | null;
    receivedDate?: string | null;
    updatedAt?: string | null;
    ticket?: {
        id: number;
        reclamation?: {
            checklist?: string | null;
        } | null;
    } | null;
    items?: ImportOrderItem[];
};

type ImportOrderItem = {
    id?: number;
    name?: string | null;
    ref?: string | null;
    qty?: number | null;
};

type ReclamationItem = {
    id: number;
    customerName: string;
    contactEmail: string;
    phone?: string | null;
    deviceModel: string;
    serialNumber: string;
    description?: string | null;
    checklist?: string | null;
    createdAt: string;
    ticket?: {
        id: number;
        displayId?: number | string;
        ticketReference?: string | null;
        status?: string;
        priority?: string | null;
        createdAt?: string;
        closedAt?: string | null;
        satisfactionRate?: number | null;
        solution?: string | null;
        assignedTo?: {
            id?: number;
            name?: string;
        } | null;
        savHistory?: Array<{
            action?: string | null;
            createdAt?: string | null;
            note?: string | null;
        }>;
    } | null;
};

type SummaryEntry = {
    title: string;
    meta?: string;
    details?: string;
};

type ImportedPartDetails = {
    designation: string;
    quantity: string;
    reference: string;
    nature: string;
    laborHours: string;
    supplierCode: string;
    articleCode: string;
    costPrice: string;
    purchasePrice: string;
    purchaseCurrency: string;
    exportPrice: string;
    exportCurrency: string;
    salePriceTtc: string;
};

type ClosedTicketsTableProps = {
    loadingLabel?: string;
    emptyLabel?: string;
};

function parseSatisfactionFeedback(item: ReclamationItem) {
    const history = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
    const satisfactionEntry = [...history]
        .reverse()
        .find((entry) => String(entry?.action || "") === "SATISFACTION_CLIENT");

    const rawNote = String(satisfactionEntry?.note || "").trim();
    const parts = rawNote ? rawNote.split("|").map((part) => part.trim()).filter(Boolean) : [];
    const getPart = (label: string) => parts.find((part) => part.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    const notePart = getPart("Note");
    const globalPart = getPart("Satisfaction globale");
    const recommendationPart = getPart("Recommande le service");
    const commentPart = getPart("Commentaire");
    const numericRate = Number(item.ticket?.satisfactionRate || 0);

    return {
        note: notePart ? notePart.split(":").slice(1).join(":").trim() : numericRate > 0 ? `${numericRate}/10` : "Non renseignee",
        overall: globalPart ? globalPart.split(":").slice(1).join(":").trim() : "Non renseignee",
        recommendation: recommendationPart ? recommendationPart.split(":").slice(1).join(":").trim() : "Non renseignee",
        comment: commentPart ? commentPart.split(":").slice(1).join(":").trim() : "Aucun commentaire",
        recorded: hasSatisfactionRecorded(history) || numericRate > 0
    };
}

function buildImportPartsSummary(orders: ImportOrder[]) {
    const out: SummaryEntry[] = [];
    const seen = new Set<string>();

    orders.forEach((order) => {
        const requestSummary = parseImportRequestNotes(order.notes);
        const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : [{ name: "", ref: "", qty: 1 }];

        items.forEach((item) => {
            const checklistPart = findImportedPartFromChecklist(order, item);
            const mergedPart = {
                ...requestSummary,
                ...Object.fromEntries(
                    Object.entries(checklistPart || {}).filter(([, value]) => String(value || "").trim() !== "")
                )
            } as ImportedPartDetails;

            const designation = mergedPart.designation || String(item?.name || "").trim() || "Pièce importée";
            const quantity = mergedPart.quantity || String(item?.qty || "").trim() || "1";
            const reference = mergedPart.reference || String(item?.ref || "").trim();
            const details = [
                reference ? `Référence: ${reference}` : "",
                mergedPart.nature ? `Nature de réparation: ${formatImportPartNature(mergedPart.nature)}` : "",
                mergedPart.laborHours ? `Heures: ${mergedPart.laborHours}` : "",
                mergedPart.supplierCode ? `Code fournisseur: ${mergedPart.supplierCode}` : "",
                mergedPart.articleCode ? `Code article: ${mergedPart.articleCode}` : "",
                mergedPart.costPrice ? `Prix de revient: ${mergedPart.costPrice}` : "",
                mergedPart.purchasePrice ? `Prix d'achat: ${mergedPart.purchasePrice}` : "",
                mergedPart.purchaseCurrency ? `Devise: ${mergedPart.purchaseCurrency}` : "",
                mergedPart.exportPrice ? `Export price: ${mergedPart.exportPrice}` : "",
                mergedPart.exportCurrency ? `Devise export: ${mergedPart.exportCurrency}` : "",
                mergedPart.salePriceTtc ? `Prix de vente TTC: ${mergedPart.salePriceTtc}` : ""
            ].filter(Boolean);

            const dedupeKey = [designation, quantity, ...details].join("|").toLowerCase();
            if (seen.has(dedupeKey)) return;
            seen.add(dedupeKey);

            out.push({
                title: `${designation} x${quantity}`,
                details: details.join(" · ")
            });
        });
    });

    return out;
}

function getLineValue(lines: string[], pattern: RegExp) {
    const line = lines.find((entry) => pattern.test(entry));
    return line ? line.split(":").slice(1).join(":").trim() : "";
}

function formatImportPartNature(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USED_PART") return "Pièce de rechange à utiliser";
    if (normalized === "PART_REQUEST") return "Pièce de rechange à importer";
    if (normalized === "LOCAL_PART_REQUEST") return "Achat local de pièce détachée";
    if (normalized === "SOFTWARE_UPDATE" || normalized === "MAJ") return "MAJ logiciel";
    if (normalized === "SOFTWARE_INSTALLATION") return "MAJ logiciel";
    if (normalized === "PART_TO_MANUFACTURE") return "Pièce à fabriquer";
    if (normalized === "LABOR") return "Main d'oeuvre";
    if (normalized === "REPAIR") return "Main d'oeuvre";
    return String(value || "").trim();
}

function normalizeComparableValue(value: unknown) {
    return String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function toImportedPartDetails(entry: Record<string, unknown> | null | undefined): ImportedPartDetails {
    return {
        designation: String(entry?.designation || "").trim(),
        quantity: entry?.quantity === null || entry?.quantity === undefined ? "" : String(entry.quantity).trim(),
        reference: String(entry?.sageCode || entry?.supplierCode || "").trim(),
        nature: String(entry?.nature || "").trim(),
        laborHours: entry?.laborHours === null || entry?.laborHours === undefined ? "" : String(entry.laborHours).trim(),
        supplierCode: String(entry?.supplierCode || "").trim(),
        articleCode: String(entry?.sageCode || "").trim(),
        costPrice: entry?.costPrice === null || entry?.costPrice === undefined ? "" : String(entry.costPrice).trim(),
        purchasePrice: entry?.purchasePrice === null || entry?.purchasePrice === undefined ? "" : String(entry.purchasePrice).trim(),
        purchaseCurrency: String(entry?.purchaseCurrency || "").trim(),
        exportPrice: entry?.exportPrice === null || entry?.exportPrice === undefined ? "" : String(entry.exportPrice).trim(),
        exportCurrency: String(entry?.exportCurrency || "").trim(),
        salePriceTtc: entry?.salePriceTtc === null || entry?.salePriceTtc === undefined ? "" : String(entry.salePriceTtc).trim()
    };
}

function findImportedPartFromChecklist(order: ImportOrder, item: ImportOrderItem | undefined): ImportedPartDetails | null {
    const metadata = parseChecklistPayload(order?.ticket?.reclamation?.checklist).metadata || {};
    const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
    const repairEntries = Array.isArray(technicalDiagnosis.repairEntries) ? technicalDiagnosis.repairEntries : [];
    const itemName = normalizeComparableValue(item?.name);
    const itemRef = normalizeComparableValue(item?.ref);

    const match = repairEntries.find((entry: unknown) => {
        const candidate = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        if (!candidate) return false;

        const designation = normalizeComparableValue(candidate.designation);
        const sageCode = normalizeComparableValue(candidate.sageCode);
        const supplierCode = normalizeComparableValue(candidate.supplierCode);

        return (itemName && designation === itemName)
            || (itemRef && (sageCode === itemRef || supplierCode === itemRef));
    });

    return match && typeof match === "object" ? toImportedPartDetails(match as Record<string, unknown>) : null;
}

function parseImportRequestNotes(notes: string | null | undefined): ImportedPartDetails {
    const lines = String(notes || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    return {
        designation: getLineValue(lines, /^Pi[eè]ce\s+demand[eé]e\s*:/i),
        quantity: getLineValue(lines, /^Quantit[eé]\s*:/i),
        reference: getLineValue(lines, /^R[eé]f[eé]rence\s*:/i),
        nature: getLineValue(lines, /^Nature\s*:/i),
        laborHours: getLineValue(lines, /^Heures\s*:/i),
        supplierCode: getLineValue(lines, /^Code\s+fournisseur\s*:/i),
        articleCode: getLineValue(lines, /^Code\s+article\s*:/i),
        costPrice: getLineValue(lines, /^Prix\s+de\s+revient\s*:/i),
        purchasePrice: getLineValue(lines, /^Prix\s+d'achat\s*:/i),
        purchaseCurrency: getLineValue(lines, /^Devise\s*:/i),
        exportPrice: getLineValue(lines, /^Export\s+price\s*:/i),
        exportCurrency: getLineValue(lines, /^Devise\s+export\s*:/i),
        salePriceTtc: getLineValue(lines, /^Prix\s+de\s+vente\s+TTC\s*:/i)
    };
}

function formatMoney(value: unknown) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "";
    return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`;
}

function getRepairAmountSummary(checklist: string | null | undefined) {
    const metadata = parseChecklistPayload(checklist).metadata || {};
    const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
    const rawAmount = technicalDiagnosis?.repairAmount;
    const formatted = formatMoney(rawAmount);
    return formatted || "-";
}

function getSageQuoteNumber(item: ReclamationItem) {
    const checklist = parseChecklistPayload(item.checklist);
    const directValue = String(checklist?.metadata?.quote?.sageNumber || "").trim();
    if (directValue) return directValue;

    const history = Array.isArray(item.ticket?.savHistory) ? item.ticket.savHistory : [];
    const quoteHistoryNote = [...history]
        .reverse()
        .find((entry) => String(entry?.action || "").trim().toUpperCase() === "ADV_QUOTE_SENT" && String(entry?.note || "").includes("N° devis Sage:"));

    const note = String(quoteHistoryNote?.note || "");
    const match = note.match(/N°\s*devis\s*Sage\s*:\s*([^|]+)/i);
    return match?.[1]?.trim() || "-";
}

function getTicketCreatorLabel(item: ReclamationItem) {
    const metadata = parseChecklistPayload(item.checklist).metadata || {};
    const publicMarketNumber = String((metadata as any)?.publicMarketNumber || "").trim();
    if (publicMarketNumber) return "AO";

    const submittedByRole = String((metadata as any)?.submittedByRole || "").trim().toUpperCase();
    const source = String((metadata as any)?.source || "").trim().toUpperCase();
    if (submittedByRole === "RESPONSABLE_FACTURATION" || source === "FACTURATION") return "Facturation";
    if (submittedByRole === "CLIENT" || source === "CLIENT_FORM" || source === "CLIENT_EDIT") return "Client";
    if (submittedByRole === "ADV" || source === "ADV_FORM") return "ADV";
    return "-";
}

function getActionsRealiseesSummary(item: ReclamationItem) {
    const solution = String(item.ticket?.solution || "").trim();
    if (solution) return solution;

    const metadata = parseChecklistPayload(item.checklist).metadata || {};
    const reportData = (metadata as any).finalReportData || {};
    const reportAction = String(reportData.actionsRealisees || reportData["Actions réalisées"] || reportData["Action realisee"] || "").trim();
    if (reportAction) return reportAction;

    const history = Array.isArray(item.ticket?.savHistory) ? item.ticket?.savHistory : [];
    const latestInterventionLog = history.find((entry) => String(entry?.action || "") === "INTERVENTION_LOG");
    const note = String(latestInterventionLog?.note || "").trim();
    if (!note) return "-";

    const normalizedNote = note
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" · ");

    return normalizedNote || "-";
}

function buildUsedPartsSummary(checklist: string | null | undefined) {
    const metadata = parseChecklistPayload(checklist).metadata || {};
    const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
    const repairEntries = Array.isArray(technicalDiagnosis.repairEntries) ? technicalDiagnosis.repairEntries : [];
    const usedParts = Array.isArray(technicalDiagnosis.usedParts) ? technicalDiagnosis.usedParts : [];

    const normalizedRepairEntries = repairEntries
        .filter((entry: any) => entry && [entry.partsToReplace, entry.partsToRepair, entry.partsToFabricate, entry.softwareUpdate, entry.softwareInstallation].some((value) => String(value || "").trim()))
        .map((entry: any) => ({
            title: String(entry.equipmentLabel || "").trim() || "Pièces et opérations",
            meta: [
                String(entry.partsToReplace || "").trim() ? `À remplacer: ${String(entry.partsToReplace).trim()}` : "",
                String(entry.partsToRepair || "").trim() ? `À réparer: ${String(entry.partsToRepair).trim()}` : "",
                String(entry.partsToFabricate || "").trim() ? `À fabriquer: ${String(entry.partsToFabricate).trim()}` : "",
                String(entry.softwareUpdate || "").trim() ? `Mise à jour logicielle: ${String(entry.softwareUpdate).trim()}` : "",
                String(entry.softwareInstallation || "").trim() ? `Installation logicielle: ${String(entry.softwareInstallation).trim()}` : "",
                String(entry.sageReference || "").trim() ? `Réf Sage: ${String(entry.sageReference).trim()}` : "",
                String(entry.supplierReference || "").trim() ? `Réf fournisseur: ${String(entry.supplierReference).trim()}` : "",
                formatMoney(entry?.purchasedComponentsPrice) ? `Prix composants: ${formatMoney(entry.purchasedComponentsPrice)}` : ""
            ].filter(Boolean).join(" · ")
        }));

    if (normalizedRepairEntries.length > 0) return normalizedRepairEntries;

    return usedParts
        .filter((entry: any) => entry && String(entry.name || "").trim())
        .map((entry: any) => ({
            title: String(entry.name || "Pièce de rechange à utiliser").trim(),
            meta: [
                String(entry.equipmentLabel || "").trim(),
                String(entry.equipmentSerialNumber || "").trim() ? `SN: ${String(entry.equipmentSerialNumber).trim()}` : "",
                String(entry.equipmentPn || "").trim() ? `PN: ${String(entry.equipmentPn).trim()}` : "",
                formatMoney(entry.price)
            ].filter(Boolean).join(" · ")
        }));
}

function formatDepotDate(value: string | null | undefined) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleDateString("fr-FR");
}

function buildDepotInfoSummary(item: ReclamationItem) {
    const checklist = parseChecklistPayload(item.checklist);
    const metadata = (checklist?.metadata || {}) as any;
    const merchandiseInfo = metadata?.merchandiseInfo || {};
    const storeReview = metadata?.storeReview || {};
    const equipmentItems = getTicketEquipmentItems({
        checklist: item.checklist,
        deviceModel: item.deviceModel,
        serialNumber: item.serialNumber,
        description: item.description
    });

    const rawEntries = Array.isArray(merchandiseInfo?.equipmentMerchandiseItems)
        ? merchandiseInfo.equipmentMerchandiseItems
        : [];
    if (rawEntries.length > 0) {
        const seen = new Set<string>();
        const normalizedEntries = rawEntries
            .map((entry: any, index: number) => {
                const materialIndex = Number(entry?.materialIndex ?? entry?.index ?? index);
                const fallbackLabel = equipmentItems.find((equipment) => equipment.index === materialIndex);
                const title = String(entry?.label || (fallbackLabel ? formatEquipmentLabel(fallbackLabel) : `Matériel ${materialIndex + 1}`)).trim();
                const details = [
                    String(entry?.articleCode || "").trim() ? `Code article: ${String(entry.articleCode).trim()}` : "",
                    String(entry?.warrantyLabel || "").trim() ? `Garantie: ${String(entry.warrantyLabel).trim()}` : "",
                    String(entry?.invoiceDate || "").trim() ? `Facture: ${formatDepotDate(entry.invoiceDate)}` : "",
                    String(entry?.shippingDate || "").trim() ? `Expédition: ${formatDepotDate(entry.shippingDate)}` : ""
                ].filter(Boolean);

                if (details.length === 0) return null;

                const dedupeKey = [title.toLowerCase(), ...details.map((detail) => detail.toLowerCase())].join("|");
                if (seen.has(dedupeKey)) return null;
                seen.add(dedupeKey);

                return { title, details: details.join(" · ") };
            })
            .filter(Boolean) as Array<{ title: string; details: string }>;

        if (String(storeReview?.note || "").trim()) {
            normalizedEntries.push({
                title: "Note DP",
                details: String(storeReview.note).trim()
            });
        }

        return normalizedEntries;
    }

    const fallbackDetails = [
        String(merchandiseInfo?.articleCode || "").trim() ? `Code article: ${String(merchandiseInfo.articleCode).trim()}` : "",
        String(merchandiseInfo?.warrantyLabel || "").trim() ? `Garantie: ${String(merchandiseInfo.warrantyLabel).trim()}` : "",
        String(merchandiseInfo?.invoiceDate || "").trim() ? `Facture: ${formatDepotDate(merchandiseInfo.invoiceDate)}` : "",
        String(merchandiseInfo?.shippingDate || "").trim() ? `Expédition: ${formatDepotDate(merchandiseInfo.shippingDate)}` : "",
        String(storeReview?.note || "").trim() ? `Note: ${String(storeReview.note).trim()}` : ""
    ].filter(Boolean);

    if (fallbackDetails.length === 0) return [];

    return [{
        title: "Infos DP",
        details: fallbackDetails.join(" · ")
    }];
}

function getWarrantyLimitDates(item: ReclamationItem) {
    const checklist = parseChecklistPayload(item.checklist);
    const metadata = (checklist?.metadata || {}) as any;
    const merchandiseInfo = metadata?.merchandiseInfo || {};
    const rows = Array.isArray(merchandiseInfo?.equipmentMerchandiseItems)
        ? merchandiseInfo.equipmentMerchandiseItems
        : [];
    const supplierLimitDate =
        rows.map((entry: any) => String(entry?.warrantyLimitDate || "").trim()).find(Boolean)
        || String(merchandiseInfo?.warrantyLimitDate || "").trim();
    const topMedicalLimitDate = String(merchandiseInfo?.topMedicalWarrantyLimitDate || "").trim();

    return {
        topMedicalLimitDate,
        supplierLimitDate
    };
}

function splitDetails(value: string | undefined) {
    return String(value || "")
        .split(" · ")
        .map((part) => part.trim())
        .filter(Boolean);
}

function renderDetailLine(detail: string, key: string) {
    const [label, ...rest] = detail.split(":");
    const value = rest.join(":").trim();
    if (!value) {
        return <div key={key} className={styles.helper}>{detail}</div>;
    }

    return (
        <div key={key} className={styles.helper} style={{ lineHeight: 1.35 }}>
            <strong style={{ color: "#334155" }}>{label.trim()} :</strong> {value}
        </div>
    );
}

function renderInfoRows(rows: Array<{ label: string; value: string }>) {
    return (
        <div style={{ display: "grid", gap: "0.25rem" }}>
            {rows.map((row) => (
                <div key={row.label} style={{ display: "grid", gap: "0.05rem" }}>
                    <span style={{ color: "#64748b", fontSize: "0.72rem", fontWeight: 700 }}>{row.label}</span>
                    <span style={{ color: "#111827", fontWeight: 700, lineHeight: 1.3 }}>{row.value || "-"}</span>
                </div>
            ))}
        </div>
    );
}

function renderCustomerInfo(item: ReclamationItem) {
    return renderInfoRows([
        { label: "Nom", value: item.customerName || "-" },
        { label: "E-mail", value: item.contactEmail || "Non renseigné" },
        { label: "Téléphone", value: item.phone || "Non renseigné" }
    ]);
}

function renderEquipmentInfo(equipmentItems: ReturnType<typeof getTicketEquipmentItems>, item: ReclamationItem) {
    return (
        <div style={{ display: "grid", gap: "0.45rem" }}>
            {equipmentItems.map((equipment) => {
                const meta = formatEquipmentMeta(equipment);
                return (
                    <div
                        key={`closed-ticket-equipment-${item.ticket?.id || item.id}-${equipment.index}`}
                        style={{
                            display: "grid",
                            gap: "0.16rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            background: "#ffffff",
                            padding: "0.45rem"
                        }}
                    >
                        <div style={{ fontWeight: 800, color: "#111827", lineHeight: 1.25 }}>{formatEquipmentLabel(equipment)}</div>
                        {meta ? <div className={styles.helper} style={{ lineHeight: 1.35 }}>{meta}</div> : null}
                    </div>
                );
            })}
        </div>
    );
}

function renderCompactPartsList(items: SummaryEntry[], emptyLabel: string) {
    if (items.length === 0) {
        return <div className={styles.helper}>{emptyLabel}</div>;
    }

    return (
        <div style={{ display: "grid", gap: "0.45rem" }}>
            {items.map((entry, index) => {
                const details = splitDetails(entry.meta || entry.details);
                return (
                    <div
                        key={`${entry.title}-${index}`}
                        style={{
                            display: "grid",
                            gap: "0.16rem",
                            border: "1px solid #e5e7eb",
                            borderRadius: "8px",
                            background: "#ffffff",
                            padding: "0.45rem"
                        }}
                    >
                        <div style={{ fontWeight: 800, color: "#111827", lineHeight: 1.25 }}>{entry.title}</div>
                        {details.map((detail, detailIndex) => renderDetailLine(detail, `${entry.title}-${index}-${detailIndex}`))}
                    </div>
                );
            })}
        </div>
    );
}

function renderUsedPartsList(items: SummaryEntry[], emptyLabel: string) {
    if (items.length === 0) {
        return <div className={styles.helper}>{emptyLabel}</div>;
    }

    return (
        <div style={{ display: "grid", gap: "0.3rem" }}>
            {items.map((entry, index) => {
                const details = String(entry.meta || entry.details || "")
                    .split(" · ")
                    .map((part) => part.trim())
                    .filter(Boolean);

                return (
                    <div
                        key={`${entry.title}-${index}`}
                        style={{
                            display: "grid",
                            gap: "0.12rem",
                            padding: "0.32rem 0.4rem",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc"
                        }}
                    >
                        <div style={{ fontWeight: 700, lineHeight: 1.25 }}>{entry.title}</div>
                        {details.length > 0 ? (
                            <div style={{ display: "grid", gap: "0.06rem" }}>
                                {details.map((detail, detailIndex) => renderDetailLine(detail, `${entry.title}-${index}-detail-${detailIndex}`))}
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

function renderSatisfactionInfo(satisfaction: ReturnType<typeof parseSatisfactionFeedback>) {
    if (!satisfaction.recorded) {
        return <div className={styles.helper}>Aucune réponse client enregistrée.</div>;
    }

    return renderInfoRows([
        { label: "Note", value: satisfaction.note },
        { label: "Recommandation", value: satisfaction.recommendation },
        { label: "Commentaire", value: satisfaction.comment }
    ]);
}

function getTicketNumericId(item: ReclamationItem) {
    return Number(item.ticket?.id || item.id || 0);
}

export default function ClosedTicketsTable({
    loadingLabel = "Chargement des tickets traités...",
    emptyLabel = "Aucun ticket traité pour le moment."
}: ClosedTicketsTableProps) {
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ReclamationItem[]>([]);
    const [importOrdersByTicketId, setImportOrdersByTicketId] = useState<Record<number, ImportOrder[]>>({});
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [reclamationsResponse, importResponse] = await Promise.all([
                    fetch("/api/reclamations?light=1&historyLimit=40&skipSanitize=1", { cache: "no-store" }),
                    fetch("/api/import/overview", { cache: "no-store" })
                ]);
                const data = await reclamationsResponse.json().catch(() => []);
                const importData = await importResponse.json().catch(() => ({}));
                const list = Array.isArray(data) ? data : [];
                const allImportOrders = [
                    ...(Array.isArray(importData?.pendingOrders) ? importData.pendingOrders : []),
                    ...(Array.isArray(importData?.alertOrders) ? importData.alertOrders : []),
                    ...(Array.isArray(importData?.historyOrders) ? importData.historyOrders : [])
                ] as ImportOrder[];
                const groupedImports = allImportOrders.reduce<Record<number, ImportOrder[]>>((accumulator, order) => {
                    const ticketId = Number(order?.ticket?.id || 0);
                    if (!ticketId) return accumulator;
                    accumulator[ticketId] = accumulator[ticketId] || [];
                    if (!accumulator[ticketId].some((entry) => entry.id === order.id)) {
                        accumulator[ticketId].push(order);
                    }
                    return accumulator;
                }, {});

                setImportOrdersByTicketId(groupedImports);
                setItems(
                    list
                        .filter((item: ReclamationItem) => item.ticket?.id && getAdministrativeClosureAt(item.ticket?.savHistory || []))
                );
            } catch (error) {
                console.error("Closed tickets load error:", error);
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        const ordered = [...items].sort((a, b) => getTicketNumericId(a) - getTicketNumericId(b));
        if (!query) return ordered;

        return ordered.filter((item) => {
            const ticketDisplayId = item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id;
            const importParts = buildImportPartsSummary(importOrdersByTicketId[Number(item.ticket?.id || 0)] || []);
            const usedParts = buildUsedPartsSummary(item.checklist);
            const depotInfo = buildDepotInfoSummary(item);
            const equipmentItems = getTicketEquipmentItems({
                checklist: item.checklist,
                deviceModel: item.deviceModel,
                serialNumber: item.serialNumber,
                description: item.description
            });
            const searchable = [
                ticketDisplayId,
                getTicketCreatorLabel(item),
                getSageQuoteNumber(item),
                item.customerName,
                item.contactEmail,
                item.phone,
                item.deviceModel,
                item.serialNumber,
                item.description,
                getRepairAmountSummary(item.checklist),
                ...equipmentItems.flatMap((equipment) => [formatEquipmentLabel(equipment), formatEquipmentMeta(equipment)]),
                ...depotInfo.flatMap((entry) => [entry.title, entry.details]),
                ...importParts.flatMap((entry) => [entry.title, entry.meta, entry.details]),
                ...usedParts.flatMap((entry: SummaryEntry) => [entry.title, entry.meta, entry.details])
            ].join(" ").toLowerCase();

            return searchable.includes(query);
        });
    }, [importOrdersByTicketId, items, searchTerm]);

    if (loading) {
        return <div className={styles.empty}>{loadingLabel}</div>;
    }

    return (
        <section className={styles.shell}>
            <article className={styles.sectionCard}>
                {items.length === 0 ? (
                    <div className={styles.empty}>{emptyLabel}</div>
                ) : (
                    <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: "0.9rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                        <div>
                            <h2 className={styles.sectionTitle} style={{ marginBottom: "0.2rem" }}>Tickets traités</h2>
                            <div className={styles.helper}>{filteredItems.length} ticket{filteredItems.length > 1 ? "s" : ""} affiché{filteredItems.length > 1 ? "s" : ""}.</div>
                        </div>
                        <div style={{ display: "grid", gap: "0.25rem", minWidth: "min(100%, 460px)" }}>
                            <label className={styles.label}>Recherche</label>
                            <input
                                className={styles.input}
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Rechercher par ticket, auteur, client, SN, matériel..."
                            />
                        </div>
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={`${styles.table} ${styles.closedTicketsTable}`}>
                            <colgroup>
                                <col style={{ width: "7%" }} />
                                <col style={{ width: "7%" }} />
                                <col style={{ width: "7%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "10%" }} />
                                <col style={{ width: "11%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "8%" }} />
                                <col style={{ width: "9%" }} />
                                <col style={{ width: "7%" }} />
                                <col style={{ width: "12%" }} />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>N° ticket</th>
                                    <th>Créé par</th>
                                    <th>N° devis Sage</th>
                                    <th>Date et heure de création</th>
                                    <th>Date et heure de traitement</th>
                                    <th>Client</th>
                                    <th>Matériel à réparer</th>
                                    <th>Date limite garantie Top Medical</th>
                                    <th>Date limite garantie fournisseur</th>
                                    <th>Pièces importées</th>
                                    <th>Pièces de rechange utilisées</th>
                                    <th>Montant réparation</th>
                                    <th>Enquête de satisfaction</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.map((item, index) => {
                                    const satisfaction = parseSatisfactionFeedback(item);
                                    const ticketDisplayId = item.ticket?.ticketReference || item.ticket?.displayId || index + 1;
                                    const sageQuoteNumber = getSageQuoteNumber(item);
                                    const importParts = buildImportPartsSummary(importOrdersByTicketId[Number(item.ticket?.id || 0)] || []);
                                    const usedParts = buildUsedPartsSummary(item.checklist);
                                    const warrantyLimitDates = getWarrantyLimitDates(item);
                                    const repairAmount = getRepairAmountSummary(item.checklist);
                                    const creatorLabel = getTicketCreatorLabel(item);
                                    const equipmentItems = getTicketEquipmentItems({
                                        checklist: item.checklist,
                                        deviceModel: item.deviceModel,
                                        serialNumber: item.serialNumber,
                                        description: item.description
                                    });

                                    return (
                                        <tr key={`closed-ticket-${item.ticket?.id || item.id}`}>
                                            <td>
                                                <div style={{ color: "#b00020", fontWeight: 900, lineHeight: 1.25 }}>{ticketDisplayId}</div>
                                                {item.ticket?.assignedTo?.name ? (
                                                    <div style={{ marginTop: "0.35rem", display: "grid", gap: "0.05rem" }}>
                                                        <span style={{ color: "#64748b", fontSize: "0.72rem", fontWeight: 700 }}>Technicien</span>
                                                        <span style={{ color: "#334155", fontWeight: 700, lineHeight: 1.25 }}>{item.ticket.assignedTo.name}</span>
                                                    </div>
                                                ) : null}
                                            </td>
                                            <td>
                                                <span
                                                    style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        border: "1px solid #fecaca",
                                                        borderRadius: 999,
                                                        background: "#fff1f2",
                                                        color: "#b00020",
                                                        fontWeight: 800,
                                                        padding: "0.28rem 0.55rem"
                                                    }}
                                                >
                                                    {creatorLabel}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 700 }}>{sageQuoteNumber}</span>
                                            </td>
                                            <td>{renderInfoRows([{ label: "Création", value: formatDateTime(item.ticket?.createdAt || item.createdAt) }])}</td>
                                            <td>{renderInfoRows([{ label: "Traitement", value: formatDateTime(getAdministrativeClosureAt(item.ticket?.savHistory || [])) }])}</td>
                                            <td>{renderCustomerInfo(item)}</td>
                                            <td>{renderEquipmentInfo(equipmentItems, item)}</td>
                                            <td>{renderInfoRows([{ label: "Top Medical", value: formatDepotDate(warrantyLimitDates.topMedicalLimitDate) || "-" }])}</td>
                                            <td>{renderInfoRows([{ label: "Fournisseur", value: formatDepotDate(warrantyLimitDates.supplierLimitDate) || "-" }])}</td>
                                            <td>{renderCompactPartsList(importParts, "Aucune pièce importée.")}</td>
                                            <td>{renderUsedPartsList(usedParts, "Aucune pièce utilisée.")}</td>
                                            <td>
                                                <span
                                                    style={{
                                                        display: "inline-flex",
                                                        border: "1px solid #e5e7eb",
                                                        borderRadius: "8px",
                                                        background: "#ffffff",
                                                        color: "#111827",
                                                        fontWeight: 900,
                                                        padding: "0.45rem 0.55rem",
                                                        lineHeight: 1.2
                                                    }}
                                                >
                                                    {repairAmount}
                                                </span>
                                            </td>
                                            <td>{renderSatisfactionInfo(satisfaction)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    </>
                )}
            </article>
        </section>
    );
}

