"use client";

/*
Commentaire simple du fichier :
- Espace : client.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, SearchCheck } from "lucide-react";
import styles from "./client.module.css";
import { buildClientTimeline, getClientVisibleStatus, isOpenForClient, parseChecklistPayload } from "@/metier/workflow-client";
import { formatEquipmentSummary, getTicketEquipmentItems } from "@/metier/materiel-ticket";

// Cette partie explique la forme des donnees utilisees dans le fichier.
type Reclamation = {
    id: number;
    createdAt: string;
    updatedAt: string;
    status: string;
    deviceModel: string;
    serialNumber: string;
    description?: string | null;
    checklist?: string | null;
    ticket?: {
        id: number;
        displayId?: number | string | null;
        ticketReference?: string | null;
        status: string;
        priority?: string | null;
        savHistory?: Array<{
            id: number;
            action: string;
            note?: string | null;
            createdAt: string;
        }>;
    } | null;
};

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function formatDate(value: string | undefined) {
    if (!value) return "-";
    return new Date(value).toLocaleString();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function statusClass(status: string) {
    const value = status.toLowerCase();
    const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("non prise") || normalized.includes("non réparé") || normalized.includes("refus")) return styles.statusDanger;
    if (normalized.includes("attente") || normalized.includes("demande d'intervention recue")) return styles.statusWarn;
    if (normalized.includes("clôture") || normalized.includes("livraison")) return styles.statusSuccess;
    return styles.statusInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function getPriorityValue(item: Reclamation) {
    return String(item.ticket?.priority || parseChecklistPayload(item.checklist).metadata?.urgency || "").toUpperCase();
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function priorityClass(item: Reclamation) {
    const priority = getPriorityValue(item);
    if (priority === "CRITICAL") return styles.statusDanger;
    if (priority === "HIGH") return styles.statusWarn;
    if (priority === "LOW") return styles.statusSuccess;
    return styles.statusInfo;
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function priorityLabel(item: Reclamation) {
    const priority = getPriorityValue(item);
    if (priority === "CRITICAL") return "Critique";
    if (priority === "HIGH") return "Élevée";
    if (priority === "LOW") return "Faible";
    return "Moyenne";
}

// Cette petite fonction aide le reste du fichier a faire un travail precis.
function createNotifications(reclamations: Reclamation[]) {
    const notif: Array<{ id: string; title: string; at: string; url?: string; linkLabel?: string }> = [];

    reclamations.forEach((item) => {
        const requestLabel = `#${item.ticket?.ticketReference || item.ticket?.displayId || item.ticket?.id || item.id}`;
        const timeline = [...buildClientTimeline(item)].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

        const latestStep = timeline.find(
            (entry) =>
                [
                    "Prise en charge SAV",
                    "Non prise en charge",
                    "Décision administration des ventes: non prise en charge",
                    "Affectation technicien",
                    "Affectation technicien par responsable technique",
                    "Intervention technicien",
                    "Résultat final: non réparé",
                    "Enquête de satisfaction"
                ].includes(entry.label)
        );

        notif.push({
            id: `step-${item.id}-${latestStep?.id || item.updatedAt}`,
            title: latestStep ? `${latestStep.label} - Demande ${requestLabel}` : `Demande ${requestLabel}: ${getClientVisibleStatus(item)}`,
            at: latestStep?.at || item.updatedAt
        });

        const latestReport = timeline.find((entry) => entry.label.toLowerCase().includes("rapport") && entry.downloadUrl);
        if (latestReport?.downloadUrl) {
            notif.push({
                id: `report-${item.id}-${latestReport.id}`,
                title: `Rapport PDF disponible - Demande ${requestLabel}`,
                at: latestReport.at,
                url: latestReport.downloadUrl,
                linkLabel: "Télécharger le rapport PDF"
            });
        }
    });

    const dedup = new Map<string, { id: string; title: string; at: string; url?: string; linkLabel?: string }>();
    notif.forEach((item) => {
        const key = `${item.title}|${new Date(item.at).toISOString().slice(0, 16)}|${item.url || ""}`;
        if (!dedup.has(key)) {
            dedup.set(key, item);
        }
    });

    return Array.from(dedup.values())
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 6);
}

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ClientHomePage() {
    // Ces lignes gardent en memoire les informations qui changent pendant l utilisation de la page.
    const [loading, setLoading] = useState(true);
    const [reclamations, setReclamations] = useState<Reclamation[]>([]);
    const [userEmail, setUserEmail] = useState("");

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const email = user?.email ? String(user.email).toLowerCase() : "";
        setUserEmail(email);

        fetch(`/api/reclamations?light=1&contactEmail=${encodeURIComponent(email)}&historyLimit=16&skipSanitize=1`)
            .then((res) => res.json())
            .then((data) => {
                const list = Array.isArray(data) ? data : [];
                setReclamations(list);
            })
            .catch((error) => {
                console.error("Client home fetch error:", error);
                setReclamations([]);
            })
            .finally(() => setLoading(false));
    }, []);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const openReclamations = useMemo(() => reclamations.filter(isOpenForClient), [reclamations]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const latestUpdate = useMemo(() => {
        if (reclamations.length === 0) return "-";
        const latest = [...reclamations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
        return formatDate(latest.updatedAt);
    }, [reclamations]);

    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const archivedReclamationsCount = useMemo(() => reclamations.filter((item) => !isOpenForClient(item)).length, [reclamations]);
    // Cette partie calcule ou trie des informations pour eviter de refaire le meme travail inutilement.
    const pendingQuotesCount = useMemo(
        () => reclamations.filter((item) => String(item.status || "").toUpperCase() === "QUOTE_SENT_TO_CLIENT").length,
        [reclamations]
    );

    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.page}>
            <section className={styles.heroCard}>
                <div>
                    <h1 className={styles.heroTitle}>Tableau de bord</h1>
                </div>
                <div className={styles.quickActions}>
                    <Link href="/client/demande-intervention" className="btn btn-primary">
                        <Plus size={16} />
                        Ajouter demande d'intervention
                    </Link>
                    <Link href="/client/suivi" className="btn btn-outline">
                        <SearchCheck size={16} />
                        Suivi
                    </Link>
                </div>
            </section>

            <section className={styles.metricsGrid}>
                <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Mes demandes ouvertes</div>
                    <div className={styles.metricValue}>{openReclamations.length}</div>
                </article>
                <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Dernière mise à jour</div>
                    <div className={styles.metricValue} style={{ fontSize: "1rem" }}>{latestUpdate}</div>
                </article>
                <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Devis en attente de validation</div>
                    <div className={styles.metricValue}>{pendingQuotesCount}</div>
                </article>
                <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Demandes archivées</div>
                    <div className={styles.metricValue}>{archivedReclamationsCount}</div>
                </article>
                <article className={styles.metricCard}>
                    <div className={styles.metricLabel}>Compte</div>
                    <div className={styles.metricValue} style={{ fontSize: "1rem" }}>
                        {userEmail || "Client connecté"}
                    </div>
                </article>
            </section>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "client" de l espace "client".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
