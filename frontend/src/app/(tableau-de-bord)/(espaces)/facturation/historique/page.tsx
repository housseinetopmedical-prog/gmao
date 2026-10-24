"use client";

/*
- Espace : facturation.
- Partie : historique.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import type {
    EntryRepairSlipDocument,
    EntryRepairSlipEquipmentItem,
    EntryRepairSlipForm,
    EntryRepairSlipPaymentMethod
} from "@/metier/ticket-entree";
import type { ExitRepairSlipDocument } from "@/metier/ticket-sortie";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ReclamationItem = {
    id: number;
    createdAt: string;
    customerName: string;
    contactEmail: string;
    phone?: string | null;
    status: string;
    checklist?: string | null;
    serialNumber: string;
    deviceModel: string;
    description?: string;
    ticket?: {
        id: number;
        displayId?: number | string | null;
        ticketReference?: string | null;
        status?: string;
        closedAt?: string | null;
        savHistory?: Array<{
            id?: number;
            action?: string;
            note?: string | null;
            createdAt?: string;
        }>;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type HistoryItem = {
    id: number;
    createdAt: string;
    customerName: string;
    status: string;
    slip: EntryRepairSlipDocument;
    reclamation: ReclamationItem;
    ticketId: number | null;
    ticketReference: string;
    administrativeClosureAt: string | null;
};

async function downloadEntrySlipOnDemand(slip: EntryRepairSlipDocument) {
    const { downloadEntryRepairSlip } = await import("@/metier/ticket-entree");
    downloadEntryRepairSlip(slip);
}

async function downloadExitSlipOnDemand(slip: ExitRepairSlipDocument) {
    const { downloadExitRepairSlip } = await import("@/metier/ticket-sortie");
    downloadExitRepairSlip(slip);
}

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
        return { id: null, role: "" };
    }
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatDateTime(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizePhoneList(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || "").trim()).filter(Boolean);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeEquipmentItems(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => ({
            designation: String((item as any)?.designation || "").trim(),
            serialNumber: String((item as any)?.serialNumber || "").trim(),
            pn: String((item as any)?.pn || "").trim(),
            articleCode: String((item as any)?.articleCode || "").trim(),
            quantity: String(Math.max(1, Number((item as any)?.quantity || 1) || 1))
        }))
        .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

function parseAccessories(value: unknown) {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || "").replace(/^\s*\d+\s*[.)-]\s*/, "").trim())
            .filter(Boolean)
            .slice(0, 10);
    }

    return String(value || "")
        .split(/\r?\n|[,;]/)
        .map((item) => item.replace(/^\s*\d+\s*[.)-]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 10);
}

function formatClientName(item: HistoryItem) {
    const fullName = `${item.slip.form.clientFirstName || ""} ${item.slip.form.clientLastName || ""}`.trim();
    return fullName || String(item.customerName || item.reclamation.customerName || "-").trim() || "-";
}

function getPrimaryEquipment(item: HistoryItem) {
    const primary = item.slip.form.equipmentItems.find((equipment) => equipment.designation || equipment.serialNumber || equipment.pn || equipment.articleCode);
    return {
        designation: String(primary?.designation || item.slip.form.designation || item.reclamation.deviceModel || "-").trim() || "-",
        serialNumber: String(primary?.serialNumber || item.slip.form.serialNumber || item.reclamation.serialNumber || "-").trim() || "-",
        pn: String(primary?.pn || item.slip.form.pn || "").trim()
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function parseEquipmentItemsFromDescription(description: string | null | undefined) {
    const items = new Map<number, EntryRepairSlipEquipmentItem>();

    String(description || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const designationMatch = line.match(/^Matériel\s+(\d+)\s*:\s*(.+)$/i);
            if (designationMatch) {
                const index = Math.max(0, Number(designationMatch[1]) - 1);
                const current = items.get(index) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.designation = String(designationMatch[2] || "").trim();
                items.set(index, current);
                return;
            }

            const singleDesignationMatch = line.match(/^Matériel\s*:\s*(.+)$/i);
            if (singleDesignationMatch) {
                const current = items.get(0) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.designation = String(singleDesignationMatch[1] || "").trim();
                items.set(0, current);
                return;
            }

            const serialMatch = line.match(/^SN\s+matériel\s+(\d+)\s*:\s*(.+)$/i);
            if (serialMatch) {
                const index = Math.max(0, Number(serialMatch[1]) - 1);
                const current = items.get(index) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.serialNumber = String(serialMatch[2] || "").trim();
                items.set(index, current);
                return;
            }

            const singleSerialMatch = line.match(/^SN\s+matériel\s*:\s*(.+)$/i);
            if (singleSerialMatch) {
                const current = items.get(0) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.serialNumber = String(singleSerialMatch[1] || "").trim();
                items.set(0, current);
                return;
            }

            const pnMatch = line.match(/^PN\s+matériel\s+(\d+)\s*:\s*(.+)$/i);
            if (pnMatch) {
                const index = Math.max(0, Number(pnMatch[1]) - 1);
                const current = items.get(index) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.pn = String(pnMatch[2] || "").trim();
                items.set(index, current);
                return;
            }

            const singlePnMatch = line.match(/^PN\s+matériel\s*:\s*(.+)$/i);
            if (singlePnMatch) {
                const current = items.get(0) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.pn = String(singlePnMatch[1] || "").trim();
                items.set(0, current);
                return;
            }

            const articleCodeMatch = line.match(/^Code\s+article\s+matériel\s+(\d+)\s*:\s*(.+)$/i);
            if (articleCodeMatch) {
                const index = Math.max(0, Number(articleCodeMatch[1]) - 1);
                const current = items.get(index) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.articleCode = String(articleCodeMatch[2] || "").trim();
                items.set(index, current);
                return;
            }

            const singleArticleCodeMatch = line.match(/^Code\s+article\s+matériel\s*:\s*(.+)$/i);
            if (singleArticleCodeMatch) {
                const current = items.get(0) || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
                current.articleCode = String(singleArticleCodeMatch[1] || "").trim();
                items.set(0, current);
            }
        });

    return Array.from(items.entries())
        .sort((left, right) => left[0] - right[0])
        .map(([, item]) => item)
        .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function resolvePaymentMethod(raw: any): EntryRepairSlipPaymentMethod {
    const value = String(
        raw?.diagnosticPaymentMethod
        || raw?.paymentMethod
        || raw?.payment_mode
        || raw?.paymentMode
        || ""
    ).toUpperCase();

    if (value === "CASH" || value === "CHECK" || value === "CARD" || value === "INSTANT_TRANSFER" || value === "NORMAL_TRANSFER") return value;
    return "";
}

function resolveSpecialty(meta: any, slip: any) {
    const specialty = String(slip?.specialty || meta?.specialty || "").trim();
    if (specialty === "AUTRE") return String(meta?.specialtyOther || "").trim();
    return specialty;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function resolveSlipForm(slip: any, item: ReclamationItem): EntryRepairSlipForm {
    const metadata = parseChecklistPayload(item?.checklist).metadata || {};
    const facturationCreatedTicket = (metadata as any)?.facturationCreatedTicket || {};
    const equipmentItems = normalizeEquipmentItems(slip?.equipmentItems);
    const descriptionItems = parseEquipmentItemsFromDescription(item?.description);
    const fallbackItems: EntryRepairSlipEquipmentItem[] = [];

    fallbackItems.push({
        designation: String(slip?.designation || (metadata as any)?.equipmentName || (metadata as any)?.model || item.deviceModel || "").trim(),
        serialNumber: String(slip?.serialNumber || item.serialNumber || "").trim(),
        pn: String(slip?.pn || (metadata as any)?.pn || "").trim(),
        articleCode: "",
        quantity: String(Math.max(1, Number(slip?.quantity || 1) || 1))
    });

    const baseEquipmentItems = equipmentItems.length > 0 ? equipmentItems : fallbackItems;
    const maxLength = Math.max(baseEquipmentItems.length, descriptionItems.length);
    const resolvedEquipmentItems = Array.from({ length: maxLength }, (_, index) => {
        const baseItem = baseEquipmentItems[index] || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };
        const descriptionItem = descriptionItems[index] || { designation: "", serialNumber: "", pn: "", articleCode: "", quantity: "1" };

        return {
            designation: baseItem.designation || descriptionItem.designation,
            serialNumber: baseItem.serialNumber || descriptionItem.serialNumber,
            pn: baseItem.pn || descriptionItem.pn,
            articleCode: baseItem.articleCode || descriptionItem.articleCode,
            quantity: baseItem.quantity || descriptionItem.quantity || "1"
        };
    }).filter((equipmentItem) => equipmentItem.designation || equipmentItem.serialNumber || equipmentItem.pn || equipmentItem.articleCode);

    const primaryEquipment = resolvedEquipmentItems[0] || { designation: "", serialNumber: "", pn: "" };
    const mobilePhones = normalizePhoneList(slip?.mobilePhones);
    const resolvedMobilePhones = mobilePhones.length > 0
        ? mobilePhones
        : [String(slip?.phone || item.phone || "").trim()].filter(Boolean);

    return {
        clientFirstName: String(slip?.clientFirstName || (metadata as any)?.firstName || "").trim(),
        clientLastName: String(slip?.clientLastName || (metadata as any)?.lastName || item.customerName || "").trim(),
        clientCode: String(slip?.clientCode || (metadata as any)?.clientCode || "").trim(),
        city: String(slip?.city || metadata?.city || "Rabat").trim(),
        phone: String(slip?.phone || item.phone || "").trim(),
        mobilePhones: resolvedMobilePhones,
        landlinePhone: String(slip?.landlinePhone || "").trim(),
        email: String(slip?.email || item.contactEmail || "").trim(),
        specialty: resolveSpecialty(metadata, slip),
        designation: primaryEquipment.designation,
        serialNumber: primaryEquipment.serialNumber,
        pn: primaryEquipment.pn,
        equipmentItems: resolvedEquipmentItems,
        priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(slip?.priority || "").toUpperCase())
            ? String(slip.priority).toUpperCase() as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
            : "MEDIUM",
        quantity: String(slip?.quantity || 1),
        accessories: String(slip?.accessories || facturationCreatedTicket?.accessories || (metadata as any)?.accessories || "").trim(),
        failureDescription: String(slip?.failureDescription || item.description || "").trim(),
        diagnosticPrice: String(slip?.diagnosticPrice || 300),
        paymentStatus: String(slip?.diagnosticPaymentStatus || slip?.paymentStatus || "UNPAID").toUpperCase() === "PAID" ? "PAID" : "UNPAID",
        paymentMethod: resolvePaymentMethod(slip)
    };
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function FacturationHistoriquePage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<HistoryItem[]>([]);
    const [generatingExitId, setGeneratingExitId] = useState<number | null>(null);
    const [checkedAccessories, setCheckedAccessories] = useState<Record<number, string[]>>({});
    const [searchTerm, setSearchTerm] = useState("");

    const toggleAccessory = (itemId: number, accessory: string) => {
        setCheckedAccessories((prev) => {
            const current = prev[itemId] || [];
            return {
                ...prev,
                [itemId]: current.includes(accessory)
                    ? current.filter((entry) => entry !== accessory)
                    : [...current, accessory]
            };
        });
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const user = getLocalUser();
                const response = await fetch("/api/reclamations", {
                    headers: {
                        "x-user-role": user.role,
                        "x-user-id": String(user.id || "")
                    }
                });
                const data = await response.json().catch(() => []);
                const list = Array.isArray(data) ? data : [];

                const historyItems = list
                    .map((item: ReclamationItem): HistoryItem | null => {
                        const parsed = parseChecklistPayload(item.checklist);
                        const metadata: any = parsed?.metadata || {};
                        const slip = metadata.entryRepairSlip || {};
                        const ticketId = Number(item.ticket?.id || 0) || null;
                        if (!ticketId) return null;
                        const administrativeClosureAt = getAdministrativeClosureAt(item.ticket || {});
                        const hasEntryRepairSlip = Boolean(metadata.entryRepairSlip);
                        if (!hasEntryRepairSlip && !administrativeClosureAt) return null;
                        const ticketReference = String(item.ticket?.ticketReference || item.ticket?.displayId || ticketId);

                        return {
                            id: item.id,
                            createdAt: item.createdAt,
                            customerName: item.customerName,
                            status: item.status,
                            reclamation: item,
                            ticketId,
                            ticketReference,
                            administrativeClosureAt,
                            slip: {
                                reclamationId: item.id,
                                ticketReference,
                                submittedAt: String(slip.submittedAt || item.createdAt),
                                form: resolveSlipForm(slip, item)
                            }
                        } satisfies HistoryItem;
                    })
                    .filter((item): item is HistoryItem => Boolean(item))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                setItems(historyItems);
            } catch (error) {
                console.error("Facturation history load error:", error);
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return items;
        return items.filter((item) => {
            const equipmentSearch = (item.slip.form.equipmentItems || [])
                .flatMap((equipment) => [
                    equipment.designation,
                    equipment.serialNumber,
                    equipment.pn,
                    equipment.articleCode
                ])
                .join(" ");
            return [
                item.ticketReference,
                item.customerName,
                item.slip.form.clientFirstName,
                item.slip.form.clientLastName,
                item.slip.form.clientCode,
                item.slip.form.specialty,
                item.slip.form.designation,
                item.slip.form.serialNumber,
                item.slip.form.pn,
                equipmentSearch,
                item.reclamation.deviceModel,
                item.reclamation.serialNumber,
                item.slip.form.phone,
                item.slip.form.email,
                item.slip.form.accessories
            ].join(" ").toLowerCase().includes(query);
        });
    }, [items, searchTerm]);

    const downloadExitSlipForItem = async (item: HistoryItem) => {
        if (!item.ticketId) return;
        const selectedAccessories = checkedAccessories[item.id] || [];

        setGeneratingExitId(item.id);
        try {
            const response = await fetch(`/api/tickets/${item.ticketId}`);
            const ticket = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(ticket?.error || "Impossible de charger le ticket.");
            }

            const administrativeClosureAt = getAdministrativeClosureAt(ticket || {});
            if (!administrativeClosureAt) {
                throw new Error("Le ticket traité n'est disponible qu'après la clôture administrative ADV.");
            }

            const checklistMetadata = parseChecklistPayload(ticket?.reclamation?.checklist || item.reclamation?.checklist).metadata || {};
            const technicalRepairAmount = (checklistMetadata as any)?.technicalDiagnosis?.repairAmount;
            const repairAmount = technicalRepairAmount === null || technicalRepairAmount === undefined || technicalRepairAmount === ""
                ? Number((checklistMetadata as any)?.quote?.amount || 0)
                : Number(technicalRepairAmount);

            const exitDocument: ExitRepairSlipDocument = {
                ticketId: Number(ticket?.id || item.ticketId),
                reclamationId: item.id,
                ticketReference: item.ticketReference,
                generatedAt: new Date().toISOString(),
                createdAt: String(ticket?.createdAt || item.createdAt),
                administrativeClosureAt,
                closedAt: ticket?.closedAt || null,
                customerName: String(item.customerName || ticket?.equipment?.client || "-"),
                clientCode: String(item.slip.form.clientCode || ""),
                specialty: String(item.slip.form.specialty || ""),
                contactEmail: String(item.slip.form.email || item.reclamation.contactEmail || "-"),
                contactPhone: item.slip.form.mobilePhones.join(" / ") || String(item.slip.form.phone || item.reclamation.phone || "-"),
                contactLandlinePhone: String(item.slip.form.landlinePhone || ""),
                city: String(item.slip.form.city || parseChecklistPayload(item.reclamation?.checklist).metadata?.city || "Rabat"),
                equipmentName: String(item.slip.form.designation || ticket?.equipment?.name || item.reclamation.deviceModel || "-"),
                serialNumber: String(item.slip.form.serialNumber || ticket?.equipment?.serialNumber || item.reclamation.serialNumber || "-"),
                pn: String(item.slip.form.pn || ""),
                equipmentItems: item.slip.form.equipmentItems,
                quantity: String(item.slip.form.quantity || "1"),
                accessories: selectedAccessories.join("\n"),
                failureDescription: String(item.slip.form.failureDescription || item.reclamation.description || "-"),
                diagnosticPrice: String(item.slip.form.diagnosticPrice || "300"),
                repairAmount: Number.isFinite(repairAmount) && repairAmount >= 0 ? String(repairAmount) : "",
                paymentStatus: item.slip.form.paymentStatus,
                paymentMethod: item.slip.form.paymentMethod,
                interventionType: String(ticket?.interventionType || "WORKSHOP"),
                finalStatus: String(ticket?.status || item.reclamation.ticket?.status || item.status),
                technicianName: String(ticket?.assignedTo?.name || "-"),
                actionsRealisees: String(ticket?.solution || "-")
            };

            await downloadExitSlipOnDemand(exitDocument);

            const user = getLocalUser();
            const alreadyLogged = Array.isArray(ticket?.savHistory)
                && ticket.savHistory.some((entry: any) => String(entry?.action || "") === "EXIT_REPAIR_SLIP_DOWNLOADED");
            if (user.id && !alreadyLogged) {
                await fetch(`/api/tickets/${item.ticketId}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userId: user.id,
                        action: "EXIT_REPAIR_SLIP_DOWNLOADED",
                        message: "Ticket traité téléchargé par la facturation."
                    })
                }).catch(() => null);
            }
        } catch (error) {
            alert(error instanceof Error ? error.message : "Erreur de génération du ticket traité.");
        } finally {
            setGeneratingExitId(null);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement de l'historique des tickets...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.shell}>
            <article className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>
                    <FileText size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Historique des tickets
                </h2>
                <div className={styles.clientsSearchWrap} style={{ marginTop: "0.85rem" }}>
                    <input
                        className={styles.input}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Rechercher par ticket, client, code client, SN..."
                    />
                </div>

                {filteredItems.length === 0 ? (
                    <div className={styles.empty} style={{ marginTop: "0.8rem" }}>Aucun ticket créé pour le moment.</div>
                ) : (
                    <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
                        {filteredItems.map((item) => {
                            const accessories = parseAccessories(item.slip.form.accessories);
                            const selectedAccessories = checkedAccessories[item.id] || [];
                            const equipment = getPrimaryEquipment(item);
                            // Cette partie affiche l interface visible a l ecran.
                            return (
                            <article key={`entry-slip-${item.id}`} className={styles.listItem} style={{ display: "grid", gap: "0.65rem" }}>
                                <div className={styles.itemMain} style={{ alignItems: "flex-start", gap: "0.75rem" }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div className={styles.itemTitle}>Ticket #{item.ticketReference}</div>
                                    </div>
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                        gap: "0.5rem",
                                        alignItems: "stretch"
                                    }}
                                >
                                    <div className={styles.statusBadge} style={{ justifyContent: "flex-start", background: "#fff", color: "#111827" }}>
                                        <strong>Client:</strong>&nbsp;{formatClientName(item)}
                                    </div>
                                    <div className={styles.statusBadge} style={{ justifyContent: "flex-start", background: "#fff", color: "#111827" }}>
                                        <strong>Matériel à réparer:</strong>&nbsp;{equipment.designation}
                                    </div>
                                    <div className={styles.statusBadge} style={{ justifyContent: "flex-start", background: "#fff", color: "#111827" }}>
                                        <strong>SN:</strong>&nbsp;{equipment.serialNumber}
                                    </div>
                                    {equipment.pn ? (
                                        <div className={styles.statusBadge} style={{ justifyContent: "flex-start", background: "#fff", color: "#111827" }}>
                                            <strong>PN:</strong>&nbsp;{equipment.pn}
                                        </div>
                                    ) : null}
                                </div>

                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                        gap: "0.5rem 1rem"
                                    }}
                                >
                                    <div className={styles.itemMeta}>
                                        <strong>Ticket créé:</strong> {formatDateTime(item.slip.submittedAt)}
                                    </div>
                                    <div className={styles.itemMeta}>
                                        <strong>Ticket traité:</strong> {item.administrativeClosureAt ? formatDateTime(item.administrativeClosureAt) : "En attente"}
                                    </div>
                                </div>

                                {item.ticketId && item.administrativeClosureAt ? (
                                    <div className={styles.listItem} style={{ display: "grid", gap: "0.45rem", background: "#fff" }}>
                                        <div style={{ fontWeight: 700 }}>Vérification des accessoires déposés</div>
                                        {accessories.length > 0 ? (
                                            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                                                {accessories.map((accessory, index) => (
                                                    <label key={`${item.id}-accessory-${index}`} className={styles.statusBadge} style={{ cursor: "pointer" }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedAccessories.includes(accessory)}
                                                            onChange={() => toggleAccessory(item.id, accessory)}
                                                            style={{ marginRight: "0.4rem" }}
                                                        />
                                                        {index + 1}. {accessory}
                                                    </label>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className={styles.itemMeta}>Aucun accessoire enregistré dans le ticket créé.</div>
                                        )}
                                    </div>
                                ) : null}

                                <div className={styles.actions} style={{ marginTop: "0.1rem" }}>
                                    <button className="btn btn-outline" type="button" onClick={() => downloadEntrySlipOnDemand(item.slip)}>
                                        <Download size={14} />
                                        Ticket créé
                                    </button>
                                    {item.ticketId && item.administrativeClosureAt ? (
                                        <button
                                            className="btn btn-primary"
                                            type="button"
                                            onClick={() => downloadExitSlipForItem(item)}
                                            disabled={generatingExitId === item.id}
                                            title="Télécharger le ticket traité"
                                        >
                                            <Download size={14} />
                                            {generatingExitId === item.id ? "Génération..." : "Ticket traité"}
                                        </button>
                                    ) : null}
                                </div>
                            </article>
                        )})}
                    </div>
                )}
            </article>
        </section>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "historique" de l espace "facturation".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
