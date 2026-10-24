"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { parseChecklistPayload } from "@/metier/workflow-client";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import type { EntryRepairSlipForm } from "@/metier/ticket-entree";

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
        savHistory?: Array<{ action?: string | null; note?: string | null; createdAt?: string | null }>;
    } | null;
};

function getStatusLabel(value: unknown) {
    const normalized = String(value || "").toUpperCase();
    const labels: Record<string, string> = {
        PENDING: "En attente",
        PENDING_ADV: "En attente ADV",
        PENDING_ADV_VERIFICATION: "Vérification ADV",
        PENDING_STORE_REVIEW: "En cours",
        PENDING_TECHNICAL_MANAGER_REVIEW: "Validation responsable technique",
        READY_FOR_TECH_MANAGER_ASSIGNMENT: "Affectation responsable technique",
        TAKEN_IN_CHARGE: "Pris en charge",
        NOT_TAKEN_IN_CHARGE: "Non pris en charge",
        PENDING_ADV_QUOTE: "Devis à préparer",
        QUOTE_SENT_TO_CLIENT: "Devis envoyé au client",
        QUOTE_APPROVED: "Devis validé",
        QUOTE_REJECTED: "Devis refusé",
        READY_FOR_DELIVERY: "Matériel réparé à livrer",
        CLOSED: "Clôturé"
    };
    return labels[normalized] || "En cours";
}

function normalizeForm(slip: any, item: ReclamationItem): EntryRepairSlipForm {
    const metadata = parseChecklistPayload(item.checklist).metadata as any;
    const firstName = String(slip?.clientFirstName || metadata?.firstName || "").trim();
    const lastName = String(slip?.clientLastName || metadata?.lastName || item.customerName || "").trim();
    const specialty = String(metadata?.specialty || "").trim() === "AUTRE"
        ? String(metadata?.specialtyOther || "").trim()
        : String(slip?.specialty || metadata?.specialty || "").trim();
    const equipmentItems = Array.isArray(slip?.equipmentItems) && slip.equipmentItems.length > 0
        ? slip.equipmentItems
        : [{
            designation: String(metadata?.equipmentName || metadata?.model || item.deviceModel || "").trim(),
            serialNumber: String(item.serialNumber || "").trim(),
            pn: String(slip?.pn || metadata?.pn || "").trim(),
            articleCode: "",
            quantity: "1"
        }];
    const primary = equipmentItems[0] || {};
    return {
        clientFirstName: firstName,
        clientLastName: lastName,
        clientCode: String(slip?.clientCode || metadata?.clientCode || "").trim(),
        city: String(slip?.city || metadata?.city || "Rabat").trim(),
        phone: String(slip?.phone || item.phone || "").trim(),
        mobilePhones: Array.isArray(slip?.mobilePhones) ? slip.mobilePhones : [String(item.phone || "").trim()].filter(Boolean),
        landlinePhone: String(slip?.landlinePhone || "").trim(),
        email: String(slip?.email || item.contactEmail || "").trim(),
        sageCode: String(slip?.sageCode || "").trim(),
        specialty,
        designation: String(primary.designation || item.deviceModel || "").trim(),
        serialNumber: String(primary.serialNumber || item.serialNumber || "").trim(),
        pn: String(primary.pn || "").trim(),
        equipmentItems,
        priority: "MEDIUM",
        quantity: "1",
        accessories: String(slip?.accessories || "").trim(),
        failureDescription: String(slip?.failureDescription || item.description || "").trim(),
        diagnosticPrice: String(slip?.diagnosticPrice || 300),
        paymentStatus: String(slip?.diagnosticPaymentStatus || "UNPAID").toUpperCase() === "PAID" ? "PAID" : "UNPAID",
        paymentMethod: String(slip?.diagnosticPaymentMethod || "") as EntryRepairSlipForm["paymentMethod"]
    };
}

function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function FacturationTicketsActifsPage() {
    const router = useRouter();
    const [items, setItems] = useState<ReclamationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/reclamations", { cache: "no-store" });
                const data = await response.json().catch(() => []);
                setItems(Array.isArray(data) ? data : []);
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, []);

    const activeItems = useMemo(() => items.filter((item) => {
        return item.ticket?.id
            && !getAdministrativeClosureAt(item.ticket || {});
    }), [items]);

    const filtered = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return activeItems;
        return activeItems.filter((item) => {
            const metadata = parseChecklistPayload(item.checklist).metadata as any;
            const slip = metadata?.entryRepairSlip || {};
            const ticketReference = item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id;
            return [
                ticketReference,
                item.customerName,
                item.contactEmail,
                item.phone,
                item.serialNumber,
                item.deviceModel,
                slip.clientCode,
                metadata?.clientCode,
                slip.specialty,
                metadata?.specialty,
                metadata?.quote?.amount
            ].join(" ").toLowerCase().includes(query);
        });
    }, [activeItems, searchTerm]);

    const uploadInvoice = async (item: ReclamationItem, file: File | null) => {
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);
        const response = await fetch(`/api/facturation/reclamations/${item.id}/invoice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: file.name, dataUrl })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            alert(payload?.error || "Impossible d'enregistrer la facture.");
            return;
        }
        alert("Facture enregistrée.");
        const refreshed = await fetch("/api/reclamations", { cache: "no-store" }).then((res) => res.json()).catch(() => []);
        setItems(Array.isArray(refreshed) ? refreshed : []);
    };

    if (loading) return <div className={styles.empty}>Chargement des tickets actifs...</div>;

    return (
        <section className={styles.shell}>
            <article className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Tickets actifs</h2>
                <div className={styles.clientsSearchWrap} style={{ marginTop: "0.85rem" }}>
                    <input className={styles.input} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Rechercher par ticket, client, code client, SN..." />
                </div>
                <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
                    {filtered.length === 0 ? <div className={styles.empty}>Aucun ticket actif.</div> : filtered.map((item) => {
                        const metadata = parseChecklistPayload(item.checklist).metadata as any;
                        const slip = metadata?.entryRepairSlip || {};
                        const quote = metadata?.quote || {};
                        const invoice = metadata?.facturationInvoice;
                        const ticketReference = String(item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id);
                        const formPreview = normalizeForm(slip, item);
                        return (
                            <article key={item.id} className={styles.listItem} style={{ display: "grid", gap: "0.65rem" }}>
                                <div className={styles.itemMain}>
                                    <div>
                                        <div className={styles.itemTitle}>Ticket #{ticketReference}</div>
                                        <div className={styles.itemMeta}>{item.customerName} · {item.deviceModel} · SN: {item.serialNumber || "-"}</div>
                                    </div>
                                    <span className={styles.statusBadge}>{getStatusLabel(item.status)}</span>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.55rem" }}>
                                    <div className={styles.itemMeta}><strong>Prénom:</strong> {formPreview.clientFirstName || "-"}</div>
                                    <div className={styles.itemMeta}><strong>Nom:</strong> {formPreview.clientLastName || "-"}</div>
                                    <div className={styles.itemMeta}><strong>Code client:</strong> {formPreview.clientCode || "-"}</div>
                                    <div className={styles.itemMeta}><strong>Spécialité:</strong> {formPreview.specialty || "-"}</div>
                                    <div className={styles.itemMeta}><strong>E-mail:</strong> {formPreview.email || "-"}</div>
                                    <div className={styles.itemMeta}><strong>Téléphone:</strong> {formPreview.mobilePhones.join(" / ") || item.phone || "-"}</div>
                                </div>
                                {quote?.amount || quote?.documents?.length ? (
                                    <div className={styles.itemMeta} style={{ display: "grid", gap: "0.35rem" }}>
                                        <div><strong>Devis:</strong> {quote?.amount ? `${quote.amount} MAD` : "Document disponible"}</div>
                                        {Array.isArray(quote?.documents) && quote.documents.length > 0 ? (
                                            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                                                {quote.documents.map((document: any, index: number) => (
                                                    document?.dataUrl ? (
                                                        <a
                                                            key={`${document.name || "devis"}-${index}`}
                                                            href={String(document.dataUrl)}
                                                            download={String(document.name || `devis-${index + 1}`)}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className={styles.notificationLink}
                                                        >
                                                            Télécharger le devis {document.name ? `: ${document.name}` : ""}
                                                        </a>
                                                    ) : null
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                                {invoice?.dataUrl ? (
                                    <a href={invoice.dataUrl} target="_blank" rel="noreferrer" className={styles.notificationLink}>
                                        Facture intégrée: {invoice.name || "Facture"}
                                    </a>
                                ) : null}
                                <div className={styles.actions}>
                                    <button className="btn btn-outline" type="button" onClick={() => router.push(`/facturation/Ticket-entree?reclamationId=${item.id}`)}>
                                        <FileText size={14} />
                                        Remplir le ticket créé
                                    </button>
                                    <label className="btn btn-primary">
                                        <Upload size={14} />
                                        Intégrer la facture
                                        <input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={(event) => uploadInvoice(item, event.target.files?.[0] || null)} />
                                    </label>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </article>
        </section>
    );
}
