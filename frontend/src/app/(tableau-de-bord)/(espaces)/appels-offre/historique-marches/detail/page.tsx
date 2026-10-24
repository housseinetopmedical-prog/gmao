"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import styles from "../../appels-offre.module.css";

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

function valueOrDash(value: unknown) {
    const text = String(value || "").trim();
    return text || "-";
}

function unique(values: unknown[]) {
    return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function hasValue(value: unknown) {
    if (Array.isArray(value)) return value.length > 0;
    return String(value || "").trim().length > 0;
}

function firstMetaValue(items: any[], key: string) {
    for (const item of items) {
        const meta = getMeta(item);
        if (hasValue((meta as any)[key])) return (meta as any)[key];
    }
    return "";
}

function firstLotValue(lots: any[], key: string) {
    const lot = lots.find((item) => hasValue(item?.[key]));
    return lot ? lot[key] : "";
}

function formatDate(raw: unknown) {
    if (!raw) return "-";
    const text = String(raw).trim();
    const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const parsed = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : new Date(text);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("fr-FR");
}

function uniqueByExecutionPlace(lots: any[]) {
    const seen = new Set<string>();
    return lots.filter((lot) => {
        const key = String(lot?.executionPlace || lot?.lotNumber || "").trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

type HistoriqueMarcheDetailProps = {
    returnPath?: string;
};

export default function AppelsOffreHistoriqueMarcheDetailPage({ returnPath = "/appels-offre/historique-marches" }: HistoriqueMarcheDetailProps = {}) {
    const searchParams = useSearchParams();
    const targetKey = searchParams.get("key") || "";
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

    const marketItems = useMemo(
        () => items.filter((item) => getMarketKey(item) === targetKey),
        [items, targetKey]
    );
    const products = useMemo(
        () => marketItems.filter((item) => !isMarketOnly(item)),
        [marketItems]
    );
    const first = useMemo(
        () => marketItems.find(isMarketOnly) || marketItems[0] || null,
        [marketItems]
    );
    const meta = getMeta(first);
    const lots = useMemo(() => {
        const allLots = marketItems.flatMap((item) => {
            const itemMeta = getMeta(item);
            if (Array.isArray(itemMeta.lotDetails) && itemMeta.lotDetails.length > 0) return itemMeta.lotDetails;
            return [{
                lotNumber: item.lot || item.agence,
                executionPlace: item.hospital || item.location,
                city: item.city,
                contacts: "",
                mobiles: "",
                fixedPhone: "",
                email: "",
                fax: ""
            }];
        });
        return uniqueByExecutionPlace(allLots);
    }, [marketItems]);
    const lotCities = unique(lots.map((lot) => lot.city));
    const marketCity = lotCities.length > 0
        ? lotCities
        : firstMetaValue(marketItems, "city") || first?.city;
    const contacts = firstMetaValue(marketItems, "contacts") || firstLotValue(lots, "contacts");
    const mobiles = firstMetaValue(marketItems, "mobiles") || firstLotValue(lots, "mobiles");
    const fixedPhone = firstMetaValue(marketItems, "fixedPhone") || firstLotValue(lots, "fixedPhone");
    const email = firstMetaValue(marketItems, "email") || firstLotValue(lots, "email");
    const fax = firstMetaValue(marketItems, "fax") || firstLotValue(lots, "fax");
    const warrantyStartDate = firstMetaValue(marketItems, "warrantyStartDate") || first?.contractStartDate || first?.purchaseDate;
    const warrantyEndDate = firstMetaValue(marketItems, "warrantyEndDate") || first?.contractEndDate || first?.lastMaintenance;
    const maintenancesPerYear = firstMetaValue(marketItems, "maintenancesPerYear");
    const marketCopyUrl = first?.blDocumentUrl || firstMetaValue(marketItems, "marketCopyUrl");

    return (
        <section className={styles.hero}>
            <div className={styles.section}>
                <div className={styles.actions} style={{ justifyContent: "space-between", alignItems: "center", marginTop: 0 }}>
                    <h2 className={styles.heroTitle}>Détail du marché</h2>
                    <Link className="btn btn-outline" href={returnPath}>Retour</Link>
                </div>

                {loading ? (
                    <div className={styles.panelText}>Chargement du détail...</div>
                ) : !first ? (
                    <div className={styles.panelText}>Marché introuvable.</div>
                ) : (
                    <>
                        <div className={styles.grid3} style={{ marginTop: "1rem" }}>
                            <Info label="Maître d'ouvrage" value={first.organism || first.client} />
                            <Info label="Marché numéro / Contrat de maintenance" value={first.marketNumber || first.blNumber} />
                            <Info label="Intitulé du marché" value={meta.marketTitle || first.name} />
                            <Info label="Ville" value={marketCity} />
                            <Info label="Contacts" value={contacts} />
                            <Info label="Portables" value={mobiles} />
                            <Info label="Fixe" value={fixedPhone} />
                            <Info label="Email" value={email} />
                            <Info label="Fax" value={fax} />
                            <Info label="Début de garantie" value={formatDate(warrantyStartDate)} />
                            <Info label="Fin de garantie" value={formatDate(warrantyEndDate)} />
                            <Info label="Maintenances par an" value={maintenancesPerYear} />
                            <DocumentInfo url={marketCopyUrl} />
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Lot numéro</th>
                                        <th>Lieu d'exécution</th>
                                        <th>Ville</th>
                                        <th>Contacts</th>
                                        <th>Portables</th>
                                        <th>Fixe</th>
                                        <th>Email</th>
                                        <th>Fax</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lots.map((lot, index) => (
                                        <tr key={`detail-lot-${index}`}>
                                            <td>{valueOrDash(lot.lotNumber)}</td>
                                            <td>{valueOrDash(lot.executionPlace)}</td>
                                            <td><DisplayValue value={lot.city || marketCity} /></td>
                                            <td><DisplayValue value={lot.contacts || contacts} /></td>
                                            <td><DisplayValue value={lot.mobiles || mobiles} /></td>
                                            <td>{valueOrDash(lot.fixedPhone || fixedPhone)}</td>
                                            <td>{valueOrDash(lot.email || email)}</td>
                                            <td>{valueOrDash(lot.fax || fax)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                                        <th>Dates de visites techniques</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {products.length === 0 ? (
                                        <tr>
                                            <td colSpan={8}>Aucun produit enregistré pour ce marché.</td>
                                        </tr>
                                    ) : products.map((product) => {
                                        const productMeta = getMeta(product);
                                        const dates = Array.isArray(productMeta.technicalVisitDates) ? productMeta.technicalVisitDates : [];
                                        return (
                                            <tr key={`detail-product-${product.id}`}>
                                                <td>{valueOrDash(product.name)}</td>
                                                <td>{valueOrDash(product.brand)}</td>
                                                <td>{valueOrDash(product.model)}</td>
                                                <td>{valueOrDash(product.serialNumber)}</td>
                                                <td>{valueOrDash(product.inventoryNumber || product.code)}</td>
                                                <td>{valueOrDash(productMeta.quantity || product.quantity)}</td>
                                                <td>{valueOrDash(productMeta.executionPlace || product.hospital || product.location)}</td>
                                                <td><InlineList values={dates.map(formatDate)} /></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

function InlineList({ values }: { values: unknown[] }) {
    const cleanValues = unique(values);
    if (cleanValues.length === 0) return <>-</>;
    return (
        <div className={styles.stackList}>
            {cleanValues.map((value) => (
                <span className={styles.miniChip} key={value}>{value}</span>
            ))}
        </div>
    );
}

function displayValues(value: unknown) {
    if (Array.isArray(value)) return unique(value);
    return String(value || "")
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function DisplayValue({ value }: { value: unknown }) {
    const values = displayValues(value);
    if (values.length > 1) return <InlineList values={values} />;
    return <>{values[0] || "-"}</>;
}

function Info({ label, value }: { label: string; value: unknown }) {
    const listValues = displayValues(value);
    return (
        <div className={styles.item}>
            <div className={styles.meta}>{label}</div>
            <div className={styles.itemTitle}>
                {listValues.length > 1 ? <InlineList values={listValues} /> : valueOrDash(listValues[0] || value)}
            </div>
        </div>
    );
}

function DocumentInfo({ url }: { url: unknown }) {
    const href = String(url || "").trim();
    return (
        <div className={styles.item}>
            <div className={styles.meta}>Copie du marché</div>
            {href ? (
                <a className={styles.itemTitle} href={href} target="_blank" rel="noreferrer">Voir le document</a>
            ) : (
                <div className={styles.itemTitle}>-</div>
            )}
        </div>
    );
}
