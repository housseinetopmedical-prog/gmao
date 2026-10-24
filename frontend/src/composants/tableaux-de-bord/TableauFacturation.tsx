"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, ReceiptText } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";
import panelStyles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";
import { getAdministrativeClosureAt } from "@/metier/historique-ticket";
import { parseChecklistPayload } from "@/metier/workflow-client";

const ALERT_CARD_STYLE = { border: "1px solid #1f1f1f", background: "#ffffff" };
const ALERT_BADGE_STYLE = { background: "#fff1f2", border: "1px solid #fecaca", color: "#b00020" };
const ALERT_CHECK_STYLE = {
    border: "1px solid #86efac",
    borderRadius: 999,
    background: "#dcfce7",
    color: "#166534",
    fontWeight: 800,
    padding: "0.28rem 0.7rem"
};

export default function ResponsableFacturationDashboard() {
    const [entryTicketsCount, setEntryTicketsCount] = useState(0);
    const [exitSlipAlerts, setExitSlipAlerts] = useState<any[]>([]);

    useEffect(() => {
        const loadDashboard = async () => {
            try {
                const [ticketsResponse, reclamationsResponse] = await Promise.all([
                    fetch("/api/tickets", { cache: "no-store" }),
                    fetch("/api/reclamations", { cache: "no-store" })
                ]);

                const ticketsData = await ticketsResponse.json().catch(() => []);
                const reclamationsData = await reclamationsResponse.json().catch(() => []);
                const tickets = Array.isArray(ticketsData) ? ticketsData : [];
                const reclamations = Array.isArray(reclamationsData) ? reclamationsData : [];
                const activeTicketsCount = reclamations.filter((item: any) => {
                    if (!(Number(item?.ticket?.id || 0) > 0)) {
                        return false;
                    }
                    return !getAdministrativeClosureAt(item?.ticket || {});
                }).length;

                setExitSlipAlerts(
                    tickets
                        .filter((ticket: any) => {
                            const history = Array.isArray(ticket?.savHistory) ? ticket.savHistory : [];
                            return Boolean(getAdministrativeClosureAt(ticket || {}))
                                && !history.some((entry: any) => String(entry?.action || "") === "EXIT_REPAIR_SLIP_DOWNLOADED");
                        })
                        .slice(0, 5)
                );

                    setEntryTicketsCount(activeTicketsCount);
            } catch (error) {
                console.error("Facturation dashboard load error:", error);
                setExitSlipAlerts([]);
                setEntryTicketsCount(0);
            }
        };

        void loadDashboard();
    }, []);

    const statCards = useMemo(() => ([
        { label: "Tickets actifs", value: entryTicketsCount, icon: FileText, href: "/facturation/tickets-actifs" },
        { label: "Tickets traités", value: exitSlipAlerts.length, icon: ReceiptText, href: "/facturation/historique" }
    ]), [entryTicketsCount, exitSlipAlerts.length]);

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Tableau de bord</h1>
                </div>
            </div>

            <section className={panelStyles.sectionCard}>
                <div
                    className={panelStyles.metricGrid}
                    style={{
                        gridTemplateColumns: "repeat(2, minmax(320px, 1fr))",
                        gap: "0.85rem"
                    }}
                >
                    {statCards.map((item) => {
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.label}
                                className={panelStyles.metricCard}
                                href={item.href}
                                style={{ minHeight: 92, padding: "1rem", textDecoration: "none", color: "inherit", cursor: "pointer" }}
                            >
                                <div className={panelStyles.metricLabel} style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                                    <Icon size={18} />
                                    {item.label}
                                </div>
                                <div className={panelStyles.metricValue}>{item.value}</div>
                            </Link>
                        );
                    })}
                </div>
            </section>

            <section className={panelStyles.sectionCard} style={{ marginTop: "1rem" }}>
                <h2 className={panelStyles.sectionTitle}>Alertes facturation</h2>
                {exitSlipAlerts.length === 0 ? (
                    <div className={styles.emptyState}>Aucun ticket traité à télécharger pour le moment.</div>
                ) : (
                    <div style={{ display: "grid", gap: "0.85rem" }}>
                        {exitSlipAlerts.map((ticket: any) => (
                            <article
                                key={`exit-slip-alert-${ticket.id}`}
                                className={panelStyles.listItem}
                                style={ALERT_CARD_STYLE}
                            >
                                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.85rem", flexWrap: "wrap" }}>
                                    <div>
                                        <div className={panelStyles.itemTitle}>Ticket traité</div>
                                    </div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                                        <span style={ALERT_CHECK_STYLE}>✔</span>
                                        <span className={panelStyles.statusBadge} style={ALERT_BADGE_STYLE}>
                                            {ticket.ticketReference || ticket.displayId || ticket.id || "-"}
                                        </span>
                                    </div>
                                </div>
                                <div className={panelStyles.itemMeta} style={{ marginTop: "0.75rem", fontWeight: 600 }}>
                                    Le ticket a été traité par l'ADV. Veuillez créer et télécharger le ticket clôturé.
                                </div>
                                <div style={{ marginTop: "0.75rem" }}>
                                    <Link className="btn btn-primary" href="/facturation/historique">
                                        Créer le ticket clôturé
                                    </Link>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}


