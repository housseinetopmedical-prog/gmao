"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";

type DashboardPayload = {
    summary: {
        dossiersARemplir: number;
        alertes: number;
    };
    alerts: Array<{
        id: string;
        level: string;
        message: string;
    }>;
};

export default function MagasinierDashboard() {
    const [loading, setLoading] = useState(true);
    const [payload, setPayload] = useState<DashboardPayload | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/magasinier/dashboard", { cache: "no-store" });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data?.error || "Impossible de charger le tableau de bord magasinier.");
                }
                setPayload(data);
            } catch (error) {
                console.error(error);
                setPayload(null);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    if (loading) {
        return (
            <div className="card" style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
                <Loader2 size={30} className="animate-spin" />
                <style jsx>{`
                    .animate-spin {
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </div>
        );
    }

    if (!payload) {
        return <div className="card">Impossible de charger l'espace magasinier.</div>;
    }

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Tableau de bord</h1>
                </div>
            </div>

            <section className="card" style={{ display: "grid", gap: "0.9rem" }}>
                <div className={styles.statsGrid}>
                    <a href="/ticket/infos-DP" className="card" style={{ display: "flex", gap: "0.9rem", alignItems: "center", minHeight: 96, color: "inherit", textDecoration: "none" }}>
                        <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--accent-blue)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ClipboardCheck size={20} color="var(--primary-blue)" />
                        </div>
                        <div>
                            <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>{payload.summary.dossiersARemplir}</div>
                            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Tickets</div>
                        </div>
                    </a>
                </div>
            </section>
        </div>
    );
}


