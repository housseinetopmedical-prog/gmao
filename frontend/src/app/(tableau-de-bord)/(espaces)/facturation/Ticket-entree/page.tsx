"use client";

/*
Commentaire simple du fichier :
- Espace : facturation.
- Partie : Ticket entree.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useState } from "react";
import { useEffect } from "react";
import { Plus, ReceiptText, Save, Trash2 } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { stringifyChecklistPayload } from "@/metier/workflow-client";
import type {
    EntryRepairSlipDocument,
    EntryRepairSlipEquipmentItem,
    EntryRepairSlipForm,
    EntryRepairSlipPaymentMethod
} from "@/metier/ticket-entree";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type IntakeForm = EntryRepairSlipForm;

const EMPTY_EQUIPMENT: EntryRepairSlipEquipmentItem = {
    designation: "",
    serialNumber: "",
    pn: "",
    articleCode: "",
    quantity: "1"
};

const INITIAL_FORM: IntakeForm = {
    clientFirstName: "",
    clientLastName: "",
    clientCode: "",
    city: "Rabat",
    phone: "",
    mobilePhones: [""],
    landlinePhone: "",
    email: "",
    sageCode: "",
    specialty: "",
    designation: "",
    serialNumber: "",
    pn: "",
    equipmentItems: [{ ...EMPTY_EQUIPMENT }],
    priority: "MEDIUM",
    quantity: "1",
    accessories: "",
    failureDescription: "",
    diagnosticPrice: "300",
    paymentStatus: "UNPAID",
    paymentMethod: ""
};

async function downloadEntrySlipOnDemand(slip: EntryRepairSlipDocument) {
    const { downloadEntryRepairSlip } = await import("@/metier/ticket-entree");
    downloadEntryRepairSlip(slip);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getLocalUser() {
    try {
        const raw = localStorage.getItem("user");
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            id: Number(parsed?.id || 0) || null,
            name: String(parsed?.name || "")
        };
    } catch {
        return {
            id: null,
            name: ""
        };
    }
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizePhoneList(phones: string[]) {
    return phones.map((item) => String(item || "").trim()).filter(Boolean);
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function normalizeEquipmentItems(items: EntryRepairSlipEquipmentItem[]) {
    return items
        .slice(0, 1)
        .map((item) => ({
            designation: String(item.designation || "").trim(),
            serialNumber: String(item.serialNumber || "").trim(),
            pn: String(item.pn || "").trim(),
            articleCode: String(item.articleCode || "").trim(),
            quantity: "1"
        }))
        .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

function parseAccessories(value: string) {
    return String(value || "")
        .split("\n")
        .map((item) => item.replace(/^\s*\d+\s*[.)-]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 10);
}

function parseAccessoryInputs(value: string) {
    const rows = String(value || "")
        .split("\n")
        .map((item) => item.replace(/^\s*\d+\s*[.)-]\s*/, "").trim())
        .slice(0, 10);
    return rows.length > 0 ? rows : [""];
}

function formatAccessoryInputs(items: string[]) {
    return items
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${item.trim()}`)
        .join("\n");
}

function formatAccessories(items: string[]) {
    return items
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");
}

function formatPaymentMethodLabel(value: EntryRepairSlipPaymentMethod) {
    if (value === "CASH") return "Espèces";
    if (value === "CHECK") return "Chèque";
    if (value === "CARD") return "CB";
    if (value === "INSTANT_TRANSFER") return "Virement instantané";
    if (value === "NORMAL_TRANSFER") return "Virement normal";
    return "Non renseigné";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function buildDescription(form: IntakeForm, normalizedMobilePhones: string[], equipmentItems: EntryRepairSlipEquipmentItem[]) {
    const primaryEquipment = equipmentItems[0] || EMPTY_EQUIPMENT;
    const materialLines = [
        `Matériel: ${primaryEquipment.designation || "Non renseigné"}`,
        `SN matériel: ${primaryEquipment.serialNumber || "Non renseigné"}`,
        primaryEquipment.pn ? `PN matériel: ${primaryEquipment.pn}` : "",
        primaryEquipment.articleCode ? `Code article matériel: ${primaryEquipment.articleCode}` : ""
    ];

    return [
        "Ticket créé saisi lors du dépôt physique.",
        `Client: ${`${form.clientFirstName} ${form.clientLastName}`.trim() || "Non renseigné"}`,
        form.clientCode ? `Code client: ${form.clientCode}` : "",
        form.specialty ? `Spécialité: ${form.specialty}` : "",
        `Ville d'intervention: ${form.city || "Non renseignée"}`,
        `Portable(s): ${normalizedMobilePhones.join(" / ") || "Non renseigné"}`,
        `Fixe: ${form.landlinePhone || "Non renseigné"}`,
        ...materialLines,
        `Priorité: ${form.priority === "LOW" ? "Faible" : form.priority === "MEDIUM" ? "Moyenne" : form.priority === "HIGH" ? "Élevée" : "Critique"}`,
        `Accessoires: ${form.accessories || "Aucun accessoire précisé"}`,
        `Description de la panne: ${form.failureDescription || "Non renseignée"}`,
        `Prix diagnostic: ${form.diagnosticPrice} DH`,
        `Paiement diagnostic: ${form.paymentStatus === "PAID" ? "Payé" : "Non payé"}`,
        form.paymentStatus === "PAID"
            ? `Mode de paiement: ${formatPaymentMethodLabel(form.paymentMethod)}`
            : ""
    ]
        .filter(Boolean)
        .join("\n");
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function TicketEntreePage() {
    const [form, setForm] = useState<IntakeForm>(INITIAL_FORM);
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [linkedReclamationId, setLinkedReclamationId] = useState<number | null>(null);
    const [linkedTicketReference, setLinkedTicketReference] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const reclamationId = Number(params.get("reclamationId") || 0);
        if (!Number.isFinite(reclamationId) || reclamationId <= 0) return;

        const loadTicket = async () => {
            const response = await fetch(`/api/reclamations/${reclamationId}`, { cache: "no-store" });
            const item = await response.json().catch(() => null);
            if (!response.ok || !item) return;

            const { parseChecklistPayload } = await import("@/metier/workflow-client");
            const metadata = parseChecklistPayload(item.checklist).metadata as any;
            const slip = metadata?.entryRepairSlip || {};
            const equipmentItems = Array.isArray(slip?.equipmentItems) && slip.equipmentItems.length > 0
                ? slip.equipmentItems
                : [{
                    designation: String(metadata?.equipmentName || metadata?.model || item.deviceModel || "").trim(),
                    serialNumber: String(item.serialNumber || "").trim(),
                    pn: String(slip?.pn || metadata?.pn || "").trim(),
                    articleCode: "",
                    quantity: "1"
                }];
            const names = String(item.customerName || "").trim().split(" ");
            const firstName = String(slip?.clientFirstName || metadata?.firstName || names.slice(0, -1).join(" ") || "").trim();
            const lastName = String(slip?.clientLastName || metadata?.lastName || names.at(-1) || item.customerName || "").trim();
            const specialty = String(metadata?.specialty || "").trim() === "AUTRE"
                ? String(metadata?.specialtyOther || "").trim()
                : String(slip?.specialty || metadata?.specialty || "").trim();

            setLinkedReclamationId(reclamationId);
            setLinkedTicketReference(String(item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || reclamationId));
            setForm({
                ...INITIAL_FORM,
                clientFirstName: firstName,
                clientLastName: lastName,
                clientCode: String(slip?.clientCode || metadata?.clientCode || "").trim(),
                city: String(slip?.city || metadata?.city || "Rabat").trim(),
                phone: String(slip?.phone || item.phone || "").trim(),
                mobilePhones: Array.isArray(slip?.mobilePhones) && slip.mobilePhones.length > 0 ? slip.mobilePhones : [String(item.phone || "").trim()].filter(Boolean),
                landlinePhone: String(slip?.landlinePhone || metadata?.phoneFixed || "").trim(),
                email: String(slip?.email || item.contactEmail || "").trim(),
                sageCode: String(slip?.sageCode || "").trim(),
                specialty,
                designation: String(equipmentItems[0]?.designation || item.deviceModel || "").trim(),
                serialNumber: String(equipmentItems[0]?.serialNumber || item.serialNumber || "").trim(),
                pn: String(equipmentItems[0]?.pn || "").trim(),
                equipmentItems,
                accessories: String(slip?.accessories || metadata?.accessories || "").trim(),
                failureDescription: String(slip?.failureDescription || item.description || "").trim(),
                diagnosticPrice: String(slip?.diagnosticPrice || "300"),
                paymentStatus: String(slip?.diagnosticPaymentStatus || "UNPAID").toUpperCase() === "PAID" ? "PAID" : "UNPAID",
                paymentMethod: String(slip?.diagnosticPaymentMethod || "") as EntryRepairSlipPaymentMethod
            });
        };

        void loadTicket();
    }, []);

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleChange = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleMobilePhoneChange = (index: number, value: string) => {
        setForm((prev) => ({
            ...prev,
            mobilePhones: prev.mobilePhones.map((item, itemIndex) => (itemIndex === index ? value : item))
        }));
    };

    const addMobilePhone = () => {
        setForm((prev) => ({
            ...prev,
            mobilePhones: [...prev.mobilePhones, ""]
        }));
    };

    const removeMobilePhone = (index: number) => {
        setForm((prev) => {
            const next = prev.mobilePhones.filter((_, itemIndex) => itemIndex !== index);
            return {
                ...prev,
                mobilePhones: next.length > 0 ? next : [""]
            };
        });
    };

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleEquipmentChange = <K extends keyof EntryRepairSlipEquipmentItem>(index: number, key: K, value: EntryRepairSlipEquipmentItem[K]) => {
        setForm((prev) => ({
            ...prev,
            equipmentItems: prev.equipmentItems.map((item, itemIndex) => (
                itemIndex === index ? { ...item, [key]: value } : item
            ))
        }));
    };

    const visibleAccessoryItems = parseAccessoryInputs(form.accessories);

    const updateAccessory = (index: number, value: string) => {
        const next = [...visibleAccessoryItems];
        next[index] = value;
        handleChange("accessories", formatAccessoryInputs(next));
    };

    const addAccessory = () => {
        if (visibleAccessoryItems.length >= 10) return;
        handleChange("accessories", formatAccessoryInputs([...visibleAccessoryItems, ""]));
    };

    const removeAccessory = (index: number) => {
        const next = visibleAccessoryItems.filter((_, itemIndex) => itemIndex !== index);
        handleChange("accessories", formatAccessoryInputs(next.length > 0 ? next : [""]));
    };

    const setPaymentMethod = (value: EntryRepairSlipPaymentMethod) => {
        setForm((prev) => ({
            ...prev,
            paymentMethod: prev.paymentMethod === value ? "" : value
        }));
    };

    const submitIntake = async () => {
        const user = getLocalUser();
        const normalizedMobilePhones = normalizePhoneList(form.mobilePhones);
        const primaryPhone = normalizedMobilePhones[0] || "";
        const normalizedEquipmentItems = normalizeEquipmentItems(form.equipmentItems);
        const primaryEquipment = normalizedEquipmentItems[0] || EMPTY_EQUIPMENT;
        const missingFields: string[] = [];

        if (!form.clientLastName.trim()) missingFields.push("Nom client");
        if (!form.city.trim()) missingFields.push("Ville d'intervention");
        if (!primaryPhone) missingFields.push("Portable");
        if (normalizedEquipmentItems.length === 0) missingFields.push("Matériel");
        if (!primaryEquipment.designation) missingFields.push("Désignation du matériel principal");
        if (!primaryEquipment.serialNumber) missingFields.push("SN du matériel principal");
        if (form.paymentStatus === "PAID" && !form.paymentMethod) missingFields.push("Mode de paiement");

        if (missingFields.length > 0) {
            setFeedback({ type: "error", text: `Champs obligatoires manquants: ${missingFields.join(", ")}` });
            return;
        }

        setSaving(true);
        setFeedback(null);

        try {
            const submittedAt = new Date().toISOString();
            const totalQuantity = normalizedEquipmentItems.reduce((sum, item) => sum + (Number(item.quantity || 1) || 1), 0);
            const normalizedForm: IntakeForm = {
                ...form,
                phone: primaryPhone,
                mobilePhones: normalizedMobilePhones,
                designation: primaryEquipment.designation,
                serialNumber: primaryEquipment.serialNumber,
                pn: primaryEquipment.pn,
                equipmentItems: normalizedEquipmentItems,
                quantity: String(totalQuantity || 1),
                accessories: formatAccessories(parseAccessories(form.accessories))
            };

            const checklist = stringifyChecklistPayload({
                metadata: {
                    firstName: form.clientFirstName.trim(),
                    lastName: form.clientLastName.trim(),
                    city: form.city.trim(),
                    equipmentName: primaryEquipment.designation,
                    urgency: form.priority,
                    pn: primaryEquipment.pn || null,
                    source: "ENTRY_REPAIR_SLIP",
                    submittedByRole: "RESPONSABLE_FACTURATION",
                    entryRepairSlip: {
                        sageCode: String(form.sageCode || "").trim() || null,
                        designation: primaryEquipment.designation,
                        serialNumber: primaryEquipment.serialNumber,
                        pn: primaryEquipment.pn || null,
                        city: form.city.trim(),
                        equipmentItems: normalizedEquipmentItems.map((item) => ({
                            designation: item.designation,
                            serialNumber: item.serialNumber,
                            pn: item.pn || null,
                            articleCode: item.articleCode || null,
                            quantity: Number(item.quantity || 1) || 1
                        })),
                        priority: form.priority,
                        quantity: totalQuantity || 1,
                        accessories: formatAccessories(parseAccessories(form.accessories)) || null,
                        failureDescription: form.failureDescription.trim() || null,
                        clientFirstName: form.clientFirstName.trim(),
                        clientLastName: form.clientLastName.trim(),
                        clientCode: String(form.clientCode || "").trim() || null,
                        specialty: String(form.specialty || "").trim() || null,
                        phone: primaryPhone,
                        mobilePhones: normalizedMobilePhones,
                        landlinePhone: form.landlinePhone.trim() || null,
                        email: form.email.trim().toLowerCase(),
                        diagnosticPrice: Number(form.diagnosticPrice || 300) || 300,
                        diagnosticPaymentStatus: form.paymentStatus,
                        diagnosticPaymentMethod: form.paymentStatus === "PAID" ? form.paymentMethod : null,
                        submittedAt,
                        submittedByUserId: user.id
                    }
                }
            });

            const response = await fetch(linkedReclamationId ? `/api/facturation/reclamations/${linkedReclamationId}/created-ticket-info` : "/api/reclamations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(linkedReclamationId
                    ? {
                        clientCode: normalizedForm.clientCode,
                        specialty: normalizedForm.specialty,
                        city: normalizedForm.city,
                        designation: normalizedForm.designation,
                        serialNumber: normalizedForm.serialNumber,
                        pn: normalizedForm.pn,
                        equipmentItems: normalizedForm.equipmentItems,
                        quantity: normalizedForm.quantity,
                        priority: normalizedForm.priority,
                        accessories: normalizedForm.accessories,
                        diagnosticPrice: normalizedForm.diagnosticPrice,
                        paymentStatus: normalizedForm.paymentStatus,
                        paymentMethod: normalizedForm.paymentMethod,
                        failureDescription: normalizedForm.failureDescription
                    }
                    : {
                        customerName: `${form.clientFirstName.trim()} ${form.clientLastName.trim()}`.trim(),
                        contactEmail: form.email.trim().toLowerCase(),
                        phone: primaryPhone,
                        serialNumber: primaryEquipment.serialNumber,
                        deviceModel: primaryEquipment.designation,
                        description: buildDescription(normalizedForm, normalizedMobilePhones, normalizedEquipmentItems),
                        interventionType: "WORKSHOP",
                        checklist
                    })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Impossible de créer le ticket d'entrée.");
            }

            await downloadEntrySlipOnDemand({
                reclamationId: linkedReclamationId || Number(data.id),
                ticketReference: linkedTicketReference || (typeof data?.ticketReference === "string" ? data.ticketReference : null),
                submittedAt,
                form: normalizedForm
            });

            setFeedback({
                type: "success",
                text: "Ticket créé enregistré."
            });
            if (!linkedReclamationId) setForm(INITIAL_FORM);
        } catch (error) {
            setFeedback({
                type: "error",
                text: error instanceof Error ? error.message : "Erreur lors de la création du ticket d'entrée."
            });
        } finally {
            setSaving(false);
        }
    };

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.shell}>
            <article className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>
                    <ReceiptText size={16} style={{ marginRight: "0.35rem", verticalAlign: "text-bottom" }} />
                    Ticket créé
                </h2>

                <div className={styles.formGrid2} style={{ marginTop: "0.8rem" }}>
                    <div className={styles.field}>
                        <label className={styles.label}>Prénom du client</label>
                        <input className={styles.input} value={form.clientFirstName} onChange={(e) => handleChange("clientFirstName", e.target.value)} placeholder="Prénom" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Nom du client</label>
                        <input className={styles.input} value={form.clientLastName} onChange={(e) => handleChange("clientLastName", e.target.value)} placeholder="Nom" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Code client</label>
                        <input className={styles.input} value={form.clientCode || ""} onChange={(e) => handleChange("clientCode", e.target.value)} placeholder="Optionnel" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Spécialité</label>
                        <input className={styles.input} value={form.specialty || ""} onChange={(e) => handleChange("specialty", e.target.value)} placeholder="Spécialité" />
                    </div>
                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                        <label className={styles.label}>Portable(s)</label>
                        <div style={{ display: "grid", gap: "0.6rem" }}>
                            {form.mobilePhones.map((phone, index) => (
                                <div key={`mobile-phone-${index}`} style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                                    <input
                                        className={styles.input}
                                        value={phone}
                                        onChange={(e) => handleMobilePhoneChange(index, e.target.value)}
                                        placeholder={`Portable ${index + 1}`}
                                        style={{ flex: 1 }}
                                    />
                                    {form.mobilePhones.length > 1 ? (
                                        <button className="btn btn-outline" type="button" onClick={() => removeMobilePhone(index)}>
                                            <Trash2 size={14} />
                                        </button>
                                    ) : null}
                                </div>
                            ))}
                            <div>
                                <button className="btn btn-outline" type="button" onClick={addMobilePhone}>
                                    <Plus size={14} />
                                    Ajouter un portable
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Fixe</label>
                        <input className={styles.input} value={form.landlinePhone} onChange={(e) => handleChange("landlinePhone", e.target.value)} placeholder="Téléphone fixe" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>E-mail</label>
                        <input className={styles.input} type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} placeholder="client@exemple.ma" />
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Ville d'intervention</label>
                        <select className={styles.select} value={form.city} onChange={(e) => handleChange("city", e.target.value)}>
                            <option value="Rabat">Rabat</option>
                            <option value="Fès">Fès</option>
                            <option value="Marrakech">Marrakech</option>
                            <option value="Casa">Casa</option>
                        </select>
                    </div>
                </div>

                <div style={{ marginTop: "0.8rem" }}>
                    <div style={{ display: "grid", gap: "0.8rem" }}>
                        {form.equipmentItems.slice(0, 1).map((equipmentItem, index) => (
                            <div key={`equipment-item-${index}`} className={styles.listItem} style={{ display: "grid", gap: "0.7rem" }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.7rem", flexWrap: "wrap" }}>
                                    <strong>Matériel</strong>
                                </div>
                                <div className={styles.formGrid2}>
                                    <div className={styles.field}>
                                        <label className={styles.label}>Désignation</label>
                                        <input
                                            className={styles.input}
                                            value={equipmentItem.designation}
                                            onChange={(e) => handleEquipmentChange(index, "designation", e.target.value)}
                                            placeholder="Matériel"
                                        />
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.label}>SN</label>
                                        <input
                                            className={styles.input}
                                            value={equipmentItem.serialNumber}
                                            onChange={(e) => handleEquipmentChange(index, "serialNumber", e.target.value)}
                                            placeholder="SN principal"
                                        />
                                    </div>
                                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                                        <label className={styles.label}>PN</label>
                                        <input
                                            className={styles.input}
                                            value={equipmentItem.pn}
                                            onChange={(e) => handleEquipmentChange(index, "pn", e.target.value)}
                                            placeholder="PN si disponible"
                                        />
                                    </div>
                                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                                        <label className={styles.label}>Code article</label>
                                        <input
                                            className={styles.input}
                                            value={equipmentItem.articleCode || ""}
                                            onChange={(e) => handleEquipmentChange(index, "articleCode", e.target.value)}
                                            placeholder="Optionnel"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={styles.formGrid2} style={{ marginTop: "0.8rem" }}>
                    <div className={styles.field}>
                        <label className={styles.label}>Priorité du ticket</label>
                        <select className={styles.select} value={form.priority} onChange={(e) => handleChange("priority", e.target.value as IntakeForm["priority"])}>
                            <option value="LOW">Faible</option>
                            <option value="MEDIUM">Moyenne</option>
                            <option value="HIGH">Élevée</option>
                            <option value="CRITICAL">Critique</option>
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.label}>Prix diagnostic</label>
                        <input className={styles.input} value={`${form.diagnosticPrice} DH`} readOnly />
                    </div>
                </div>

                <div className={styles.field} style={{ marginTop: "0.8rem" }}>
                    <label className={styles.label}>Accessoires déposés avec le matériel</label>
                    <div style={{ display: "grid", gap: "0.55rem" }}>
                        {visibleAccessoryItems.map((accessory, index) => (
                            <div key={`accessory-${index}`} style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
                                <span style={{ minWidth: "1.4rem", fontWeight: 700 }}>{index + 1}.</span>
                                <input
                                    className={styles.input}
                                    value={accessory}
                                    onChange={(e) => updateAccessory(index, e.target.value)}
                                    placeholder={`Accessoire ${index + 1}`}
                                    style={{ flex: 1 }}
                                />
                                {visibleAccessoryItems.length > 1 ? (
                                    <button className="btn btn-outline" type="button" onClick={() => removeAccessory(index)}>
                                        <Trash2 size={14} />
                                    </button>
                                ) : null}
                            </div>
                        ))}
                        {visibleAccessoryItems.length < 10 ? (
                            <div>
                                <button className="btn btn-outline" type="button" onClick={addAccessory}>
                                    <Plus size={14} />
                                    Ajouter un accessoire
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className={styles.field} style={{ marginTop: "0.8rem" }}>
                    <label className={styles.label}>Description de la panne (infos client)</label>
                    <textarea className={styles.textarea} value={form.failureDescription} onChange={(e) => handleChange("failureDescription", e.target.value)} placeholder="Décrire la panne constatée..." />
                </div>

                <div className={styles.field} style={{ marginTop: "0.8rem" }}>
                    <label className={styles.label}>Paiement diagnostic</label>
                    <div className={styles.actions}>
                        <label className={styles.listItem}>
                            <input type="checkbox" checked={form.paymentStatus === "PAID"} onChange={() => handleChange("paymentStatus", "PAID")} />
                            <span style={{ marginLeft: "0.45rem" }}>Payé</span>
                        </label>
                        <label className={styles.listItem}>
                            <input type="checkbox" checked={form.paymentStatus === "UNPAID"} onChange={() => handleChange("paymentStatus", "UNPAID")} />
                            <span style={{ marginLeft: "0.45rem" }}>Non payé</span>
                        </label>
                    </div>
                </div>

                {form.paymentStatus === "PAID" ? (
                    <div className={styles.field} style={{ marginTop: "0.8rem" }}>
                        <label className={styles.label}>Mode de paiement</label>
                        <div className={styles.actions}>
                            <label className={styles.listItem}>
                                <input type="checkbox" checked={form.paymentMethod === "CASH"} onChange={() => setPaymentMethod("CASH")} />
                                <span style={{ marginLeft: "0.45rem" }}>Espèces</span>
                            </label>
                            <label className={styles.listItem}>
                                <input type="checkbox" checked={form.paymentMethod === "CHECK"} onChange={() => setPaymentMethod("CHECK")} />
                                <span style={{ marginLeft: "0.45rem" }}>Chèque</span>
                            </label>
                            <label className={styles.listItem}>
                                <input type="checkbox" checked={form.paymentMethod === "CARD"} onChange={() => setPaymentMethod("CARD")} />
                                <span style={{ marginLeft: "0.45rem" }}>CB</span>
                            </label>
                            <label className={styles.listItem}>
                                <input type="checkbox" checked={form.paymentMethod === "INSTANT_TRANSFER"} onChange={() => setPaymentMethod("INSTANT_TRANSFER")} />
                                <span style={{ marginLeft: "0.45rem" }}>Virement instantané</span>
                            </label>
                            <label className={styles.listItem}>
                                <input type="checkbox" checked={form.paymentMethod === "NORMAL_TRANSFER"} onChange={() => setPaymentMethod("NORMAL_TRANSFER")} />
                                <span style={{ marginLeft: "0.45rem" }}>Virement normal</span>
                            </label>
                        </div>
                    </div>
                ) : null}

                {feedback ? (
                    <div
                        className={styles.listItem}
                        style={{
                            marginTop: "0.85rem",
                            borderLeft: `4px solid ${feedback.type === "success" ? "#16a34a" : "#ef4444"}`,
                            background: feedback.type === "success" ? "#dcfce7" : "#fee2e2"
                        }}
                    >
                        <div>{feedback.text}</div>
                    </div>
                ) : null}

                <div className={styles.actions} style={{ marginTop: "0.9rem" }}>
                    <button className="btn btn-primary" type="button" onClick={submitIntake} disabled={saving}>
                        <Save size={14} />
                        {saving ? "Enregistrement..." : "Enregistrer"}
                    </button>
                </div>
            </article>
        </section>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "Ticket entree" de l espace "facturation".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
