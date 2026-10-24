"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : devis.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "../adv.module.css";
import { getChecklistMetadata, getReclamationStatusLabel } from "@/metier/workflow-adv";
import { normalizeDocumentUrl } from "@/metier/workflow-client";
import { getTicketEquipmentItems } from "@/metier/materiel-ticket";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    status: string;
    customerName: string;
    contactEmail: string;
    phone?: string | null;
    serialNumber: string;
    deviceModel: string;
    checklist?: string | null;
    ticket?: {
        id: number;
    } | null;
};

// Cette partie explique la forme des donnees utilisees dans le fichier.
type QuoteDocument = {
    id: string;
    name: string;
    url: string;
    type: string;
    title: string;
    size: number;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function cleanText(value: unknown) {
    return String(value || "").trim();
}

function hasDisplayValue(value: unknown) {
    const text = cleanText(value);
    return Boolean(text && text !== "-" && text.toLowerCase() !== "unknown");
}

function formatRepairNature(value: unknown) {
    const normalized = cleanText(value).toUpperCase();
    const labels: Record<string, string> = {
        USED_PART: "Pièce de rechange à utiliser",
        PART_REQUEST: "Pièce de rechange à importer",
        LOCAL_PART_REQUEST: "Achat local de pièce détachée",
        SOFTWARE_UPDATE: "MAJ logiciel",
        PART_TO_MANUFACTURE: "Pièce à fabriquer",
        LABOR: "Main d'oeuvre"
    };
    return labels[normalized] || cleanText(value);
}

function ReportField({ label, value }: { label: string; value: unknown }) {
    if (!hasDisplayValue(value)) return null;
    return (
        <div style={{ border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem", background: "#ffffff", minHeight: "58px" }}>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.78rem", marginBottom: "0.2rem" }}>{label}</div>
            <div style={{ fontWeight: 700, wordBreak: "break-word" }}>{String(value).trim()}</div>
        </div>
    );
}

async function uploadDocument(file: File): Promise<{ name: string; url: string; type: string; size: number }> {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/uploads", {
        method: "POST",
        body: form
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data?.error || `Téléversement impossible pour ${file.name}`);
    }
    return {
        name: String(data.name || file.name),
        url: String(data.url || ""),
        type: String(data.type || file.type || "application/octet-stream"),
        size: Number(data.size || file.size || 0)
    };
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvDevisPage() {
    const searchParams = useSearchParams();
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [sageQuoteNumber, setSageQuoteNumber] = useState("");
    const [documents, setDocuments] = useState<QuoteDocument[]>([]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const forcedReclamationId = useMemo(() => {
        const value = Number(searchParams.get("reclamationId"));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    const fetchReclamations = async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/reclamations?light=1&historyLimit=20");
            const data = await response.json();
            const list = Array.isArray(data) ? data : [];
            const filtered = list.filter((item: Reclamation) =>
                String(item.status || "") === "PENDING_ADV_QUOTE"
            );
            setReclamations(filtered);
            setSelectedId((prev) => {
                if (forcedReclamationId !== null && filtered.some((item: Reclamation) => item.id === forcedReclamationId)) {
                    return forcedReclamationId;
                }
                return prev && filtered.some((item: Reclamation) => item.id === prev) ? prev : filtered[0]?.id || null;
            });
        } catch (error) {
            console.error("ADV devis load error:", error);
            setReclamations([]);
            setSelectedId(null);
        } finally {
            setLoading(false);
        }
    };

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        fetchReclamations();
    }, [forcedReclamationId]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const forcedId = Number(searchParams.get("reclamationId"));
        if (!Number.isFinite(forcedId) || forcedId <= 0) return;
        setSelectedId(forcedId);
    }, [searchParams]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const selected = useMemo(
        () => reclamations.find((item) => item.id === selectedId) || null,
        [reclamations, selectedId]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const meta = useMemo(() => getChecklistMetadata(selected), [selected]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const technicalDiagnosis = useMemo(() => (meta as any)?.technicalDiagnosis || {}, [meta]);
    const repairEntries = useMemo(
        () => Array.isArray((technicalDiagnosis as any).repairEntries) ? (technicalDiagnosis as any).repairEntries : [],
        [technicalDiagnosis]
    );
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const materialDetails = useMemo(() => {
        const metadata = meta as any;
        const fallbackName = cleanText(metadata?.entryRepairSlip?.designation)
            || cleanText(metadata?.equipmentName)
            || cleanText(selected?.deviceModel);
        const brand = cleanText(metadata?.brand);
        const baseModel = cleanText(metadata?.model) || cleanText(selected?.deviceModel);
        const items = getTicketEquipmentItems({
            checklist: selected?.checklist,
            deviceModel: selected?.deviceModel,
            serialNumber: selected?.serialNumber,
            pn: metadata?.pn,
            equipmentName: fallbackName
        });

        if (items.length === 0) {
            return [{
                name: fallbackName || "-",
                brand,
                model: baseModel && baseModel.toLowerCase() !== String(fallbackName || "").trim().toLowerCase() ? baseModel : "",
                serialNumber: cleanText(metadata?.entryRepairSlip?.serialNumber) || cleanText(selected?.serialNumber) || "-",
                pn: cleanText(metadata?.entryRepairSlip?.pn) || cleanText(metadata?.pn) || "-"
            }];
        }

        return items.map((item) => ({
            name: cleanText(item.designation) || fallbackName || "-",
            brand,
            model: items.length === 1 && baseModel && baseModel.toLowerCase() !== String(cleanText(item.designation) || fallbackName || "").trim().toLowerCase()
                ? baseModel
                : "",
            serialNumber: cleanText(item.serialNumber) || "-",
            pn: cleanText(item.pn) || "-"
        }));
    }, [meta, selected?.deviceModel, selected?.serialNumber]);
    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        setSageQuoteNumber(String((meta as any)?.quote?.sageNumber || ""));
        const existingDocs = Array.isArray((meta as any)?.quote?.documents) ? (meta as any).quote.documents : [];
        setDocuments(existingDocs.map((doc: any, index: number) => ({
            id: String(doc.id || `${index}-${doc.name || "devis"}`),
            name: String(doc.name || "Devis"),
            url: String(doc.dataUrl || doc.url || ""),
            type: String(doc.type || "application/octet-stream"),
            title: String(doc.title || "Devis"),
            size: Number(doc.size || 0)
        })).filter((doc: QuoteDocument) => doc.url.length > 0));
    }, [meta, selected?.id]);

    const addDocuments = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files ? Array.from(event.target.files) : [];
        event.target.value = "";
        if (files.length === 0) return;
        setUploading(true);
        try {
            const uploaded = await Promise.all(files.map((file) => uploadDocument(file)));
            setDocuments((prev) => [
                ...prev,
                ...uploaded.map((item) => ({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    name: item.name,
                    url: item.url,
                    type: item.type,
                    title: "Devis",
                    size: item.size
                }))
            ]);
        } catch (error: any) {
            alert(error?.message || "Erreur upload document devis.");
        } finally {
            setUploading(false);
        }
    };

    const removeDocument = (id: string) => {
        setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    };

    const sendQuote = async () => {
        if (!selected || saving || uploading) return;

        setSaving(true);
        try {
            const user = JSON.parse(localStorage.getItem("user") || "{}");
            const response = await fetch(`/api/adv/reclamations/${selected.id}/quote`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    advId: user?.id,
                    sageQuoteNumber,
                    quoteDocuments: documents.map((doc) => ({
                        id: doc.id,
                        name: doc.name,
                        url: doc.url,
                        type: doc.type,
                        title: doc.title
                    }))
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                alert(data?.error || "Impossible d'envoyer le devis.");
                return;
            }

            alert("Devis envoyé au client.");
            setSageQuoteNumber("");
            setDocuments([]);
            await fetchReclamations();
        } catch (error) {
            console.error("ADV devis submit error:", error);
            alert("Erreur pendant l'envoi du devis.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement des tickets devis...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={forcedReclamationId ? undefined : styles.twoCol}>
            {!forcedReclamationId ? (
                <article className={styles.sectionCard}>
                    <h2 className={styles.sectionTitle}>Tickets nécessitant un devis</h2>
                    {reclamations.length === 0 ? (
                        <div className={styles.empty}>Aucun ticket en attente de devis.</div>
                    ) : (
                        <ul className={styles.list}>
                            {reclamations.map((item) => (
                                <li
                                    key={item.id}
                                    className={styles.listItem}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedId(item.id)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            setSelectedId(item.id);
                                        }
                                    }}
                                    style={{
                                        cursor: "pointer",
                                        borderColor: selectedId === item.id ? "var(--primary-blue)" : undefined
                                    }}
                                >
                                    <div className={styles.itemMain}>
                                        <div className={styles.itemTitle}>Ticket #{(item.ticket as any)?.displayId || item.ticket?.id || "-"}</div>
                                        <span className={`${styles.statusBadge} ${styles.statusWarn}`}>{getReclamationStatusLabel(item.status)}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </article>
            ) : null}

            <article className={styles.sectionCard}>
                {!selected ? (
                    <div className={styles.empty}>Sélectionnez un ticket pour préparer le devis.</div>
                ) : (
                    <>
                        <h2 className={styles.sectionTitle}>Devis</h2>
                        <div className={styles.formGrid2} style={{ marginTop: "0.75rem" }}>
                            <div className={styles.listItem} style={{ background: "#f8fafc" }}>
                                <div className={styles.itemTitle}>Client</div>
                                <div className={styles.itemMeta}>{selected.customerName}</div>
                                <div className={styles.itemMeta}>{selected.contactEmail}</div>
                                <div className={styles.itemMeta}>{selected.phone || "Téléphone non renseigné"}</div>
                            </div>
                            <div className={styles.listItem} style={{ background: "#fff7ed" }}>
                                <div className={styles.itemTitle}>Matériel à réparer</div>
                                <div style={{ display: "grid", gap: "0.6rem" }}>
                                    {materialDetails.map((material, index) => (
                                        <div
                                            key={`quote-material-${index}`}
                                            style={{
                                                display: "grid",
                                                gap: "0.18rem",
                                                padding: "0.55rem 0.65rem",
                                                borderRadius: "10px",
                                                border: "1px solid #fed7aa",
                                                background: "#fff"
                                            }}
                                        >
                                            <div style={{ fontWeight: 700 }}>{material.name}</div>
                                            {material.brand ? <div className={styles.itemMeta}>Marque: {material.brand}</div> : null}
                                            {material.model ? <div className={styles.itemMeta}>Modèle: {material.model}</div> : null}
                                            <div className={styles.itemMeta}>Numéro de série: {material.serialNumber}</div>
                                            <div className={styles.itemMeta}>PN: {material.pn}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className={styles.listItem} style={{ marginTop: "0.75rem", background: "#f8fafc" }}>
                            <div className={styles.itemTitle}>Rapport d'intervention</div>
                            <div style={{ display: "grid", gap: "0.55rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginTop: "0.65rem" }}>
                                <ReportField label="Estimation du temps d'intervention" value={technicalDiagnosis.advQuoteEstimatedDuration || technicalDiagnosis.estimatedDuration} />
                                <ReportField label="Code article" value={technicalDiagnosis.advQuoteArticleCode} />
                            </div>
                            {repairEntries.length > 0 ? (
                                <div style={{ display: "grid", gap: "0.55rem", marginTop: "0.65rem" }}>
                                    {repairEntries.map((entry: any, index: number) => (
                                        <div key={`quote-repair-entry-${index}`} className={styles.listItem} style={{ background: "#fffafa" }}>
                                            <div className={styles.itemTitle} style={{ marginBottom: "0.55rem" }}>Activité {index + 1}</div>
                                            <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
                                                <ReportField label="Nature de l'activité" value={formatRepairNature(entry.nature)} />
                                                <ReportField label="Description de la prestation" value={entry.designation || entry.partsToReplace} />
                                                <ReportField label="Quantité" value={entry.quantity} />
                                                <ReportField label="Code article" value={entry.articleCode} />
                                                <ReportField label="Code fournisseur" value={entry.supplierCode} />
                                                <ReportField label="Code Sage" value={entry.sageCode} />
                                                <ReportField label="Prix de revient" value={entry.costPrice ?? entry.purchasedComponentsPrice} />
                                                <ReportField label="Prix d'achat" value={entry.purchasePrice} />
                                                <ReportField label="Export price" value={entry.exportPrice} />
                                                <ReportField label="Devise export" value={entry.exportCurrency} />
                                                <ReportField label="Prix de vente TTC" value={entry.salePriceTtc} />
                                                <ReportField label="Référence import" value={entry.importRequestRef} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={styles.itemMeta}>Aucune pièce enregistrée.</div>
                            )}
                        </div>

                        <div className={styles.formGrid2} style={{ marginTop: "0.75rem", alignItems: "end" }}>
                            <div className={styles.field}>
                                <label className={styles.label}>Document devis</label>
                                <input className={styles.input} type="file" multiple onChange={addDocuments} />
                            </div>
                            <div className={styles.field}>
                                <label className={styles.label}>N° devis Sage</label>
                                <input
                                    className={styles.input}
                                    value={sageQuoteNumber}
                                    onChange={(event) => setSageQuoteNumber(event.target.value)}
                                    placeholder="Ex: DV-2026-00124"
                                />
                            </div>
                        </div>

                        {documents.length > 0 ? (
                            <ul className={styles.list} style={{ marginTop: "0.75rem" }}>
                                {documents.map((doc) => (
                                    <li key={doc.id} className={styles.listItem}>
                                        <div className={styles.itemMain}>
                                            <span className={styles.itemMeta}>Devis - {doc.name}</span>
                                            <button className="btn btn-outline" onClick={() => removeDocument(doc.id)}>
                                                Retirer
                                            </button>
                                        </div>
                                        <div className={styles.itemMeta}>
                                            <a href={normalizeDocumentUrl(doc.url) || doc.url} target="_blank" rel="noreferrer">
                                                Ouvrir le document
                                            </a>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : null}

                        <div className={styles.actions} style={{ marginTop: "0.85rem" }}>
                            <button className="btn btn-primary" onClick={sendQuote} disabled={saving || uploading}>
                                {uploading ? "Téléversement..." : saving ? "Envoi..." : "Envoyer le devis au client"}
                            </button>
                        </div>
                    </>
                )}
            </article>
        </section>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "devis" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
