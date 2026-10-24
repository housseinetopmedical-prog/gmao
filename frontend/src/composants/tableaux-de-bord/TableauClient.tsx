"use client";

import { useState, useEffect } from "react";
import {
    Activity,
    FileText,
    ShieldCheck,
    Search,
    Loader2,
} from "lucide-react";
import styles from "@/app/(tableau-de-bord)/tableau-de-bord.module.css";
import { clsx } from "clsx";

export default function ClientDashboard() {
    const [equipments, setEquipments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setTimeout(() => {
            setEquipments([
                { id: 1, name: "Scanner CT Revolution", sn: "SN-GE-KN-220", status: "Opérationnel", lastMaintenance: "12/02/2024" },
                { id: 2, name: "IRM Signa Voyager", sn: "SN-GE-RB-001", status: "En Panne", lastMaintenance: "05/01/2024" },
                { id: 3, name: "Moniteur Propaq", sn: "SN-ZOLL-KN-015", status: "Opérationnel", lastMaintenance: "20/11/2023" },
            ]);
            setLoading(false);
        }, 800);
    }, []);

    return (
        <div className={styles.dashboardContainer}>
            <div className={styles.pageHeader}>
                <div>
                    <h1 className={styles.pageTitle}>Portail client</h1>
                    <p className={styles.pageDescription}>Suivez l'état de votre parc biomédical et demandez assistance.</p>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <div className={clsx("card", styles.statCard)}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#fff1f2', color: '#c1121f' }}>
                        <Activity size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <span className={styles.statLabel}>Mes équipements</span>
                        <div className={styles.statValueContainer}>
                            <span className={styles.statValue}>24</span>
                        </div>
                    </div>
                </div>
                <div className={clsx("card", styles.statCard)}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
                        <FileText size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <span className={styles.statLabel}>Tickets en cours</span>
                        <div className={styles.statValueContainer}>
                            <span className={styles.statValue}>2</span>
                        </div>
                    </div>
                </div>
                <div className={clsx("card", styles.statCard)}>
                    <div className={styles.statIcon} style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}>
                        <ShieldCheck size={24} />
                    </div>
                    <div className={styles.statContent}>
                        <span className={styles.statLabel}>Garanties actives</span>
                        <div className={styles.statValueContainer}>
                            <span className={styles.statValue}>18</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 className={styles.chartTitle} style={{ margin: 0 }}>Mon parc équipements</h3>
                    <div className="search-box" style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input type="text" placeholder="Rechercher S/N ou Nom..." style={{
                            padding: '8px 12px 8px 36px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            fontSize: '0.875rem',
                            outline: 'none'
                        }} />
                    </div>
                </div>

                <div className="table-responsive">
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>APPAREIL</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>NUMÉRO DE SÉRIE</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>STATUT</th>
                                <th style={{ padding: '12px', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '0.85rem' }}>DERNIÈRE MAINT.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>
                                        <Loader2 className="animate-spin" />
                                    </td>
                                </tr>
                            ) : (
                                 equipments.map(eq => (
                                    <tr key={eq.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px', fontWeight: '500' }}>{eq.name}</td>
                                        <td style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{eq.sn}</td>
                                        <td style={{ padding: '12px' }}>
                                            <span style={{
                                                padding: '4px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                background: eq.status === 'Opérationnel' ? '#ecfdf5' : '#fef2f2',
                                                color: eq.status === 'Opérationnel' ? '#059669' : '#dc2626'
                                            }}>
                                                {eq.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px', fontSize: '0.9rem' }}>{eq.lastMaintenance}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}




