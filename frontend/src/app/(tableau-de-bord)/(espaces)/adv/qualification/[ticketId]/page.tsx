"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : qualification.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import styles from "../../adv.module.css";
import { getTicketEquipmentItems } from "@/metier/materiel-ticket";
import { parseChecklistPayload } from "@/metier/workflow-client";
import {
    getChecklistMetadata,
    getSosAnswers,
    getUrgencyFromReclamation,
    getUrgencyToneClass,
    URGENCY_LABELS
} from "@/metier/workflow-adv";

const EmbeddedTicketForm = dynamic(() => import("@/composants/client/FormulaireDemandeClient"), {
    loading: () => <div className={styles.empty}>Chargement du formulaire de modification...</div>,
    ssr: false
});

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    status: string;
    customerName: string;
    contactEmail: string;
    phone?: string | null;
    serialNumber: string;
    deviceModel: string;
    description: string;
    interventionType?: string | null;
    checklist?: string | null;
    ticket?: {
        id?: number | null;
        displayId?: number | string | null;
        ticketReference?: string | null;
        status?: string | null;
        assignedToId?: number | null;
        aiSummary?: string | null;
        aiUrgency?: string | null;
        aiProbableCauses?: string | null;
        aiSuggestedParts?: string | null;
        aiChecklist?: string | null;
        savHistory?: Array<{
            action?: string | null;
        }> | null;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type EquipmentMerchandiseItem = {
    entryId: string;
    materialIndex: number;
    label: string;
    quantity: number;
    articleCode: string;
    warrantyLabel: string;
    invoiceDate: string;
    shippingDate: string;
    warrantyLimitDate?: string;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function calculateWarrantyLimitDate(shippingDate: unknown, warrantyLabel: unknown) {
    const normalizedShippingDate = String(shippingDate || "").trim();
    const months = parseWarrantyMonths(warrantyLabel);
    if (!normalizedShippingDate || !months) return "";
    const date = new Date(`${normalizedShippingDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    date.setMonth(date.getMonth() + months);
    return date.toISOString().slice(0, 10);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatDateFr(value: unknown) {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(`${text}T00:00:00`);
    if (Number.isNaN(date.getTime())) return text;
    return date.toLocaleDateString("fr-FR");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getTicketDisplayLabel(item: Reclamation | null) {
    if (!item) return "-";
    return String(item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function buildEquipmentMerchandiseItems(entryRepairSlip: any, selectedReclamation: Reclamation | null, existingItems: unknown): EquipmentMerchandiseItem[] {
    const rawEquipment = Array.isArray(entryRepairSlip?.equipmentItems) && entryRepairSlip.equipmentItems.length > 0
        ? entryRepairSlip.equipmentItems
        : [{ designation: selectedReclamation?.deviceModel || "Matériel", quantity: 1 }];
    const existing = Array.isArray(existingItems) ? existingItems : [];

    const rows: EquipmentMerchandiseItem[] = rawEquipment.flatMap((item: any, index: number) => {
        const label = String(item?.designation || `Matériel ${index + 1}`);
        const quantity = Math.max(1, Number(item?.quantity || 1) || 1);
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function hasAdvMerchandiseVerification(item: Reclamation) {
    const metadata = getChecklistMetadata(item) as any;
    const merchandise = metadata?.merchandiseInfo || {};
    const storeReview = metadata?.storeReview || {};
    const historyEntries = Array.isArray(item?.ticket?.savHistory) ? item.ticket.savHistory : [];
    const hasHistoryValidation = historyEntries.some(
        (entry) => String(entry?.action || "").toUpperCase() === "ADV_MERCHANDISE_REVIEW"
    );

    // Cette partie affiche l interface visible a l ecran.
    return (
        String(merchandise?.filledBy || "").toUpperCase() === "ADV" ||
        Boolean(String(merchandise?.filledAt || "").trim()) ||
        String(storeReview?.lastAction || "").toUpperCase() === "VALIDATE_AND_FORWARD" ||
        hasHistoryValidation
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function cleanText(value: unknown) {
    return String(value || "").trim();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeCompareValue(value: unknown) {
    return cleanText(value).toLowerCase();
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvQualificationPage() {
    const params = useParams<{ ticketId?: string }>();
    const router = useRouter();
    const searchParams = useSearchParams();

    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [warrantyStatus, setWarrantyStatus] = useState("");
    const [editableCustomerName, setEditableCustomerName] = useState("");
    const [editableEmail, setEditableEmail] = useState("");
    const [editablePhone, setEditablePhone] = useState("");
    const [editableModel, setEditableModel] = useState("");
    const [editableSerialNumber, setEditableSerialNumber] = useState("");
    const [editableInterventionType, setEditableInterventionType] = useState("SITE");
    const [editableDescription, setEditableDescription] = useState("");
    const [equipmentMerchandiseItems, setEquipmentMerchandiseItems] = useState<EquipmentMerchandiseItem[]>([]);
    const [createClientAccess, setCreateClientAccess] = useState(false);
    const [clientPassword, setClientPassword] = useState("");
    const [clientPasswordConfirmation, setClientPasswordConfirmation] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const forcedReclamationId = useMemo(() => {
        const ticketIdFromPath = Number(Array.isArray(params?.ticketId) ? params.ticketId[0] : params?.ticketId);
        if (Number.isFinite(ticketIdFromPath) && ticketIdFromPath > 0) {
            return ticketIdFromPath;
        }

        const legacyReclamationId = Number(searchParams.get("reclamationId") || searchParams.get("id"));
        return Number.isFinite(legacyReclamationId) && legacyReclamationId > 0 ? legacyReclamationId : null;
    }, [params, searchParams]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/reclamations?light=0&historyLimit=20", {
                    cache: "no-store"
                });
                const reclamationData = await response.json();
                const list = Array.isArray(reclamationData) ? reclamationData : [];
                const onlyToQualify = list.filter((item: Reclamation) => {
                    const status = String(item.status || "").toUpperCase();
                    const ticketStatus = String(item?.ticket?.savHistory ? item?.ticket?.status : item?.ticket?.status || "").toUpperCase();
                    const matchesForcedItem = item.id === forcedReclamationId || Number(item?.ticket?.id || 0) === forcedReclamationId;
                    const shouldKeepByStatus = ["PENDING_ADV", "PENDING", "PENDING_ADV_VERIFICATION", "PENDING_STORE_REVIEW", "PENDING_TECHNICAL_MANAGER_REVIEW", "READY_FOR_TECH_MANAGER_ASSIGNMENT"].includes(status)
                        || ticketStatus === "QUALIFICATION"
                        || (matchesForcedItem && ticketStatus !== "CLOSED");
                    if (!shouldKeepByStatus) {
                        return false;
                    }
                    if (status === "PENDING_ADV_VERIFICATION" && hasAdvMerchandiseVerification(item) && !matchesForcedItem) {
                        return false;
                    }
                    return true;
                });

                setReclamations(onlyToQualify);
                if (onlyToQualify.length > 0) {
                    const forcedMatch = forcedReclamationId !== null
                        ? onlyToQualify.find((item) => item.id === forcedReclamationId || Number(item?.ticket?.id || 0) === forcedReclamationId)
                        : null;

                    if (forcedMatch) {
                        setSelectedId(forcedMatch.id);
                    } else {
                        setSelectedId((prev) => {
                            if (prev && onlyToQualify.some((item) => item.id === prev)) return prev;
                            return onlyToQualify[0].id;
                        });
                    }
                }
            } catch (error) {
                console.error("ADV qualification fetch error:", error);
                setReclamations([]);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, [forcedReclamationId]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const selectedReclamation = useMemo(
        () => reclamations.find((item) => item.id === selectedId) || null,
        [reclamations, selectedId]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const isEditFlow = useMemo(() => {
        if (!selectedReclamation) return false;
        const currentStatus = String(selectedReclamation.status || "").toUpperCase();
        return [
            "PENDING_STORE_REVIEW",
            "PENDING_TECHNICAL_MANAGER_REVIEW",
            "READY_FOR_TECH_MANAGER_ASSIGNMENT",
            "TAKEN_IN_CHARGE",
            "DECISION_OUT_OF_WARRANTY",
            "PENDING_ADV_QUOTE",
            "QUOTE_SENT_TO_CLIENT",
            "QUOTE_APPROVED"
        ].includes(currentStatus) || String(selectedReclamation?.ticket?.status || "").toUpperCase() !== "QUALIFICATION";
    }, [selectedReclamation]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const meta = useMemo(
        () => (selectedReclamation ? getChecklistMetadata(selectedReclamation) : {}),
        [selectedReclamation]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const selectedUrgency = useMemo(
        () => (selectedReclamation ? getUrgencyFromReclamation(selectedReclamation) : "MEDIUM"),
        [selectedReclamation]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const sosAnswers = useMemo(
        () => (selectedReclamation ? getSosAnswers(selectedReclamation) : []),
        [selectedReclamation]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const entryRepairSlip = useMemo(() => (meta as any)?.entryRepairSlip || {}, [meta]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const isEntryRepairSlip = useMemo(() => String((meta as any)?.source || "") === "ENTRY_REPAIR_SLIP", [meta]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const entryRepairSlipEquipmentItems = useMemo(() => {
        const items = Array.isArray(entryRepairSlip.equipmentItems) ? entryRepairSlip.equipmentItems : [];
        return items
            .map((item: any, index: number) => {
                const label = String(item?.designation || `Matériel ${index + 1}`);
                const quantity = Math.max(1, Number(item?.quantity || 1) || 1);
                return { label, quantity };
            });
    }, [entryRepairSlip.equipmentItems]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const materialDetails = useMemo(() => {
        const metadataBrand = cleanText((meta as any)?.brand);
        const metadataModel = cleanText((meta as any)?.model) || cleanText(selectedReclamation?.deviceModel);
        const materialName = cleanText(entryRepairSlip.designation)
            || cleanText((meta as any)?.equipmentName)
            || cleanText(selectedReclamation?.deviceModel);
        const items = getTicketEquipmentItems({
            checklist: selectedReclamation?.checklist,
            deviceModel: selectedReclamation?.deviceModel,
            serialNumber: selectedReclamation?.serialNumber,
            pn: (meta as any)?.pn,
            equipmentName: materialName,
            description: selectedReclamation?.description
        });

        if (items.length === 0) {
            return [{
                name: materialName || "-",
                model: metadataModel || "-",
                brand: metadataBrand || "-",
                serialNumber: cleanText(selectedReclamation?.serialNumber) || "",
                pn: cleanText((meta as any)?.pn) || ""
            }];
        }

        return items.map((item) => ({
            name: cleanText(item.designation) || materialName || "-",
            model: metadataModel || "-",
            brand: metadataBrand || "-",
            serialNumber: cleanText(item.serialNumber) || cleanText(selectedReclamation?.serialNumber) || "",
            pn: cleanText(item.pn) || cleanText((meta as any)?.pn) || ""
        }));
    }, [entryRepairSlip.designation, meta, selectedReclamation]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const entryClientName = useMemo(
        () => [entryRepairSlip.clientFirstName, entryRepairSlip.clientLastName].filter(Boolean).join(" ").trim(),
        [entryRepairSlip.clientFirstName, entryRepairSlip.clientLastName]
    );

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const merch = (meta as any)?.merchandiseInfo || {};
        setWarrantyStatus(String(merch.warrantyStatus || ""));
        setEditableCustomerName(String(selectedReclamation?.customerName || ""));
        setEditableEmail(String(selectedReclamation?.contactEmail || ""));
        setEditablePhone(String(selectedReclamation?.phone || ""));
        setEditableModel(String(selectedReclamation?.deviceModel || ""));
        setEditableSerialNumber(String(selectedReclamation?.serialNumber || ""));
        setEditableInterventionType(String(selectedReclamation?.interventionType || "SITE"));
        setEditableDescription(String(selectedReclamation?.description || ""));
        setEquipmentMerchandiseItems(
            buildEquipmentMerchandiseItems(entryRepairSlip, selectedReclamation, merch.equipmentMerchandiseItems)
        );
        setCreateClientAccess(false);
        setClientPassword("");
        setClientPasswordConfirmation("");
        setSaveMessage(null);
    }, [entryRepairSlip, meta, selectedReclamation]);

    const clientInfo = useMemo<Array<[string, ReactNode]>>(
        () => {
            const details: Array<[string, ReactNode]> = [
                ["Nom du client", isEntryRepairSlip ? entryClientName || selectedReclamation?.customerName || "-" : selectedReclamation?.customerName || "-"],
                ["E-mail", isEntryRepairSlip ? String(entryRepairSlip.email || selectedReclamation?.contactEmail || "-") : String(selectedReclamation?.contactEmail || "-")],
                ["Téléphone", isEntryRepairSlip ? String(entryRepairSlip.phone || selectedReclamation?.phone || "-") : String(selectedReclamation?.phone || "-")]
            ];

            if (isEntryRepairSlip) {
                details.push(
                    ["Prix du diagnostic", String(entryRepairSlip.diagnosticPrice ? `${entryRepairSlip.diagnosticPrice} DH` : "300 DH")],
                    ["Paiement du diagnostic", String(entryRepairSlip.diagnosticPaymentStatus || "UNPAID").toUpperCase() === "PAID" ? "Payé" : "Non payé"]
                );
            } else {
                details.push(
                    ["Établissement", String((meta as any).establishment || "-")],
                    ["Ville", String((meta as any).city || "-")],
                    ["Secteur", String((meta as any).specialtySector || "-")],
                    ["Spécialité", String((meta as any).specialty || "-")]
                );
            }

            return details;
        },
        [entryClientName, entryRepairSlip.diagnosticPaymentStatus, entryRepairSlip.diagnosticPrice, entryRepairSlip.email, entryRepairSlip.phone, isEntryRepairSlip, meta, selectedReclamation]
    );

    const equipmentInfo = useMemo<ReactNode>(
        () => {
            const accessoriesValue = String(isEntryRepairSlip ? entryRepairSlip.accessories || "-" : (meta as any).accessories || "-");

            if (materialDetails.length === 0) {
                return "-";
            }

            // Cette partie affiche l interface visible a l ecran.
            return (
                <div style={{ display: "grid", gap: "0.85rem" }}>
                    {materialDetails.map((material, index) => {
                        const fields = [
                            ["Désignation", material.name],
                            ["Modèle", material.model !== "-" && normalizeCompareValue(material.model) !== normalizeCompareValue(material.name) ? material.model : ""],
                            ["Marque", material.brand !== "-" ? material.brand : ""],
                            ["Numéro de série", material.serialNumber],
                            ["PN", material.pn]
                        ].filter(([, value]) => Boolean(String(value || "").trim()));

                        // Cette partie affiche l interface visible a l ecran.
                        return (
                            <div
                                key={`qualification-material-${index}`}
                                style={{
                                    display: "grid",
                                    gap: "0.65rem",
                                    padding: "0.9rem",
                                    border: "1px solid var(--border-color)",
                                    borderRadius: "12px",
                                    background: "var(--card-bg)"
                                }}
                            >
                                <div style={{ fontWeight: 800, color: "var(--text-primary)" }}>{material.name}</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.65rem 0.85rem" }}>
                                    {fields.map(([label, value]) => (
                                        <MaterialField key={`${index}-${label}`} label={label} value={value} />
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    <div style={{ display: "grid", gap: "0.75rem", paddingTop: "0.25rem" }}>
                        <MaterialField
                            label="Niveau d'urgence"
                            value={<span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(selectedUrgency)]}`}>{URGENCY_LABELS[selectedUrgency]}</span>}
                        />
                        <MaterialField label="Accessoires fournis" value={accessoriesValue} />
                    </div>
                </div>
            );
        },
        [entryRepairSlip.accessories, entryRepairSlipEquipmentItems, isEntryRepairSlip, materialDetails, meta, selectedUrgency]
    );

    const descriptionTitle = isEntryRepairSlip ? "Description de la panne" : "Description de la demande";
    const initialDescription = String(
        isEntryRepairSlip ? entryRepairSlip.failureDescription || selectedReclamation?.description || "-" : selectedReclamation?.description || "-"
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const merchandiseIsComplete = useMemo(
        () => equipmentMerchandiseItems.length > 0 && equipmentMerchandiseItems.every((item) => Boolean(item.warrantyLabel.trim() && item.invoiceDate && item.shippingDate)),
        [equipmentMerchandiseItems]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const equipmentMerchandiseGroups = useMemo(
        () => equipmentMerchandiseItems.reduce<EquipmentMerchandiseItem[]>((accumulator, item) => {
            if (!accumulator.some((entry) => entry.materialIndex === item.materialIndex)) {
                accumulator.push(item);
            }
            return accumulator;
        }, []),
        [equipmentMerchandiseItems]
    );

    const updateEquipmentMerchandiseItem = (index: number, field: keyof Pick<EquipmentMerchandiseItem, "articleCode" | "warrantyLabel" | "invoiceDate" | "shippingDate">, value: string) => {
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

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleSave = async () => {
        if (!selectedReclamation) return;

        if (createClientAccess) {
            if (!String(entryRepairSlip.email || selectedReclamation.contactEmail || "").trim()) {
                setSaveMessage({ type: "error", text: "L'e-mail client est obligatoire pour créer l'accès client." });
                return;
            }
            if (clientPassword.length < 6) {
                setSaveMessage({ type: "error", text: "Le mot de passe client doit contenir au moins 6 caractères." });
                return;
            }
            if (clientPassword !== clientPasswordConfirmation) {
                setSaveMessage({ type: "error", text: "La confirmation du mot de passe client ne correspond pas." });
                return;
            }
        }

        setIsSaving(true);
        setSaveMessage(null);

        try {
            const currentUser = getLocalUser();
            const currentStatus = String(selectedReclamation.status || "").toUpperCase();
            const persistedWarrantyStatus = warrantyStatus.trim() || String((meta as any)?.merchandiseInfo?.warrantyStatus || "").trim();

            if (!isEditFlow) {
                const qualificationResponse = await fetch(`/api/adv/reclamations/${selectedReclamation.id}/qualification`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        advId: currentUser?.id,
                        ...(persistedWarrantyStatus ? { warrantyStatus: persistedWarrantyStatus } : {})
                    })
                });

                if (!qualificationResponse.ok) {
                    const error = await qualificationResponse.json().catch(() => ({}));
                    throw new Error(error?.error || "Impossible d'enregistrer la validation.");
                }
            }

            const targetStatus = isEditFlow ? currentStatus : "PENDING_ADV_VERIFICATION";
            const response = await fetch(`/api/reclamations/${selectedReclamation.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-role": currentUser.role,
                    "x-user-id": String(currentUser.id || "")
                },
                body: JSON.stringify({
                    status: targetStatus,
                    advId: currentUser?.id
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error || "Impossible d'enregistrer les informations marchandise.");
            }

            if (createClientAccess) {
                const clientAccessResponse = await fetch("/api/adv/client-access", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        advUserId: currentUser?.id,
                        reclamationId: selectedReclamation.id,
                        email: String(entryRepairSlip.email || selectedReclamation.contactEmail || "").trim().toLowerCase(),
                        password: clientPassword,
                        firstName: String(entryRepairSlip.clientFirstName || selectedReclamation.customerName.split(" ")[0] || "").trim(),
                        lastName: String(entryRepairSlip.clientLastName || selectedReclamation.customerName.split(" ").slice(1).join(" ") || "").trim(),
                        mobilePhones: [String(entryRepairSlip.phone || selectedReclamation.phone || "").trim()].filter(Boolean),
                        landlinePhone: null
                    })
                });

                const clientAccessData = await clientAccessResponse.json().catch(() => ({}));
                if (!clientAccessResponse.ok) {
                    throw new Error(clientAccessData?.error || "Les informations ADV sont enregistrées, mais la création de l'accès client a échoué.");
                }
            }

            router.replace("/adv/tickets");
        } catch (error) {
            setSaveMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Erreur lors de l'enregistrement"
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement de la validation...</div>;
    }

    if (!selectedReclamation) {
        return <div className={styles.empty}>Aucune demande disponible pour validation.</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.sectionCard}>
            <div className={styles.verificationHeader}>
                <div>
                    <h1 className={styles.verificationTitle}>Validation</h1>
                </div>
                <div className={styles.verificationBadges}>
                    <span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(selectedUrgency)]}`}>Urgence : {URGENCY_LABELS[selectedUrgency]}</span>
                </div>
            </div>

            <div className={styles.verificationSection} style={{ marginTop: "1rem" }}>
                <EmbeddedTicketForm editIdOverride={selectedReclamation.id} embedded />
            </div>

            {isEntryRepairSlip ? (
                <div className={`${styles.verificationSection} ${styles.verificationSectionSoft}`} style={{ marginTop: "1rem" }}>
                    <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Création de l'accès client</div>
                    <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 500 }}>
                        <input type="checkbox" checked={createClientAccess} onChange={(event) => setCreateClientAccess(event.target.checked)} />
                        Créer l'accès client pendant cette étape
                    </label>
                    {createClientAccess ? (
                        <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "1fr 1fr", marginTop: "0.7rem" }}>
                            <div>
                                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>E-mail client</label>
                                <input
                                    value={String(entryRepairSlip.email || selectedReclamation.contactEmail || "")}
                                    readOnly
                                    style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem", background: "#f8fafc" }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Téléphone client</label>
                                <input
                                    value={String(entryRepairSlip.phone || selectedReclamation.phone || "")}
                                    readOnly
                                    style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem", background: "#f8fafc" }}
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Mot de passe client</label>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    value={clientPassword}
                                    onChange={(event) => setClientPassword(event.target.value)}
                                    style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}
                                    placeholder="Minimum 6 caractères"
                                />
                            </div>
                            <div>
                                <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Confirmer mot de passe</label>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    value={clientPasswordConfirmation}
                                    onChange={(event) => setClientPasswordConfirmation(event.target.value)}
                                    style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }}
                                    placeholder="Retaper le mot de passe"
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {saveMessage ? (
                <div className="card" style={{ marginTop: "1rem", padding: "0.85rem", background: saveMessage.type === "success" ? "#dbeafe" : "#fee2e2", borderLeft: `4px solid ${saveMessage.type === "success" ? "#0ea5e9" : "#ef4444"}` }}>
                    {saveMessage.text}
                </div>
            ) : null}

        </section>
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.infoBox}>
            <div className={styles.infoTitle}>{title}</div>
            <div className={styles.infoCardBody}>{children}</div>
        </div>
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function Field({ label, value, onChange, placeholder = "", type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
    // Cette partie affiche l interface visible a l ecran.
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function ReadOnlyField({ label, value }: { label: string; value: string }) {
    // Cette partie affiche l interface visible a l ecran.
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function EquipmentMerchandiseRowsEditor({
    rows,
    onChange,
    onAdd,
    onRemove
}: {
    rows: EquipmentMerchandiseItem[];
    onChange: (entryId: string, field: keyof Pick<EquipmentMerchandiseItem, "articleCode" | "warrantyLabel" | "invoiceDate" | "shippingDate">, value: string) => void;
    onAdd: () => void;
    onRemove: (entryId: string) => void;
}) {
    // Cette partie affiche l interface visible a l ecran.
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
                            <Field label="Date facture" value={item.invoiceDate} onChange={(value) => onChange(item.entryId, "invoiceDate", value)} type="date" />
                            <Field label="Garantie contractuelle" value={item.warrantyLabel} onChange={(value) => onChange(item.entryId, "warrantyLabel", value)} placeholder="Ex: 12 mois" />
                            <Field label="Date d'expédition" value={item.shippingDate} onChange={(value) => onChange(item.entryId, "shippingDate", value)} type="date" />
                            <ReadOnlyField label="Date limite" value={formatDateFr(item.warrantyLimitDate || calculateWarrantyLimitDate(item.shippingDate, item.warrantyLabel))} />
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

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function InfoLine({ label, value }: { label: string; value: ReactNode }) {
    if (typeof value === "string") {
        const text = value.trim().toLowerCase();
        if (!text || text === "-" || text === "non renseigné" || text === "non renseigne") {
            return null;
        }
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.infoLine}>
            <div className={styles.infoLineLabel}>{label}</div>
            <div className={styles.infoLineValue}>{value}</div>
        </div>
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function MaterialField({ label, value }: { label: string; value: ReactNode }) {
    if (typeof value === "string") {
        const text = value.trim();
        if (!text || text === "-" || text.toLowerCase() === "non renseigné" || text.toLowerCase() === "non renseignée") {
            return null;
        }
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div style={{ display: "grid", gap: "0.18rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {label}
            </div>
            <div style={{ color: "var(--text-primary)", lineHeight: 1.45 }}>{value}</div>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "qualification" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
