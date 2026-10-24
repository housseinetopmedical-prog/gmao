import { parseChecklistPayload } from "@/metier/workflow-client";

export type TicketEquipmentItem = {
    index: number;
    designation: string;
    serialNumber: string;
    pn: string;
    articleCode: string;
    quantity: number;
};

function normalizeText(value: unknown) {
    const text = String(value || "").trim();
    const lowered = text.toLowerCase();
    if (!text || lowered === "unknown" || lowered === "non renseigne" || lowered === "non renseigné") {
        return "";
    }
    return text;
}

function normalizeComparableText(value: unknown) {
    return normalizeText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function normalizeQuantity(value: unknown, fallback: unknown = 1) {
    const parsed = Number(value || fallback || 1);
    if (!Number.isFinite(parsed) || parsed <= 0) return 1;
    return Math.max(1, Math.trunc(parsed));
}

function normalizeEquipmentItems(value: unknown) {
    if (!Array.isArray(value)) return [] as TicketEquipmentItem[];

    return value
        .map((item, index) => ({
            index,
            designation: normalizeText((item as any)?.designation),
            serialNumber: normalizeText((item as any)?.serialNumber),
            pn: normalizeText((item as any)?.pn),
            articleCode: normalizeText((item as any)?.articleCode),
            quantity: normalizeQuantity((item as any)?.quantity, 1)
        }))
        .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

function parseEquipmentItemsFromDescription(description: unknown) {
    const lines = String(description || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const equipmentMap = new Map<number, TicketEquipmentItem>();

    const getItem = (index: number) => {
        const existing = equipmentMap.get(index);
        if (existing) return existing;

        const created: TicketEquipmentItem = {
            index,
            designation: "",
            serialNumber: "",
            pn: "",
            articleCode: "",
            quantity: 1
        };
        equipmentMap.set(index, created);
        return created;
    };

    lines.forEach((line) => {
        const separatorIndex = line.indexOf(":");
        if (separatorIndex < 0) return;

        const rawLabel = normalizeComparableText(line.slice(0, separatorIndex));
        const rawValue = normalizeText(line.slice(separatorIndex + 1));
        if (!rawValue) return;

        const materialMatch = rawLabel.match(/^materiel (\d+)$/);
        if (materialMatch) {
            getItem(Math.max(0, Number(materialMatch[1]) - 1)).designation = rawValue;
            return;
        }

        const serialMatch = rawLabel.match(/^sn materiel (\d+)$/);
        if (serialMatch) {
            getItem(Math.max(0, Number(serialMatch[1]) - 1)).serialNumber = rawValue;
            return;
        }

        const pnMatch = rawLabel.match(/^pn materiel (\d+)$/);
        if (pnMatch) {
            getItem(Math.max(0, Number(pnMatch[1]) - 1)).pn = rawValue;
            return;
        }

        const quantityMatch = rawLabel.match(/^quantite materiel (\d+)$/);
        if (quantityMatch) {
            getItem(Math.max(0, Number(quantityMatch[1]) - 1)).quantity = normalizeQuantity(rawValue, 1);
            return;
        }

        const articleCodeMatch = rawLabel.match(/^code article materiel (\d+)$/);
        if (articleCodeMatch) {
            getItem(Math.max(0, Number(articleCodeMatch[1]) - 1)).articleCode = rawValue;
        }
    });

    return Array.from(equipmentMap.values())
        .sort((left, right) => left.index - right.index)
        .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

function mergeEquipmentSources(primary: TicketEquipmentItem[], fallback: TicketEquipmentItem[]) {
    const mergedLength = Math.max(primary.length, fallback.length);

    return Array.from({ length: mergedLength }, (_, index) => {
        const primaryItem = primary[index];
        const fallbackItem = fallback[index];

        return {
            index,
            designation: primaryItem?.designation || fallbackItem?.designation || "",
            serialNumber: primaryItem?.serialNumber || fallbackItem?.serialNumber || "",
            pn: primaryItem?.pn || fallbackItem?.pn || "",
            articleCode: primaryItem?.articleCode || fallbackItem?.articleCode || "",
            quantity: normalizeQuantity(primaryItem?.quantity, fallbackItem?.quantity || 1)
        } satisfies TicketEquipmentItem;
    }).filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

export function getTicketEquipmentItems(options: {
    checklist?: unknown;
    deviceModel?: unknown;
    serialNumber?: unknown;
    pn?: unknown;
    equipmentName?: unknown;
    description?: unknown;
}) {
    const metadata = parseChecklistPayload(options.checklist).metadata || {};
    const entryRepairSlip = metadata.entryRepairSlip || {};
    const equipmentItems = mergeEquipmentSources(
        normalizeEquipmentItems(entryRepairSlip.equipmentItems),
        parseEquipmentItemsFromDescription(options.description)
    );

    if (equipmentItems.length > 0) {
        return equipmentItems;
    }

    const fallbackDesignation = normalizeText(options.equipmentName)
        || normalizeText(entryRepairSlip.designation)
        || normalizeText(metadata.equipmentName)
        || normalizeText(options.deviceModel);
    const fallbackSerialNumber = normalizeText(entryRepairSlip.serialNumber) || normalizeText(options.serialNumber);
    const fallbackPn = normalizeText(entryRepairSlip.pn) || normalizeText(metadata.pn) || normalizeText(options.pn);

    if (!fallbackDesignation && !fallbackSerialNumber && !fallbackPn) {
        return [] as TicketEquipmentItem[];
    }

    return [{
        index: 0,
        designation: fallbackDesignation,
        serialNumber: fallbackSerialNumber,
        pn: fallbackPn,
        articleCode: "",
        quantity: 1
    }];
}

export function formatEquipmentLabel(item: TicketEquipmentItem) {
    const quantityLabel = item.quantity > 1 ? ` x${item.quantity}` : "";
    return `${item.designation || `Materiel ${item.index + 1}`}${quantityLabel}`;
}

export function formatEquipmentMeta(item: TicketEquipmentItem) {
    const serialNumber = item.serialNumber.replace(/^SN\s*:?\s*/i, "").trim();
    const pn = item.pn.replace(/^PN\s*:?\s*/i, "").trim();

    return [
        serialNumber ? `SN : ${serialNumber}` : "",
        pn ? `PN : ${pn}` : ""
    ].filter(Boolean).join(" - ");
}

export function formatEquipmentSummary(item: TicketEquipmentItem) {
    const label = formatEquipmentLabel(item);
    const meta = formatEquipmentMeta(item);
    return meta ? `${label} - ${meta}` : label;
}

export function sanitizeDisplayValue(value: unknown) {
    return normalizeText(value);
}

