"use client";

/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : verification.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "../adv.module.css";
import { getChecklistMetadata, getReclamationStatusLabel, getUrgencyFromReclamation, getUrgencyToneClass, URGENCY_LABELS } from "@/metier/workflow-adv";

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
    checklist?: string | null;
    ticket?: {
        savHistory?: Array<{ action?: string | null }> | null;
    } | null;
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
function hasAdvMerchandiseVerification(item: Reclamation) {
    const metadata = getChecklistMetadata(item) as any;
    const merchandise = metadata?.merchandiseInfo || {};
    const storeReview = metadata?.storeReview || {};
    const historyEntries = Array.isArray(item?.ticket?.savHistory) ? item.ticket?.savHistory : [];
    const hasHistoryValidation = historyEntries.some((entry) => String(entry?.action || "").toUpperCase() === "ADV_MERCHANDISE_REVIEW");
    const hasMerchandisePayload = [merchandise?.articleCode, merchandise?.warrantyLabel, merchandise?.invoiceDate, merchandise?.shippingDate].some((value) => Boolean(String(value || "").trim()));

    // Cette partie affiche l interface visible a l ecran.
    return (
        String(merchandise?.filledBy || "").toUpperCase() === "ADV" ||
        Boolean(String(merchandise?.filledAt || "").trim()) ||
        hasMerchandisePayload ||
        String(storeReview?.lastAction || "").toUpperCase() === "VALIDATE_AND_FORWARD" ||
        hasHistoryValidation
    );
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvVerificationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [articleCode, setArticleCode] = useState("");
    const [warrantyLabel, setWarrantyLabel] = useState("");
    const [warrantyStatus, setWarrantyStatus] = useState("");
    const [invoiceDate, setInvoiceDate] = useState("");
    const [shippingDate, setShippingDate] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const forcedReclamationId = useMemo(() => {
        const value = Number(searchParams.get("reclamationId"));
        return Number.isFinite(value) && value > 0 ? value : null;
    }, [searchParams]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/reclamations?light=0&historyLimit=20", { cache: "no-store" });
                const reclamationData = await response.json();
                const list = Array.isArray(reclamationData) ? reclamationData : [];
                const onlyToVerify = list.filter((item: Reclamation) => String(item.status || "").toUpperCase() === "PENDING_ADV_VERIFICATION" && !hasAdvMerchandiseVerification(item));
                setReclamations(onlyToVerify);

                if (onlyToVerify.length > 0) {
                    if (forcedReclamationId !== null && onlyToVerify.some((item) => item.id === forcedReclamationId)) {
                        setSelectedId(forcedReclamationId);
                    } else {
                        setSelectedId((prev) => {
                            if (prev && onlyToVerify.some((item) => item.id === prev)) return prev;
                            return onlyToVerify[0].id;
                        });
                    }
                }
            } catch (error) {
                console.error("ADV verification fetch error:", error);
                setReclamations([]);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, [forcedReclamationId]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const selectedReclamation = useMemo(() => reclamations.find((item) => item.id === selectedId) || null, [reclamations, selectedId]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const meta = useMemo(() => (selectedReclamation ? getChecklistMetadata(selectedReclamation) : {}), [selectedReclamation]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const selectedUrgency = useMemo(() => (selectedReclamation ? getUrgencyFromReclamation(selectedReclamation) : "MEDIUM"), [selectedReclamation]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const merchandiseAlreadyVerified = useMemo(() => (selectedReclamation ? hasAdvMerchandiseVerification(selectedReclamation) : false), [selectedReclamation]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        if (loading) return;
        if (forcedReclamationId === null) return;
        if (!selectedReclamation || merchandiseAlreadyVerified) {
            router.replace("/adv/tickets");
        }
    }, [forcedReclamationId, loading, merchandiseAlreadyVerified, router, selectedReclamation]);

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const merch = (meta as any)?.merchandiseInfo || {};
        const storeReview = (meta as any)?.storeReview || {};
        setArticleCode(String(merch.articleCode || ""));
        setWarrantyLabel(
            String(
                merch.warrantyLabel ||
                    (Array.isArray(storeReview.contractualDocuments)
                        ? storeReview.contractualDocuments.map((item: any) => String(item?.name || "")).filter(Boolean).join(" · ")
                        : "") ||
                    ""
            )
        );
        setWarrantyStatus(String(merch.warrantyStatus || ""));
        setInvoiceDate(String(merch.invoiceDate || ""));
        setShippingDate(String(merch.shippingDate || ""));
        setSaveMessage(null);
    }, [meta]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const clientInfo = useMemo(
        () => [
            ["Nom", String(selectedReclamation?.customerName || "-")],
            ["E-mail", String(selectedReclamation?.contactEmail || "-")],
            ["Téléphone", String(selectedReclamation?.phone || "-")]
        ],
        [selectedReclamation]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const equipmentInfo = useMemo(
        () => [
            ["Désignation", String(selectedReclamation?.deviceModel || "-")],
            ["Numéro de série", String(selectedReclamation?.serialNumber || "-")],
            ["PN", String((meta as any).pn || "-")],
            ["Marque", String((meta as any).brand || "-")],
            ["Urgence", URGENCY_LABELS[selectedUrgency]],
            ["Accessoires", String((meta as any).accessories || "-")]
        ],
        [meta, selectedReclamation, selectedUrgency]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const requestInfo = useMemo(
        () => [
            ["Établissement", String((meta as any).establishment || "-")],
            ["Ville", String((meta as any).city || "-")],
            ["Secteur", String((meta as any).specialtySector || "-")],
            ["Spécialité", String((meta as any).specialty || "-")]
        ],
        [meta]
    );

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const merchandiseIsComplete = useMemo(() => Boolean(invoiceDate && shippingDate), [invoiceDate, shippingDate]);

    // Cette fonction gere une action de l utilisateur, par exemple enregistrer, modifier ou envoyer.
    const handleSave = async () => {
        if (!selectedReclamation) return;
        if (!warrantyStatus.trim()) {
            setSaveMessage({ type: "error", text: "Veuillez choisir sous garantie ou hors garantie avant d'envoyer le ticket." });
            return;
        }
        setIsSaving(true);
        setSaveMessage(null);

        try {
            const currentUser = getLocalUser();
            const targetStatus = merchandiseIsComplete ? "PENDING_TECHNICAL_MANAGER_REVIEW" : "PENDING_STORE_REVIEW";
            const response = await fetch(`/api/reclamations/${selectedReclamation.id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "x-user-role": currentUser.role,
                    "x-user-id": String(currentUser.id || "")
                },
                body: JSON.stringify({
                    status: targetStatus,
                    advId: currentUser?.id,
                    merchandiseInfo: {
                        articleCode: articleCode.trim() || null,
                        warrantyLabel: warrantyLabel.trim() || null,
                        warrantyStatus: warrantyStatus.trim() || null,
                        invoiceDate: invoiceDate || null,
                        shippingDate: shippingDate || null,
                        filledBy: "ADV",
                        filledByUserId: currentUser?.id,
                        filledAt: new Date().toISOString()
                    }
                })
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error || "Impossible d'enregistrer les informations marchandise.");
            }

            router.replace("/adv/tickets");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Erreur lors de l'enregistrement";
            if (/déjà été enregistrée|deja ete enregistree/i.test(message)) {
                router.replace("/adv/tickets");
                return;
            }
            setSaveMessage({ type: "error", text: message });
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return <div className={styles.empty}>Chargement des informations propres au dépôt principal...</div>;
    }

    if (!selectedReclamation || merchandiseAlreadyVerified) {
        return <div className={styles.empty}>Redirection en cours...</div>;
    }

    // Cette partie affiche l interface visible a l ecran.
    return (
        <section className={styles.sectionCard}>
            <div className={styles.verificationHeader}>
                <div>
                    <h1 className={styles.verificationTitle}>Informations propres au dépôt principal</h1>
                    <p className={styles.helper}>Après qualification ADV, renseignez ici la marchandise ou transmettez le dossier au magasinier si des éléments manquent.</p>
                </div>
                <div className={styles.verificationBadges}>
                    <span className={styles.statusBadge}>{getReclamationStatusLabel(selectedReclamation.status)}</span>
                    <span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(selectedUrgency)]}`}>Urgence : {URGENCY_LABELS[selectedUrgency]}</span>
                </div>
            </div>

            <div className={styles.verificationSection} style={{ marginTop: "1rem" }}>
                <h2 className={styles.verificationSectionTitle}>Informations du ticket</h2>
                <div className={styles.infoGrid}>
                    <InfoCard title="Coordonnées du client">
                        {clientInfo.map(([label, value]) => (
                            <InfoLine key={label} label={label} value={String(value)} />
                        ))}
                    </InfoCard>
                    <InfoCard title="Identification de l'équipement">
                        {equipmentInfo.map(([label, value]) =>
                            label === "Urgence" ? (
                                <InfoLine key={label} label={label} value={<span className={`${styles.statusBadge} ${styles[getUrgencyToneClass(selectedUrgency)]}`}>{URGENCY_LABELS[selectedUrgency]}</span>} />
                            ) : (
                                <InfoLine key={label} label={label} value={String(value)} />
                            )
                        )}
                    </InfoCard>
                    <InfoCard title="Contexte de la demande client">
                        {requestInfo.map(([label, value]) => (
                            <InfoLine key={label} label={label} value={String(value)} />
                        ))}
                    </InfoCard>
                </div>

                <div className={styles.descriptionBox}>
                    <div className={styles.infoTitle}>Description initiale de la demande</div>
                    <div className={styles.infoValue}>{String(selectedReclamation.description || "-")}</div>
                </div>
            </div>

            <div className={styles.verificationSection} style={{ marginTop: "1rem" }}>
                <h2 className={styles.verificationSectionTitle}>Informations propres au dépôt principal</h2>
                <div style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                    {merchandiseIsComplete
                        ? "Informations propres au dépôt principal complétées."
                        : "Informations propres au dépôt principal à compléter."}
                </div>
                <div style={{ marginTop: "0.55rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                    Dossier #{selectedReclamation.id} - {selectedReclamation.customerName} - {selectedReclamation.deviceModel}
                </div>

                <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "1fr 1fr", marginTop: "0.9rem" }}>
                    <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Code article à réparer sur la facture client</label>
                        <input value={articleCode} onChange={(event) => setArticleCode(event.target.value)} style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }} placeholder="Ex: ART-001" />
                    </div>
                    <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Durée de garantie contractuelle fournisseur</label>
                        <input value={warrantyLabel} onChange={(event) => setWarrantyLabel(event.target.value)} style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }} placeholder="Ex: 12 mois" />
                    </div>
                </div>

                <div style={{ display: "grid", gap: "0.7rem", gridTemplateColumns: "1fr 1fr", marginTop: "0.7rem" }}>
                    <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Date de facture fournisseur</label>
                        <input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }} />
                    </div>
                    <div>
                        <label style={{ display: "block", fontWeight: 600, marginBottom: "0.25rem" }}>Date d'expédition fournisseur</label>
                        <input type="date" value={shippingDate} onChange={(event) => setShippingDate(event.target.value)} style={{ width: "100%", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "0.6rem" }} />
                    </div>
                </div>
            </div>

            {saveMessage ? (
                <div className="card" style={{ marginTop: "1rem", padding: "0.85rem", background: saveMessage.type === "success" ? "#dbeafe" : "#fee2e2", borderLeft: `4px solid ${saveMessage.type === "success" ? "#0ea5e9" : "#ef4444"}` }}>
                    {saveMessage.text}
                </div>
            ) : null}

            <div className={styles.verificationSection} style={{ marginTop: "1rem" }}>
                <h2 className={styles.verificationSectionTitle}>Actions</h2>
                <div className={styles.helper} style={{ marginBottom: "0.75rem" }}>
                    Si tous les champs sont complétés, le dossier part au responsable technique. Sinon, il est transmis au magasinier pour complément.
                </div>

                <div className={styles.actions} style={{ marginTop: "0.85rem" }}>
                    <button className="btn btn-outline" onClick={() => router.push("/adv/tickets")}>Retour à la liste</button>
                    <button className="btn btn-outline" onClick={() => router.push(`/adv/modifier-ticket/${selectedReclamation.id}`)}>Modifier ticket</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? "Enregistrement..." : merchandiseIsComplete ? "Valider et transmettre au responsable technique" : "Enregistrer et transmettre au magasinier"}
                    </button>
                </div>
            </div>
        </section>
    );
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function InfoCard({ title, children }: { title: string; children: ReactNode }) {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.infoBox}>
            <div className={styles.infoTitle}>{title}</div>
            <div style={{ display: "grid", gap: "0.5rem" }}>{children}</div>
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
        <div>
            <div style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>{label}</div>
            <div style={{ fontWeight: 700 }}>{value}</div>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "verification" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
