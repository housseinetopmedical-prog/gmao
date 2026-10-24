"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../appels-offre.module.css";

type MarketGroup = {
    key: string;
    createdAt: string;
    organism: string;
    marketNumber: string;
    marketTitle: string;
    lots: string[];
    cities: string[];
    lotCityPairs: string[];
    products: any[];
};

function getMeta(item: any) {
    return item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
}

function getMarketKey(item: any) {
    return [
        String(item.marketNumber || item.blNumber || "").trim(),
        String(item.organism || item.client || "").trim()
    ].join("__");
}

function isMarketOnly(item: any) {
    const meta = getMeta(item);
    return item?.recordKind === "MARKET_ONLY" || meta.recordKind === "MARKET_ONLY";
}

function unique(values: unknown[]) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function collectLotLabels(item: any) {
    const meta = getMeta(item);
    const lotDetails = Array.isArray(meta.lotDetails) ? meta.lotDetails : [];
    if (lotDetails.length > 0) {
        return lotDetails.map((lot: any) => lot.lotNumber || lot.executionPlace);
    }
    return [item.lot || item.agence];
}

function collectCityLabels(item: any) {
    const meta = getMeta(item);
    const lotDetails = Array.isArray(meta.lotDetails) ? meta.lotDetails : [];
    const lotCities = lotDetails.map((lot: any) => lot.city).filter(Boolean);
    if (lotCities.length > 0) return lotCities;
    if (!isMarketOnly(item) && item.city) return [item.city];
    return [];
}

function collectLotCityPairs(item: any) {
    const meta = getMeta(item);
    const lotDetails = Array.isArray(meta.lotDetails) ? meta.lotDetails : [];
    if (lotDetails.length > 0) {
        return lotDetails.map((lot: any) => {
            const lotNumber = String(lot?.lotNumber || lot?.executionPlace || "").trim();
            const city = String(lot?.city || "").trim();
            if (lotNumber && city) return `Lot ${lotNumber} - ${city}`;
            if (lotNumber) return `Lot ${lotNumber}`;
            return city;
        });
    }

    const lot = String(item.lot || item.agence || "").trim();
    const city = String(item.city || "").trim();
    if (lot && city) return [`Lot ${lot} - ${city}`];
    if (lot) return [`Lot ${lot}`];
    if (city) return [city];
    return [];
}

function formatDate(raw: unknown) {
    const parsed = new Date(String(raw || ""));
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

function buildGroups(items: any[]): MarketGroup[] {
    const groups = new Map<string, MarketGroup>();

    items.forEach((item) => {
        const meta = getMeta(item);
        const key = getMarketKey(item) || String(item.id);
        const lotLabels = collectLotLabels(item);
        const cities = collectCityLabels(item);
        const lotCityPairs = collectLotCityPairs(item);

        if (!groups.has(key)) {
            groups.set(key, {
                key,
                createdAt: String(item.createdAt || ""),
                organism: String(item.organism || item.client || "").trim(),
                marketNumber: String(item.marketNumber || item.blNumber || "").trim(),
                marketTitle: String(meta.marketTitle || item.marketTitle || item.name || "").trim(),
                lots: unique(lotLabels),
                cities: unique(cities),
                lotCityPairs: unique(lotCityPairs),
                products: []
            });
        }

        const group = groups.get(key)!;
        group.products.push(item);
        group.lots = unique([...group.lots, ...lotLabels]);
        group.cities = unique([...group.cities, ...cities]);
        group.lotCityPairs = unique([...group.lotCityPairs, ...lotCityPairs]);
        if ((isMarketOnly(item) || !group.marketTitle) && (meta.marketTitle || item.name)) {
            group.marketTitle = String(meta.marketTitle || item.name).trim();
        }
        if (new Date(String(item.createdAt || 0)).getTime() < new Date(group.createdAt || 0).getTime()) {
            group.createdAt = String(item.createdAt || "");
        }
    });

    return Array.from(groups.values()).sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
}

function parseLotCityLabel(value: string) {
    const cleaned = String(value || "").trim();
    const match = cleaned.match(/^(Lot\s+[^-]+)\s*-\s*(.+)$/i);
    if (match) {
        return {
            lot: match[1].trim(),
            city: match[2].trim()
        };
    }

    return {
        lot: cleaned || "-",
        city: "-"
    };
}

function LotCityList({ values }: { values: string[] }) {
    const cleanValues = unique(values);
    if (cleanValues.length === 0) return <>-</>;

    return (
        <div style={{ display: "grid", gap: "0.45rem" }}>
            {cleanValues.map((value) => {
                const item = parseLotCityLabel(value);
                return (
                    <div
                        key={value}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(110px, 0.75fr) minmax(140px, 1fr)",
                            gap: "0.55rem",
                            alignItems: "center",
                            border: "1px solid #e5e7eb",
                            borderRadius: "10px",
                            background: "#ffffff",
                            padding: "0.42rem 0.55rem"
                        }}
                    >
                        <span style={{ fontWeight: 800, color: "#111827" }}>{item.lot}</span>
                        <span style={{ color: "#334155" }}>{item.city}</span>
                    </div>
                );
            })}
        </div>
    );
}

type HistoriqueMarchesProps = {
    basePath?: string;
};

export default function AppelsOffreHistoriqueMarchesPage({ basePath = "/appels-offre/historique-marches" }: HistoriqueMarchesProps = {}) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const response = await fetch("/api/appels-offre/equipements", { cache: "no-store" });
                const data = await response.json().catch(() => []);
                setItems(Array.isArray(data) ? data : []);
            } catch {
                setItems([]);
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const groups = useMemo(() => buildGroups(items), [items]);
    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return groups;

        return groups.filter((group) => {
            const productText = group.products
                .map((item) => [
                    item.name,
                    item.brand,
                    item.model,
                    item.serialNumber,
                    item.inventoryNumber,
                    item.code,
                    item.hospital,
                    item.location
                ].join(" "))
                .join(" ");
            const text = [
                group.createdAt,
                group.organism,
                group.marketNumber,
                group.marketTitle,
                group.lots.join(" "),
                group.cities.join(" "),
                group.lotCityPairs.join(" "),
                productText
            ].join(" ").toLowerCase();
            return text.includes(query);
        });
    }, [groups, search]);

    return (
        <section className={styles.hero}>
            <div className={styles.panel}>
                <div className={styles.field} style={{ maxWidth: "420px" }}>
                    <label className={styles.label}>Recherche</label>
                    <input
                        className={styles.input}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Rechercher par marché, maître d'ouvrage, lot, ville, produit, SN..."
                    />
                </div>

                {loading ? (
                    <div className={styles.panelText}>Chargement de l'historique...</div>
                ) : filtered.length === 0 ? (
                    <div className={styles.panelText}>Aucun marché trouvé.</div>
                ) : (
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Maître d'ouvrage</th>
                                    <th>Marché numéro / Contrat de maintenance</th>
                                    <th>Intitulé du marché</th>
                                    <th>Lots et villes d'exécution</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((group) => (
                                    <tr key={group.key}>
                                        <td>{formatDate(group.createdAt)}</td>
                                        <td>{group.organism || "-"}</td>
                                        <td>
                                            <Link href={`${basePath}/detail?key=${encodeURIComponent(group.key)}`}>
                                                {group.marketNumber || "-"}
                                            </Link>
                                        </td>
                                        <td>{group.marketTitle || "-"}</td>
                                        <td><LotCityList values={group.lotCityPairs.length > 0 ? group.lotCityPairs : group.lots} /></td>
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
