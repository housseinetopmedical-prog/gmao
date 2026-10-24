"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import styles from "@/app/(tableau-de-bord)/(espaces)/appels-offre/appels-offre.module.css";
import { getPastTechnicalVisitDates, type TechnicalVisitDateEntry } from "@/metier/visites-techniques";

function getMeta(item: any) {
    return item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
}

function valueOrDash(value: unknown) {
    const text = String(value ?? "").trim();
    return text || "-";
}

function getRawVisitDates(item: any) {
    const meta = getMeta(item);
    return Array.isArray(meta.technicalVisitDates) && meta.technicalVisitDates.length > 0
        ? meta.technicalVisitDates
        : item?.technicalVisitDates;
}

function DateChips({ dates }: { dates: TechnicalVisitDateEntry[] }) {
    if (dates.length === 0) return <span>-</span>;

    return (
        <div className={styles.visitDateList}>
            {dates.map((date, index) => (
                <span key={`${date.raw}-${index}`} className={styles.visitDateChip}>
                    {date.label}
                </span>
            ))}
        </div>
    );
}

export default function TechnicienMarchesHistoriquePage() {
    const [products, setProducts] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/appels-offre/equipements", { cache: "no-store" })
            .then((response) => response.json())
            .then((data) => setProducts(Array.isArray(data) ? data : []))
            .catch(() => setProducts([]))
            .finally(() => setLoading(false));
    }, []);

    const rows = useMemo(() => {
        const query = search.trim().toLowerCase();

        return products
            .map((product) => {
                const meta = getMeta(product);
                const dates = getPastTechnicalVisitDates(getRawVisitDates(product));
                return { product, meta, dates };
            })
            .filter((row) => row.dates.length > 0)
            .filter((row) => {
                if (!query) return true;
                const searchText = [
                    row.product?.name,
                    row.product?.designation,
                    row.product?.brand,
                    row.product?.model,
                    row.product?.serialNumber,
                    row.product?.inventoryNumber,
                    row.product?.code,
                    row.meta.quantity,
                    row.meta.executionPlace,
                    row.product?.executionPlace,
                    row.product?.hospital,
                    row.product?.location,
                    ...row.dates.map((date) => date.label)
                ].filter(Boolean).join(" ").toLowerCase();
                return searchText.includes(query);
            });
    }, [products, search]);

    return (
        <section className={styles.panel}>
            <div className={styles.alertHeader} style={{ marginBottom: "0.85rem" }}>
                <div>
                    <h2 className={styles.heroTitle}>Historique des visites techniques</h2>
                    <div className={styles.heroText}>Visites dont la date est déjà passée.</div>
                </div>
                <Link className="btn btn-outline" href="/technicien/marches">
                    <ArrowLeft size={16} />
                    Retour
                </Link>
            </div>

            <div className={styles.field} style={{ maxWidth: "420px", marginBottom: "0.85rem" }}>
                <label className={styles.label}>Recherche</label>
                <div style={{ position: "relative" }}>
                    <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#52525b" }} />
                    <input
                        className={styles.input}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Rechercher par désignation, SN, inventaire, lieu ou date..."
                        style={{ paddingLeft: "2.25rem" }}
                    />
                </div>
            </div>

            <div className={styles.tableWrap}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Désignation</th>
                            <th>Marque</th>
                            <th>Modèle</th>
                            <th>SN</th>
                            <th>Numéro d'inventaire</th>
                            <th>Quantité</th>
                            <th>Lieu d'exécution</th>
                            <th>Dates de visites techniques passées</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8}>Chargement...</td>
                            </tr>
                        ) : rows.length === 0 ? (
                            <tr>
                                <td colSpan={8}>{products.length === 0 ? "Aucun produit renseigné par l'appel d'offre." : "Aucune visite technique passée."}</td>
                            </tr>
                        ) : (
                            rows.map(({ product, meta, dates }, index) => (
                                <tr key={product?.id ?? `${product?.name ?? "produit"}-${index}`}>
                                    <td>{valueOrDash(product?.name ?? product?.designation)}</td>
                                    <td>{valueOrDash(product?.brand)}</td>
                                    <td>{valueOrDash(product?.model)}</td>
                                    <td>{valueOrDash(product?.serialNumber)}</td>
                                    <td>{valueOrDash(product?.inventoryNumber ?? product?.code)}</td>
                                    <td>{valueOrDash(meta.quantity ?? product?.quantity)}</td>
                                    <td>{valueOrDash(meta.executionPlace ?? product?.executionPlace ?? product?.hospital ?? product?.location)}</td>
                                    <td><DateChips dates={dates} /></td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}
