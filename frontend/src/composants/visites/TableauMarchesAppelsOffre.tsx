"use client";

import { useMemo, useState } from "react";
import styles from "@/app/(tableau-de-bord)/(espaces)/appels-offre/appels-offre.module.css";

export default function AppelsOffreMarketsTable({ items, title, emptyLabel, showCount = true }: { items: any[]; title: string; emptyLabel: string; showCount?: boolean }) {
    const [inventorySearch, setInventorySearch] = useState("");

    const filtered = useMemo(() => {
        const query = inventorySearch.trim().toLowerCase();
        return [...items]
            .filter((item) => !query || String(item.inventoryNumber || item.code || "").toLowerCase().includes(query))
            .sort((a, b) => new Date(String(b.createdAt || 0)).getTime() - new Date(String(a.createdAt || 0)).getTime());
    }, [items, inventorySearch]);

    return (
        <section className={styles.hero}>
            <div className={styles.panel}>
                {title ? <div className={styles.heroTitle}>{title}</div> : null}
                {showCount ? <div className={styles.heroText}>{filtered.length} marché{filtered.length > 1 ? "s" : ""} enregistré{filtered.length > 1 ? "s" : ""}.</div> : null}
                <div className={styles.field} style={{ marginTop: "1rem", maxWidth: "320px" }}>
                    <label className={styles.label}>Recherche par numéro d'inventaire</label>
                    <input className={styles.input} value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} />
                </div>
                {filtered.length === 0 ? (
                    <div className={styles.list}>
                        <article className={styles.item}>
                            <div className={styles.itemTitle}>{emptyLabel}</div>
                        </article>
                    </div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date de création</th>
                                    <th>Maître d'ouvrage</th>
                                    <th>Numéro de marché</th>
                                    <th>Lot</th>
                                    <th>Désignation</th>
                                    <th>Marque</th>
                                    <th>Modèle</th>
                                    <th>Numéro de série</th>
                                    <th>Numéro d'inventaire</th>
                                    <th>Code article</th>
                                    <th>Hôpital</th>
                                    <th>Ville</th>
                                    <th>Secteur</th>
                                    <th>Contrat</th>
                                    <th>Début</th>
                                    <th>Fin</th>
                                    <th>Document</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((item) => (
                                    <tr key={item.id}>
                                        <td>{formatDateTime(item.createdAt)}</td>
                                        <td>{item.organism || item.client || "-"}</td>
                                        <td>{item.marketNumber || item.blNumber || "-"}</td>
                                        <td>{item.lot || item.agence || "-"}</td>
                                        <td>{item.name || "-"}</td>
                                        <td>{item.brand || "-"}</td>
                                        <td>{item.model || "-"}</td>
                                        <td>{item.serialNumber || "-"}</td>
                                        <td>{item.inventoryNumber || item.code || "-"}</td>
                                        <td>{item.articleCode || "-"}</td>
                                        <td>{item.hospital || item.location || "-"}</td>
                                        <td>{item.city || "-"}</td>
                                        <td>{item.sector || item.service || "-"}</td>
                                        <td>{formatContractType(item.contractType, item.warrantyMonths)}</td>
                                        <td>{formatDate(item.contractStartDate || item.purchaseDate)}</td>
                                        <td>{formatDate(item.contractEndDate || item.lastMaintenance)}</td>
                                        <td>{item.blDocumentUrl ? <a href={item.blDocumentUrl} target="_blank" rel="noreferrer">Ouvrir</a> : "-"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function formatDateTime(raw: unknown) {
    const parsed = new Date(String(raw || ""));
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function formatDate(raw: unknown) {
    if (!raw) return "-";
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

function formatContractType(raw: unknown, fallback: unknown) {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "GARANTIE") return "Contrat de garantie";
    if (value === "MAINTENANCE") return "Contrat de maintenance";
    if (Number(fallback) === 1) return "Contrat de garantie";
    if (Number(fallback) === 2) return "Contrat de maintenance";
    return "-";
}
