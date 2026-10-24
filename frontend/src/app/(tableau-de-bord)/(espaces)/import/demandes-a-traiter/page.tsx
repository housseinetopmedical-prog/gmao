"use client";

/*
Commentaire simple du fichier :
- Espace : import.
- Partie : demandes a traiter.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { Loader2, PackageSearch, Save } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";
import panelStyles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { formatImportReference, getImportStatusLabel } from "@/metier/workflow-import";
import { getTicketEquipmentItems } from "@/metier/materiel-ticket";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ImportOrder = {
    id: number;
    ref: string;
    status: string;
    notes: string | null;
    createdAt: string;
    expectedDate: string | null;
    receivedDate: string | null;
    creator?: { name: string; role: string } | null;
    ticket?: {
        id: number;
        title: string;
        reclamation?: {
            deviceModel?: string | null;
            serialNumber?: string | null;
            description?: string | null;
            checklist?: string | null;
        } | null;
        assignedTo?: { id: number; name: string } | null;
    } | null;
    equipment?: {
        name?: string | null;
        serialNumber?: string | null;
        client?: string | null;
    } | null;
    items: Array<{
        id: number;
        name: string;
        ref: string | null;
        qty: number;
    }>;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type OverviewPayload = {
    pendingOrders: ImportOrder[];
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type ParsedRequestedPart = {
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
    salePriceTtc: string;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type RepairEntrySnapshot = ParsedRequestedPart;

// Cette partie explique la forme des donnees utilisees dans le fichier.
type MaterialDisplay = {
    designation: string;
    serialNumber: string;
    pn: string;
};

type ImportEditableStatus = "ORDERED" | "SHIPPED" | "RECEIVED";

const IMPORT_EDITABLE_STATUSES: Array<{ value: ImportEditableStatus; label: string }> = [
    { value: "ORDERED", label: "Commande lancée" },
    { value: "SHIPPED", label: "Commande expédiée" },
    { value: "RECEIVED", label: "Marchandise reçue" }
];

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function replaceReclamationByIntervention(value: string | null | undefined) {
    return String(value || "")
        .replace(/Réclamation/g, "Intervention")
        .replace(/réclamation/g, "intervention")
        .replace(/Reclamation/g, "Intervention")
        .replace(/reclamation/g, "intervention");
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatUrgency(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "LOW") return "Faible";
    if (normalized === "MEDIUM") return "Moyenne";
    if (normalized === "HIGH") return "Élevée";
    if (normalized === "CRITICAL") return "Critique";
    return value ? String(value) : "Non renseignée";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatPartNature(value: string | null | undefined) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "USED_PART") return "Pièce utilisée";
    if (normalized === "PART_REQUEST") return "Demande de pièce";
    if (normalized === "LOCAL_PART_REQUEST") return "Pièce locale";
    if (normalized === "SOFTWARE_UPDATE") return "Mise à jour";
    if (normalized === "SOFTWARE_INSTALLATION") return "Installation licence / logiciel";
    if (normalized === "PART_TO_MANUFACTURE") return "Pièce à fabriquer";
    if (normalized === "LABOR") return "Main d'oeuvre";
    if (normalized === "REPAIR") return "Réparation";
    return value ? String(value) : "";
}

function formatDate(value: string | null | undefined) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function formatImportRef(value: string | null | undefined) {
    return formatImportReference(value);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getLineValue(lines: string[], pattern: RegExp) {
    const line = lines.find((entry) => pattern.test(entry));
    return line ? line.split(":").slice(1).join(":").trim() : "";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeComparableValue(value: unknown) {
    return String(value || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function toRepairEntrySnapshot(entry: Record<string, unknown> | null | undefined): RepairEntrySnapshot {
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
        salePriceTtc: entry?.salePriceTtc === null || entry?.salePriceTtc === undefined ? "" : String(entry.salePriceTtc).trim()
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function findRequestedPartFromChecklist(order: ImportOrder | null | undefined) {
    const metadata = parseChecklistPayload(order?.ticket?.reclamation?.checklist).metadata || {};
    const technicalDiagnosis = (metadata as any).technicalDiagnosis || {};
    const repairEntries = Array.isArray(technicalDiagnosis.repairEntries) ? technicalDiagnosis.repairEntries : [];
    const requestedItem = Array.isArray(order?.items) ? order?.items[0] : null;
    const itemName = normalizeComparableValue(requestedItem?.name);
    const itemRef = normalizeComparableValue(requestedItem?.ref);

    const match = repairEntries.find((entry: unknown) => {
        const candidate = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
        if (!candidate) return false;

        const designation = normalizeComparableValue(candidate.designation);
        const sageCode = normalizeComparableValue(candidate.sageCode);
        const supplierCode = normalizeComparableValue(candidate.supplierCode);

        return (itemName && designation === itemName)
            || (itemRef && (sageCode === itemRef || supplierCode === itemRef));
    });

    return match && typeof match === "object" ? toRepairEntrySnapshot(match as Record<string, unknown>) : null;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function parseImportRequestNotes(notes: string | null | undefined) {
    const lines = String(notes || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const rawSubject = lines[0] || "Demande import";
    const urgencyLine = lines.find((line) => /^Urgence\s*:/i.test(line));
    const ticketMatch = rawSubject.match(/Ticket\s*#\s*(\d+)/i);
    const subject = replaceReclamationByIntervention(rawSubject).replace(/\s*-\s*Ticket\s*#\d+/i, "").trim();
    const requestedMaterial = getLineValue(lines, /^Mat[eé]riel\s+concern[eé]\s*:/i);
    const requestedSerial = getLineValue(lines, /^SN\s+mat[eé]riel\s*:/i);
    const requestedPn = getLineValue(lines, /^PN\s+mat[eé]riel\s*:/i);
    const requestedPart: ParsedRequestedPart = {
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
        salePriceTtc: getLineValue(lines, /^Prix\s+de\s+vente\s+TTC\s*:/i)
    };

    return {
        subject: subject || "Demande import",
        ticketReference: ticketMatch ? `Ticket #${ticketMatch[1]}` : null,
        urgency: urgencyLine ? formatUrgency(urgencyLine.split(":").slice(1).join(":").trim()) : "Non renseignée",
        material: requestedMaterial || requestedSerial || requestedPn
            ? {
                designation: requestedMaterial,
                serialNumber: requestedSerial,
                pn: requestedPn
            }
            : null,
        requestedPart
    };
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getOrderMaterialDetails(order: ImportOrder) {
    return getTicketEquipmentItems({
        checklist: order.ticket?.reclamation?.checklist,
        deviceModel: order.ticket?.reclamation?.deviceModel,
        serialNumber: order.ticket?.reclamation?.serialNumber,
        equipmentName: order.equipment?.name,
        description: order.ticket?.reclamation?.description
    }).map((item) => ({
        designation: item.designation || `Matériel ${item.index + 1}`,
        serialNumber: item.serialNumber,
        pn: item.pn
    }));
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ImportPendingRequestsPage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [payload, setPayload] = useState<OverviewPayload>({ pendingOrders: [] });
    const [feedback, setFeedback] = useState("");
    const [userId, setUserId] = useState<number | null>(null);
    const [forms, setForms] = useState<Record<number, { status: ImportEditableStatus; expectedDate: string; receivedDate: string }>>({});

    const load = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/import/overview", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));
            const pendingOrders = Array.isArray(data?.pendingOrders) ? data.pendingOrders : [];
            setPayload({ pendingOrders });
            setForms((current) => {
                const nextForms: Record<number, { status: ImportEditableStatus; expectedDate: string; receivedDate: string }> = {};
                pendingOrders.forEach((order: ImportOrder) => {
                    const currentForm = current[order.id];
                    nextForms[order.id] = currentForm || {
                        status: IMPORT_EDITABLE_STATUSES.some((item) => item.value === String(order.status || "").toUpperCase())
                            ? String(order.status || "").toUpperCase() as ImportEditableStatus
                            : "ORDERED",
                        expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : "",
                        receivedDate: order.receivedDate ? order.receivedDate.slice(0, 10) : ""
                    };
                });
                return nextForms;
            });
        } catch (error) {
            console.error("Import pending requests load error:", error);
            setPayload({ pendingOrders: [] });
        } finally {
            setLoading(false);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        try {
            const raw = localStorage.getItem("user");
            const parsed = raw ? JSON.parse(raw) : {};
            setUserId(Number(parsed?.id || 0) || null);
        } catch {
            setUserId(null);
        }
        void load();
    }, []);

    const updateForm = (orderId: number, key: "status" | "expectedDate" | "receivedDate", value: string) => {
        setForms((current) => {
            const previous = current[orderId] || {
                status: "ORDERED",
                expectedDate: "",
                receivedDate: ""
            };

            return {
                ...current,
                [orderId]: {
                    ...previous,
                    [key]: value
                } as { status: ImportEditableStatus; expectedDate: string; receivedDate: string }
            };
        });
    };

    const save = async (order: ImportOrder) => {
        const form = forms[order.id] || {
            status: "ORDERED" as ImportEditableStatus,
            expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : "",
            receivedDate: order.receivedDate ? order.receivedDate.slice(0, 10) : ""
        };
        const currentStatus = String(order.status || "").toUpperCase();
        const nextStatus = form.status;
        if (nextStatus === "RECEIVED" && currentStatus === "RECEIVED") {
            setFeedback("Cette demande a déjà été confirmée comme reçue.");
            return;
        }

        if (nextStatus === "ORDERED" && !form.expectedDate) {
            setFeedback("La date prévisionnelle est obligatoire pour lancer la commande.");
            return;
        }

        if (nextStatus === "RECEIVED" && !form.receivedDate) {
            setFeedback("La date effective de réception est obligatoire.");
            return;
        }

        setSaving(true);
        setFeedback("");
        try {
            const response = await fetch(`/api/commandes/${order.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceType: "IMPORT",
                    status: nextStatus,
                    expectedDate: nextStatus === "ORDERED" || nextStatus === "SHIPPED" ? form.expectedDate : undefined,
                    receivedDate: nextStatus === "RECEIVED" ? form.receivedDate : undefined,
                    userId
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || "Mise à jour impossible.");
            setFeedback(nextStatus === "ORDERED" ? "Commande lancée avec succès." : nextStatus === "SHIPPED" ? "Commande expédiée avec succès." : "Réception import confirmée avec succès.");
            await load();
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant la mise à jour.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.emptyState}>Chargement des demandes import...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.dashboardContainer}>
            <div style={{ display: "grid", gap: "1rem" }}>
                <section className={panelStyles.sectionCard}>
                    <h2 className={panelStyles.sectionTitle} style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                        <PackageSearch size={18} /> Demandes import à traiter
                    </h2>
                    {payload.pendingOrders.length === 0 ? (
                        <div className={styles.emptyState}>Aucune demande import en attente.</div>
                    ) : (
                        <div className={panelStyles.tableWrap}>
                            <table className={panelStyles.table} style={{ minWidth: 1220 }}>
                                <thead>
                                    <tr>
                                        <th>Demande import</th>
                                        <th>Statut actuel</th>
                                        <th>Date de demande</th>
                                        <th>Demandeur</th>
                                        <th>Ticket lié</th>
                                        <th>Client</th>
                                        <th>Matériel</th>
                                        <th>Pièce demandée</th>
                                        <th>Quantité</th>
                                        <th>Date prévisionnelle</th>
                                        <th>Date de réception</th>
                                        <th>Statut</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payload.pendingOrders.map((order) => {
                                        const summary = parseImportRequestNotes(order.notes);
                                        const part = findRequestedPartFromChecklist(order) || summary.requestedPart;
                                        const materials = getOrderMaterialDetails(order);
                                        const material = materials[0] || summary.material || {
                                            designation: order.equipment?.name || "-",
                                            serialNumber: order.equipment?.serialNumber || "",
                                            pn: ""
                                        };
                                        const firstItem = order.items[0];
                                        const rowForm = forms[order.id] || {
                                            status: IMPORT_EDITABLE_STATUSES.some((item) => item.value === String(order.status || "").toUpperCase())
                                                ? String(order.status || "").toUpperCase() as ImportEditableStatus
                                                : "ORDERED",
                                            expectedDate: order.expectedDate ? order.expectedDate.slice(0, 10) : "",
                                            receivedDate: order.receivedDate ? order.receivedDate.slice(0, 10) : ""
                                        };
                                        return (
                                            <tr key={order.id}>
                                                <td>
                                                    <strong>{formatImportRef(order.ref)}</strong>
                                                </td>
                                                <td>{getImportStatusLabel(order.status)}</td>
                                                <td>{formatDateTime(order.createdAt)}</td>
                                                <td>{order.creator?.name || "-"}</td>
                                                <td>{order.ticket ? `#${(order.ticket as any).ticketReference || (order.ticket as any).displayId || order.ticket.id}` : "-"}</td>
                                                <td>{order.equipment?.client || "-"}</td>
                                                <td>
                                                    <strong>{material.designation || "-"}</strong>
                                                    <div className={panelStyles.itemMeta}>SN: {material.serialNumber || "-"}</div>
                                                    <div className={panelStyles.itemMeta}>PN: {material.pn || "-"}</div>
                                                </td>
                                                <td>
                                                    <strong>{firstItem?.name || part.designation || "-"}</strong>
                                                    <div className={panelStyles.itemMeta}>Référence: {part.reference || firstItem?.ref || "-"}</div>
                                                    {part.supplierCode ? <div className={panelStyles.itemMeta}>Code fournisseur: {part.supplierCode}</div> : null}
                                                    {part.articleCode || firstItem?.ref ? <div className={panelStyles.itemMeta}>Code article: {part.articleCode || firstItem?.ref}</div> : null}
                                                </td>
                                                <td>{firstItem?.qty ?? part.quantity ?? "-"}</td>
                                                <td>
                                                    <input
                                                        type="date"
                                                        value={rowForm.expectedDate}
                                                        onChange={(event) => updateForm(order.id, "expectedDate", event.target.value)}
                                                        className={panelStyles.input}
                                                        style={{ minWidth: 150 }}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="date"
                                                        value={rowForm.receivedDate}
                                                        onChange={(event) => updateForm(order.id, "receivedDate", event.target.value)}
                                                        className={panelStyles.input}
                                                        style={{ minWidth: 150 }}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        value={rowForm.status}
                                                        onChange={(event) => updateForm(order.id, "status", event.target.value)}
                                                        className={panelStyles.select}
                                                        style={{ minWidth: 180 }}
                                                    >
                                                        {IMPORT_EDITABLE_STATUSES.map((item) => (
                                                            <option key={item.value} value={item.value}>{item.label}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <button className="btn btn-primary" onClick={() => save(order)} disabled={saving || String(order.status || "").toUpperCase() === "RECEIVED"}>
                                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                        Enregistrer
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {feedback ? (
                        <div style={{ marginTop: "0.7rem", color: "var(--primary-blue)", fontWeight: 600 }}>{feedback}</div>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "demandes a traiter" de l espace "import".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
