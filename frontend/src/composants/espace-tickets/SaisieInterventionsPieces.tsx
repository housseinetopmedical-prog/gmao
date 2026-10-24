"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getStatusLabel } from "@/metier/workflow-technicien";
import { formatImportReference } from "@/metier/workflow-import";
import {
    formatEquipmentLabel,
    formatEquipmentMeta,
    getTicketEquipmentItems,
    type TicketEquipmentItem
} from "@/metier/materiel-ticket";

type ViewerRole = "RESPONSABLE_TECHNIQUE" | "TECHNICIAN" | "ADMIN";

type TicketSummary = {
    id: number;
    title: string;
    status: string;
    reclamation?: {
        checklist?: string | null;
        customerName?: string | null;
    } | null;
    equipment?: {
        name?: string | null;
        client?: string | null;
        serialNumber?: string | null;
        brand?: string | null;
        model?: string | null;
    } | null;
};

type TicketDetail = TicketSummary & {
    reclamation?: {
        id?: number;
        checklist?: string | null;
        customerName?: string | null;
        contactEmail?: string | null;
        description?: string | null;
        serialNumber?: string | null;
        deviceModel?: string | null;
    } | null;
    savHistory?: Array<{
        action?: string | null;
        note?: string | null;
        createdAt?: string | null;
    }> | null;
};

function getTicketClientDisplayName(ticket: TicketSummary | TicketDetail) {
    const metadata = parseChecklistPayload(ticket?.reclamation?.checklist).metadata || {};
    const firstName = String((metadata as any)?.firstName || "").trim();
    const lastName = String((metadata as any)?.lastName || "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || ticket.reclamation?.customerName || ticket.equipment?.client || "-";
}

const ACTIVE_STATUSES = ["DIAGNOSTIC", "PENDING_PARTS", "REPAIR", "TAKEN_IN_CHARGE", "QUOTE_APPROVED"];
const EXPORT_CURRENCIES = ["", "USD", "EUR"] as const;
const NATURE_OPTIONS = [
    { value: "USED_PART", label: "Pièce de rechange à utiliser" },
    { value: "PART_REQUEST", label: "Pièce de rechange à importer" },
    { value: "LOCAL_PART_REQUEST", label: "Achat local de pièce détachée" },
    { value: "SOFTWARE_UPDATE", label: "MAJ logiciel" },
    { value: "PART_TO_MANUFACTURE", label: "Pièce à fabriquer" },
    { value: "LABOR", label: "Main d'oeuvre" }
] as const;

type EntryNature = (typeof NATURE_OPTIONS)[number]["value"] | "REPAIR" | "SOFTWARE_INSTALLATION";

type UnifiedEntryRow = {
    id: string;
    equipmentIndex: number;
    equipmentLabel: string;
    equipmentMeta: string;
    articleCode: string;
    nature: EntryNature;
    designation: string;
    quantity: string;
    laborHours: string;
    supplierCode: string;
    sageCode: string;
    costPrice: string;
    purchasePrice: string;
    purchaseCurrency: "" | "USD" | "EUR";
    exportPrice: string;
    exportCurrency: "" | "USD" | "EUR";
    salePriceTtc: string;
    importRequestRef: string;
    importSentAt: string;
};

type EntryTextField = Exclude<keyof UnifiedEntryRow, "id" | "equipmentIndex" | "equipmentLabel" | "equipmentMeta" | "articleCode" | "nature" | "purchaseCurrency" | "exportCurrency">;

const ENTRY_TEXT_FIELDS: Array<{ key: EntryTextField; label: string; type?: "date" }> = [
    { key: "designation", label: "Description de la prestation" },
    { key: "quantity", label: "Quantité" },
    { key: "laborHours", label: "Heures de travail" },
    { key: "supplierCode", label: "Code fournisseur" },
    { key: "sageCode", label: "Code Sage" },
    { key: "exportPrice", label: "Export price" }
];

const ENTRY_DISPLAY_FIELDS: Array<{ key: keyof UnifiedEntryRow; label: string }> = [
    ...ENTRY_TEXT_FIELDS,
    { key: "exportCurrency", label: "Devise export" },
    { key: "importRequestRef", label: "Référence import" }
];

function formatDateTimeValue(value: string | null | undefined) {
    const raw = String(value || "").trim();
    if (!raw) return "-";
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("fr-FR");
}

function parseHistoryJson(note: string | null | undefined) {
    const raw = String(note || "").trim();
    if (!raw.startsWith("{")) return null as Record<string, unknown> | null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
    } catch {
        return null;
    }
}

function resolveReceptionDate(entry: UnifiedEntryRow, history: TicketDetail["savHistory"]) {
    if (entry.nature !== "PART_REQUEST" || !entry.importRequestRef) return "";
    const rows = Array.isArray(history) ? history : [];
    const match = rows.find((item) => {
        if (String(item?.action || "") !== "IMPORT_REQUEST_RECEIVED") return false;
        const payload = parseHistoryJson(item?.note);
        return String(payload?.purchaseOrderRef || "").trim() === entry.importRequestRef;
    });
    if (!match) return "";
    const payload = parseHistoryJson(match.note);
    return String(payload?.receivedDate || match.createdAt || "").trim();
}

function getLocalUser() {
    try {
        const raw = localStorage.getItem("user");
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            id: Number(parsed?.id || 0) || null,
            role: String(parsed?.role || "").trim().toUpperCase()
        };
    } catch {
        return { id: null, role: "" };
    }
}

function buildEquipmentChoice(equipment: TicketEquipmentItem | null) {
    return {
        equipmentIndex: equipment?.index ?? 0,
        equipmentLabel: equipment ? formatEquipmentLabel(equipment) : "",
        equipmentMeta: equipment ? formatEquipmentMeta(equipment) : "",
        articleCode: equipment?.articleCode || ""
    };
}

function createEmptyEntry(equipment: TicketEquipmentItem | null): UnifiedEntryRow {
    return {
        id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...buildEquipmentChoice(equipment),
        nature: "USED_PART",
        designation: "",
        quantity: "",
        laborHours: "",
        supplierCode: "",
        sageCode: "",
        costPrice: "",
        purchasePrice: "",
        purchaseCurrency: "",
        exportPrice: "",
        exportCurrency: "",
        salePriceTtc: "",
        importRequestRef: "",
        importSentAt: ""
    };
}

function normalizeInteger(value: string) {
    const raw = String(value || "").replace(/[^0-9]/g, "");
    return raw;
}

function normalizeDecimal(value: string) {
    const cleaned = String(value || "").replace(",", ".").replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length <= 1) return cleaned;
    return `${parts[0]}.${parts.slice(1).join("")}`;
}

function toOptionalNumber(value: string) {
    const raw = String(value || "").trim().replace(",", ".");
    if (!raw) return null;
    const amount = Number(raw);
    return Number.isFinite(amount) ? amount : null;
}

function hasUsefulEntry(entry: UnifiedEntryRow) {
    return [
        entry.designation,
        entry.quantity,
        entry.laborHours,
        entry.supplierCode,
        entry.sageCode,
        entry.costPrice,
        entry.purchasePrice,
        entry.exportPrice,
        entry.salePriceTtc,
        entry.importRequestRef
    ].some((value) => String(value || "").trim().length > 0);
}

function getFilledEntryFields(entry: UnifiedEntryRow) {
    return ENTRY_DISPLAY_FIELDS
        .map((field) => {
            const rawValue = entry[field.key];
            const value = field.key === "importSentAt"
                ? formatDateTimeValue(String(rawValue || ""))
                : field.key === "importRequestRef"
                    ? formatImportReference(String(rawValue || ""))
                    : String(rawValue || "").trim();
            return { ...field, value };
        })
        .filter((field) => field.value && field.value !== "-");
}

function buildNatureLabel(nature: string) {
    return NATURE_OPTIONS.find((option) => option.value === nature)?.label || nature;
}

function isRequestNature(nature: EntryNature) {
    return nature === "PART_REQUEST" || nature === "LOCAL_PART_REQUEST";
}

function normalizeTableNature(raw: unknown): EntryNature {
    const value = String(raw || "").trim();
    if (value === "SUPPLIER_RETURN_WAIT" || value === "DP_PART_RETURN") {
        return "REPAIR";
    }
    return (NATURE_OPTIONS.some((option) => option.value === value) ? value : "USED_PART") as EntryNature;
}

function createEntryFromLegacyItem(
    equipment: TicketEquipmentItem | null,
    nature: EntryNature,
    designation: string,
    extras?: Partial<UnifiedEntryRow>
) {
    const base = createEmptyEntry(equipment);
    return {
        ...base,
        nature,
        designation,
        supplierCode: extras?.supplierCode || "",
        sageCode: extras?.sageCode || "",
        costPrice: extras?.costPrice || "",
                purchasePrice: extras?.purchasePrice || "",
                purchaseCurrency: extras?.purchaseCurrency || "",
                exportPrice: extras?.exportPrice || "",
                exportCurrency: extras?.exportCurrency || "",
                salePriceTtc: extras?.salePriceTtc || "",
        quantity: extras?.quantity || "",
        laborHours: extras?.laborHours || "",
        importRequestRef: extras?.importRequestRef || "",
        importSentAt: extras?.importSentAt || ""
    } satisfies UnifiedEntryRow;
}

function toUnifiedEntryList(raw: unknown, equipmentItems: TicketEquipmentItem[]) {
    if (!Array.isArray(raw)) return [] as UnifiedEntryRow[];

    return raw.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [] as UnifiedEntryRow[];
        const row = item as Record<string, unknown>;
        const equipmentIndex = Number(row.equipmentIndex || 0) || 0;
        const equipment = equipmentItems.find((candidate) => candidate.index === equipmentIndex) || equipmentItems[0] || null;
        const hasUnifiedShape = [
            row.nature,
            row.designation,
            row.quantity,
            row.laborHours,
            row.supplierCode,
            row.sageCode,
            row.articleCode,
            row.costPrice,
            row.purchasePrice,
            row.exportPrice,
            row.salePriceTtc
        ].some((value) => value !== undefined && value !== null && String(value).trim() !== "");

        if (hasUnifiedShape) {
            const base = createEmptyEntry(equipment);
            const purchaseCurrency = String(row.purchaseCurrency || "").trim().toUpperCase();
            const exportCurrency = String(row.exportCurrency || "").trim().toUpperCase();
            return [{
                ...base,
                id: String(row.id || `entry-${index}`),
                nature: normalizeTableNature(row.nature),
                designation: String(row.designation || "").trim(),
                quantity: row.quantity === null || row.quantity === undefined ? "" : String(row.quantity).trim(),
                laborHours: row.laborHours === null || row.laborHours === undefined ? "" : String(row.laborHours).trim(),
                supplierCode: String(row.supplierCode || row.supplierReference || "").trim(),
                sageCode: String(row.sageCode || row.sageReference || "").trim(),
                articleCode: String(row.articleCode || "").trim() || base.articleCode,
                costPrice: row.costPrice === null || row.costPrice === undefined ? (row.purchasedComponentsPrice === null || row.purchasedComponentsPrice === undefined ? "" : String(row.purchasedComponentsPrice).trim()) : String(row.costPrice).trim(),
                purchasePrice: row.purchasePrice === null || row.purchasePrice === undefined ? "" : String(row.purchasePrice).trim(),
                purchaseCurrency: purchaseCurrency === "USD" || purchaseCurrency === "EUR" ? purchaseCurrency : "",
                exportPrice: row.exportPrice === null || row.exportPrice === undefined ? "" : String(row.exportPrice).trim(),
                exportCurrency: exportCurrency === "USD" || exportCurrency === "EUR" ? exportCurrency : "",
                salePriceTtc: row.salePriceTtc === null || row.salePriceTtc === undefined ? "" : String(row.salePriceTtc).trim(),
                importRequestRef: String(row.importRequestRef || "").trim(),
                importSentAt: String(row.importSentAt || "").trim()
            } satisfies UnifiedEntryRow].filter(hasUsefulEntry);
        }

        const entries: UnifiedEntryRow[] = [];
        if (String(row.partsToReplace || "").trim()) {
            entries.push(createEntryFromLegacyItem(equipment, "USED_PART", String(row.partsToReplace).trim(), {
                supplierCode: String(row.supplierReference || "").trim(),
                sageCode: String(row.sageReference || "").trim(),
                costPrice: row.purchasedComponentsPrice === null || row.purchasedComponentsPrice === undefined ? "" : String(row.purchasedComponentsPrice).trim()
            }));
        }
        if (String(row.partsToRepair || "").trim()) {
            entries.push(createEntryFromLegacyItem(equipment, "REPAIR", String(row.partsToRepair).trim(), {
                supplierCode: String(row.supplierReference || "").trim(),
                sageCode: String(row.sageReference || "").trim()
            }));
        }
        if (String(row.partsToFabricate || "").trim()) {
            entries.push(createEntryFromLegacyItem(equipment, "PART_TO_MANUFACTURE", String(row.partsToFabricate).trim(), {
                supplierCode: String(row.supplierReference || "").trim(),
                sageCode: String(row.sageReference || "").trim()
            }));
        }
        if (String(row.softwareUpdate || "").trim()) {
            entries.push(createEntryFromLegacyItem(equipment, "SOFTWARE_UPDATE", String(row.softwareUpdate).trim()));
        }
        if (String(row.softwareInstallation || "").trim()) {
            entries.push(createEntryFromLegacyItem(equipment, "SOFTWARE_INSTALLATION", String(row.softwareInstallation).trim()));
        }

        return entries.filter(hasUsefulEntry);
    });
}

function legacyUsedPartsToUnifiedEntries(raw: unknown, equipmentItems: TicketEquipmentItem[]) {
    if (!Array.isArray(raw)) return [] as UnifiedEntryRow[];

    return raw
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => {
            const equipmentIndex = Number(item.equipmentIndex || 0) || 0;
            const equipment = equipmentItems.find((candidate) => candidate.index === equipmentIndex) || equipmentItems[0] || null;
            return createEntryFromLegacyItem(equipment, "USED_PART", String(item.name || "").trim(), {
                sageCode: String(item.equipmentPn || "").trim(),
                costPrice: item.price === null || item.price === undefined ? "" : String(item.price).trim()
            });
        })
        .filter(hasUsefulEntry);
}

function serializeEntries(entries: UnifiedEntryRow[]) {
    return entries
        .filter(hasUsefulEntry)
        .map((entry) => {
            const quantity = toOptionalNumber(entry.quantity);
            const laborHours = toOptionalNumber(entry.laborHours);
            const costPrice = toOptionalNumber(entry.costPrice);
            const purchasePrice = toOptionalNumber(entry.purchasePrice);
            const exportPrice = toOptionalNumber(entry.exportPrice);
            const salePriceTtc = toOptionalNumber(entry.salePriceTtc);

            return {
                id: entry.id,
                equipmentIndex: Number(entry.equipmentIndex || 0) || 0,
                equipmentLabel: String(entry.equipmentLabel || "").trim() || undefined,
                equipmentMeta: String(entry.equipmentMeta || "").trim() || undefined,
                articleCode: String(entry.articleCode || "").trim() || undefined,
                nature: entry.nature,
                designation: String(entry.designation || "").trim() || undefined,
                quantity,
                laborHours,
                supplierCode: String(entry.supplierCode || "").trim() || undefined,
                sageCode: String(entry.sageCode || "").trim() || undefined,
                costPrice,
                purchasePrice,
                purchaseCurrency: String(entry.purchaseCurrency || "").trim() || undefined,
                exportPrice,
                exportCurrency: String(entry.exportCurrency || "").trim() || undefined,
                salePriceTtc,
                importRequestRef: String(entry.importRequestRef || "").trim() || undefined,
                importSentAt: String(entry.importSentAt || "").trim() || undefined,
                supplierReference: String(entry.supplierCode || "").trim() || undefined,
                sageReference: String(entry.sageCode || "").trim() || undefined,
                purchasedComponentsPrice: costPrice,
                partsToReplace: entry.nature === "USED_PART" || isRequestNature(entry.nature) ? String(entry.designation || "").trim() || undefined : undefined,
                partsToRepair: entry.nature === "REPAIR" ? String(entry.designation || "").trim() || undefined : undefined,
                partsToFabricate: entry.nature === "PART_TO_MANUFACTURE" ? String(entry.designation || "").trim() || undefined : undefined,
                softwareUpdate: entry.nature === "SOFTWARE_UPDATE" ? String(entry.designation || "").trim() || "Oui" : undefined,
                softwareInstallation: entry.nature === "SOFTWARE_INSTALLATION" ? String(entry.designation || "").trim() || "Oui" : undefined
            };
        });
}

async function dispatchPartRequests(params: {
    entries: UnifiedEntryRow[];
    equipmentItems: TicketEquipmentItem[];
    userId: number | null;
    ticketId: number;
}) {
    const { entries, equipmentItems, userId, ticketId } = params;
    if (!userId) {
        return { entries, importCreatedCount: 0, localCreatedCount: 0, skippedCount: 0, errorMessages: [] as string[] };
    }

    let importCreatedCount = 0;
    let localCreatedCount = 0;
    let skippedCount = 0;
    const errorMessages: string[] = [];
    const nextEntries = [...entries];

    for (let index = 0; index < nextEntries.length; index += 1) {
        const entry = nextEntries[index];
        if (!isRequestNature(entry.nature) || entry.importSentAt) continue;

        const equipment = equipmentItems.find((candidate) => candidate.index === entry.equipmentIndex) || equipmentItems[0] || null;

        const hasMeaningfulRequest = [entry.designation, entry.supplierCode, entry.sageCode].some((value) => String(value || "").trim().length > 0);
        if (!hasMeaningfulRequest) {
            skippedCount += 1;
            continue;
        }

        if (entry.nature === "LOCAL_PART_REQUEST") {
            nextEntries[index] = {
                ...entry,
                importSentAt: new Date().toISOString()
            };
            localCreatedCount += 1;
            continue;
        }

        const destination = "IMPORT";
        const sourceType = "IMPORT";
        const requestReason = entry.equipmentLabel
            ? `Besoin de ${entry.designation || "la pièce demandée"} pour ${entry.equipmentLabel}.`
            : `Besoin de ${entry.designation || "la pièce demandée"}.`;

        try {
            const response = await fetch("/api/technicien/parts-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    ticketId,
                    reference: entry.sageCode || entry.supplierCode || entry.designation || `LIGNE-${index + 1}`,
                    designation: entry.designation || "Pièce",
                    quantity: Math.max(1, Number(entry.quantity || 0) || 1),
                    urgency: "MEDIUM",
                    justification: requestReason,
                    nature: entry.nature,
                    laborHours: entry.laborHours,
                    supplierCode: entry.supplierCode,
                    articleCode: entry.articleCode || entry.sageCode,
                    costPrice: entry.costPrice,
                    purchasePrice: entry.purchasePrice,
                    purchaseCurrency: entry.purchaseCurrency,
                    exportPrice: entry.exportPrice,
                    exportCurrency: entry.exportCurrency,
                    salePriceTtc: entry.salePriceTtc,
                    equipmentIndex: entry.equipmentIndex,
                    equipmentLabel: entry.equipmentLabel,
                    equipmentSerialNumber: equipment?.serialNumber || "",
                    equipmentPn: equipment?.pn || "",
                    openInternalSubTicket: false,
                    destination,
                    sourceType
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || `Impossible de transmettre la demande ${index + 1} vers l'import.`);
            }

            nextEntries[index] = {
                ...entry,
                importRequestRef: String(data.purchaseOrder?.ref || "").trim(),
                importSentAt: new Date().toISOString()
            };
            importCreatedCount += 1;
        } catch (error) {
            errorMessages.push(error instanceof Error ? error.message : `Erreur de transmission pour la ligne ${index + 1}.`);
        }
    }

    return { entries: nextEntries, importCreatedCount, localCreatedCount, skippedCount, errorMessages };
}

type InterventionEntriesWorkspaceProps = {
    viewerRole: ViewerRole;
    initialTicketId?: number | null;
    hideTicketSelector?: boolean;
    title?: string;
    readOnly?: boolean;
    sendToAdvOnSave?: boolean;
    advEstimatedDuration?: string;
    advQuoteArticleCode?: string;
    onSaved?: () => void | Promise<void>;
};

export default function InterventionEntriesWorkspace({
    viewerRole,
    initialTicketId = null,
    hideTicketSelector = false,
    title,
    readOnly = false,
    sendToAdvOnSave = false,
    advEstimatedDuration = "",
    advQuoteArticleCode = "",
    onSaved
}: InterventionEntriesWorkspaceProps) {
    const searchParams = useSearchParams();
    const ticketIdFromQuery = initialTicketId || Number(searchParams.get("ticketId") || 0) || null;

    const [loading, setLoading] = useState(true);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [tickets, setTickets] = useState<TicketSummary[]>([]);
    const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
    const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
    const [selectedEquipmentIndex, setSelectedEquipmentIndex] = useState(0);
    const [entries, setEntries] = useState<UnifiedEntryRow[]>([]);
    const [deletedImportRefs, setDeletedImportRefs] = useState<string[]>([]);
    const [editingEntries, setEditingEntries] = useState<Record<string, boolean>>({});
    const [userId, setUserId] = useState<number | null>(null);

    const equipmentItems = useMemo(
        () => getTicketEquipmentItems({
            checklist: selectedTicket?.reclamation?.checklist,
            equipmentName: selectedTicket?.equipment?.name,
            deviceModel: selectedTicket?.reclamation?.deviceModel,
            serialNumber: selectedTicket?.equipment?.serialNumber || selectedTicket?.reclamation?.serialNumber,
            description: selectedTicket?.reclamation?.description
        }),
        [selectedTicket]
    );

    const selectedEquipment = useMemo(
        () => equipmentItems.find((item) => item.index === selectedEquipmentIndex) || equipmentItems[0] || null,
        [equipmentItems, selectedEquipmentIndex]
    );

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const user = getLocalUser();
            setUserId(user.id);
            const query = viewerRole === "TECHNICIAN" && user.id
                ? `/api/tickets?assignedToId=${user.id}&summary=1`
                : "/api/tickets?summary=1";
            const response = await fetch(query, { cache: "no-store" });
            const data = await response.json().catch(() => []);
            const list = Array.isArray(data) ? data : [];
            const filtered = list.filter((ticket: TicketSummary) => ACTIVE_STATUSES.includes(String(ticket.status || "").toUpperCase()));
            setTickets(filtered);
            setSelectedTicketId((prev) => {
                if (ticketIdFromQuery && filtered.some((ticket) => ticket.id === ticketIdFromQuery)) return ticketIdFromQuery;
                if (ticketIdFromQuery) return ticketIdFromQuery;
                if (prev && filtered.some((ticket) => ticket.id === prev)) return prev;
                return filtered[0]?.id || null;
            });
        } catch (error) {
            console.error("Intervention entries tickets error:", error);
            setTickets([]);
            setSelectedTicketId(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchTicketDetail = async (ticketId: number) => {
        setLoadingDetail(true);
        try {
            const response = await fetch(`/api/tickets/${ticketId}`, { cache: "no-store" });
            const data = await response.json().catch(() => null);
            setSelectedTicket(data);

            const equipmentRows = getTicketEquipmentItems({
                checklist: data?.reclamation?.checklist,
                equipmentName: data?.equipment?.name,
                deviceModel: data?.reclamation?.deviceModel,
                serialNumber: data?.equipment?.serialNumber || data?.reclamation?.serialNumber,
                description: data?.reclamation?.description
            });
            const metadata = parseChecklistPayload(data?.reclamation?.checklist).metadata || {};
            const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
            const normalizedEntries =
                toUnifiedEntryList(technicalDiagnosis.repairEntries, equipmentRows).length > 0
                    ? toUnifiedEntryList(technicalDiagnosis.repairEntries, equipmentRows)
                    : legacyUsedPartsToUnifiedEntries(technicalDiagnosis.usedParts, equipmentRows);
            setEntries(normalizedEntries);
            setEditingEntries({});
            setDeletedImportRefs([]);
            setFeedback("");
        } catch (error) {
            console.error("Intervention entries detail error:", error);
            setSelectedTicket(null);
            setEntries([]);
        } finally {
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        void fetchTickets();
    }, [viewerRole, ticketIdFromQuery]);

    useEffect(() => {
        if (!selectedTicketId) {
            setSelectedTicket(null);
            setEntries([]);
            return;
        }
        void fetchTicketDetail(selectedTicketId);
    }, [selectedTicketId]);

    useEffect(() => {
        if (equipmentItems.length === 0) {
            setSelectedEquipmentIndex(0);
            return;
        }
        setSelectedEquipmentIndex((prev) => (equipmentItems.some((item) => item.index === prev) ? prev : equipmentItems[0].index));
    }, [equipmentItems]);

    const addEntry = () => {
        const entry = createEmptyEntry(selectedEquipment);
        setEntries((prev) => [...prev, entry]);
        setEditingEntries((prev) => ({ ...prev, [entry.id]: true }));
    };

    const removeEntry = (id: string) => {
        setEntries((prev) => {
            const removedEntry = prev.find((entry) => entry.id === id);
            const importRequestRef = String(removedEntry?.importRequestRef || "").trim();
            if (importRequestRef) {
                setDeletedImportRefs((current) => current.includes(importRequestRef) ? current : [...current, importRequestRef]);
            }
            return prev.filter((entry) => entry.id !== id);
        });
        setEditingEntries((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const updateEntry = (id: string, field: keyof UnifiedEntryRow, value: string) => {
        setEntries((prev) => prev.map((entry) => {
            if (entry.id !== id) return entry;
            if (field === "equipmentIndex") {
                const equipment = equipmentItems.find((item) => item.index === Number(value)) || equipmentItems[0] || null;
                return {
                    ...entry,
                    ...buildEquipmentChoice(equipment)
                };
            }
            if (field === "quantity") {
                return { ...entry, quantity: normalizeInteger(value) };
            }
            if (field === "laborHours" || field === "costPrice" || field === "purchasePrice" || field === "exportPrice" || field === "salePriceTtc") {
                return { ...entry, [field]: normalizeDecimal(value) };
            }
            if (field === "nature") {
                const nextNature = value as EntryNature;
                return {
                    ...entry,
                    nature: nextNature,
                    quantity: nextNature === "LABOR" ? "" : entry.quantity,
                    laborHours: nextNature === "LABOR" ? entry.laborHours : ""
                };
            }
            if (field === "exportCurrency") {
                const currency = EXPORT_CURRENCIES.includes(value as "" | "USD" | "EUR") ? value as "" | "USD" | "EUR" : "";
                return { ...entry, exportCurrency: currency };
            }
            return { ...entry, [field]: value };
        }));
    };

    const saveEntries = async () => {
        if (!selectedTicket?.reclamation?.id || !selectedTicketId || saving) return;

        setSaving(true);
        setFeedback("");
        try {
            const importResult = await dispatchPartRequests({
                entries,
                equipmentItems,
                userId,
                ticketId: selectedTicketId
            });
            const serializedEntries = serializeEntries(importResult.entries);
            const compatibleUsedParts = serializedEntries
                .filter((entry) => entry.nature === "USED_PART" && entry.designation && entry.costPrice !== null)
                .map((entry) => ({
                    name: entry.designation,
                    price: entry.costPrice,
                    equipmentIndex: entry.equipmentIndex,
                    equipmentLabel: entry.equipmentLabel || undefined,
                    equipmentPn: entry.sageCode || undefined
                }));

            const patchResponse = await fetch(`/api/reclamations/${selectedTicket.reclamation.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(sendToAdvOnSave ? { status: "PENDING_ADV_QUOTE", userId } : {}),
                    technicalDiagnosis: {
                        repairEntries: serializedEntries,
                            deletedImportRequestRefs: deletedImportRefs,
                        usedParts: compatibleUsedParts,
                        usedPartsUpdatedAt: new Date().toISOString(),
                        usedPartsUpdatedByUserId: userId,
                        reportedByUserId: userId,
                        ...(sendToAdvOnSave ? {
                            advQuoteReportedAt: new Date().toISOString(),
                            advQuoteReportedByUserId: userId,
                            advQuoteEstimatedDuration: advEstimatedDuration.trim() || null,
                            estimatedDuration: advEstimatedDuration.trim() || null,
                            advQuoteArticleCode: advQuoteArticleCode.trim() || null
                        } : {})
                    }
                })
            });
            const patchData = await patchResponse.json().catch(() => ({}));
            if (!patchResponse.ok) {
                throw new Error(patchData?.error || "Impossible d'enregistrer le tableau.");
            }

            setEntries(importResult.entries);
            setDeletedImportRefs([]);
            setEditingEntries({});

            if (sendToAdvOnSave && selectedTicketId && userId) {
                await fetch(`/api/tickets/${selectedTicketId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId,
                        action: "INTERVENTION_LOG",
                        message: [
                            "Rapport d'intervention et tableau des pièces transmis à l'ADV.",
                            `Estimation du temps d'intervention: ${advEstimatedDuration.trim() || "-"}`
                        ].join("\n")
                    })
                }).catch(() => null);
            }

            await fetchTicketDetail(selectedTicketId);
            await onSaved?.();

            const feedbackParts = [sendToAdvOnSave ? "Tableau enregistré et transmis à l'ADV." : "Tableau enregistré."];
            if (importResult.importCreatedCount > 0) {
                feedbackParts.push(`${importResult.importCreatedCount} demande(s) de pièce transmise(s) à l'import.`);
            }
            if (importResult.localCreatedCount > 0) {
                feedbackParts.push(`${importResult.localCreatedCount} demande(s) de pièce locale enregistrée(s) dans le tableau.`);
            }
            if (importResult.skippedCount > 0) {
                feedbackParts.push(`${importResult.skippedCount} ligne(s) de demande incomplète(s) non transmise(s).`);
            }
            if (importResult.errorMessages.length > 0) {
                feedbackParts.push(importResult.errorMessages.join(" "));
            }
            setFeedback(feedbackParts.join(" "));
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : "Erreur pendant l'enregistrement.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement des tickets...</div>;
    }

    const pageTitle = title || (viewerRole === "ADMIN" ? "Pièces et autres" : "Pièces");

    return (
        <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>{pageTitle}</h2>

            {!selectedTicket ? (
                <div className={styles.empty}>Sélectionnez un ticket pour renseigner le tableau.</div>
            ) : (
                <section style={{ display: "grid", gap: "0.9rem", marginTop: "0.9rem" }}>
                    {!hideTicketSelector ? <article className={styles.sectionCard}>
                        <h3 className={styles.sectionTitle}>Tickets</h3>
                        {tickets.length === 0 ? (
                            <div className={styles.empty}>Aucun ticket actif.</div>
                        ) : (
                            <ul className={styles.list} style={{ display: "grid", gap: "0.55rem" }}>
                                {tickets.map((ticket) => {
                                    const isSelected = selectedTicketId === ticket.id;
                                    return (
                                        <li
                                            key={ticket.id}
                                            className={styles.listItem}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedTicketId(ticket.id)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    setSelectedTicketId(ticket.id);
                                                }
                                            }}
                                            style={{
                                                cursor: "pointer",
                                                borderColor: isSelected ? "var(--primary-blue)" : undefined,
                                                background: isSelected ? "#f8fbff" : undefined,
                                                padding: "0.7rem 0.85rem"
                                            }}
                                        >
                                            <div className={styles.itemMain} style={{ gap: "0.8rem", alignItems: "center" }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                                                    <div className={styles.itemTitle} style={{ margin: 0, whiteSpace: "nowrap" }}>#{(ticket as any).displayId || ticket.id}</div>
                                                    <div className={styles.itemMeta} style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {getTicketClientDisplayName(ticket)}
                                                    </div>
                                                </div>
                                                <span className={styles.statusBadge} style={{ whiteSpace: "nowrap" }}>{getStatusLabel(ticket.status)}</span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </article> : null}

                    <article className={styles.sectionCard}>
                        <div className={styles.listItem} style={{ padding: "0.9rem" }}>
                            {!readOnly ? (
                                <div className={styles.itemMain} style={{ marginBottom: "0.75rem", justifyContent: "flex-end" }}>
                                    <button className="btn btn-outline" type="button" onClick={addEntry}>
                                        <Plus size={14} />
                                        Ajouter une activité
                                    </button>
                                </div>
                            ) : null}

                            <div className={styles.compactRows}>
                                {entries.length === 0 ? (
                                    <div className={styles.empty}>Aucune ligne enregistrée pour ce ticket.</div>
                                    ) : entries.map((entry) => {
                                    const isLabor = entry.nature === "LABOR";
                                    const isRequest = isRequestNature(entry.nature);
                                    const isEditing = !readOnly && (editingEntries[entry.id] || !hasUsefulEntry(entry));
                                    const filledFields = getFilledEntryFields(entry);

                                    return (
                                        <article key={entry.id} className={styles.compactRowCard}>
                                            <div className={styles.compactRowHeader}>
                                                <div className={styles.itemTitle}>Activité</div>
                                                {!readOnly ? (
                                                    <div className={styles.compactRowActions}>
                                                        {!isEditing ? (
                                                            <button className="btn btn-outline" type="button" onClick={() => setEditingEntries((prev) => ({ ...prev, [entry.id]: true }))}>
                                                                Modifier
                                                            </button>
                                                        ) : null}
                                                        <button className="btn btn-outline" type="button" onClick={() => removeEntry(entry.id)}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className={styles.statusBadge} style={{ background: "#fff1f2", color: "#991b1b", border: "1px solid #fecdd3" }}>
                                                        {buildNatureLabel(entry.nature)}
                                                    </span>
                                                )}
                                            </div>

                                            {isEditing ? (
                                                <div className={styles.compactEditGrid}>
                                                    <label className={styles.field}>
                                                        <span className={styles.label}>Nature de l'activité</span>
                                                        <select className={styles.select} value={entry.nature} onChange={(event) => updateEntry(entry.id, "nature", event.target.value)}>
                                                            {NATURE_OPTIONS.map((option) => (
                                                                <option key={option.value} value={option.value}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    {ENTRY_TEXT_FIELDS.map((field) => (
                                                        <div key={field.key} style={{ display: "contents" }}>
                                                            <label className={styles.field}>
                                                                <span className={styles.label}>{field.label}</span>
                                                                <input
                                                                    className={styles.input}
                                                                    value={String(entry[field.key] || "")}
                                                                    disabled={(field.key === "quantity" && isLabor) || (field.key === "laborHours" && !isLabor)}
                                                                    onChange={(event) => updateEntry(entry.id, field.key, event.target.value)}
                                                                />
                                                            </label>
                                                            {field.key === "exportPrice" ? (
                                                                <label key={`${field.key}-currency`} className={styles.field}>
                                                                    <span className={styles.label}>Devise export</span>
                                                                    <select className={styles.select} value={entry.exportCurrency} onChange={(event) => updateEntry(entry.id, "exportCurrency", event.target.value)}>
                                                                        {EXPORT_CURRENCIES.map((currency) => (
                                                                            <option key={currency || "EMPTY"} value={currency}>{currency || "-"}</option>
                                                                        ))}
                                                                    </select>
                                                                </label>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className={styles.compactReadGrid}>
                                                    <div className={styles.compactStaticField}>
                                                        <span>Nature de l'activité</span>
                                                        <strong>{buildNatureLabel(entry.nature)}</strong>
                                                    </div>
                                                    {filledFields.map((field) => (
                                                        <div key={field.key} className={styles.compactStaticField}>
                                                            <span>{field.label}</span>
                                                            <strong>{field.value}</strong>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {isRequest ? <div className={styles.helper} style={{ marginTop: "0.55rem" }}>{entry.nature === "LOCAL_PART_REQUEST" ? "Enregistrée localement" : "Vers import"}</div> : null}
                                        </article>
                                    );
                                })}
                            </div>
                        </div>

                        {!readOnly ? (
                            <>
                                <div className={styles.actions} style={{ marginTop: "0.9rem" }}>
                                    <button className="btn btn-primary" type="button" onClick={saveEntries} disabled={saving || loadingDetail}>
                                        <Save size={14} />
                                        {saving ? "Enregistrement..." : "Enregistrer le tableau"}
                                    </button>
                                </div>
                                {feedback ? <div className={styles.helper} style={{ marginTop: "0.6rem" }}>{feedback}</div> : null}
                            </>
                        ) : null}
                    </article>
                </section>
            )}
        </section>
    );
}


