"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import styles from "../appels-offre.module.css";

type MarketForm = {
    organism: string;
    marketNumber: string;
    marketTitle: string;
    city: string;
    contacts: string;
    mobiles: string;
    marketCopyUrl: string;
    fixedPhone: string;
    email: string;
    fax: string;
    warrantyStartDate: string;
    warrantyEndDate: string;
    maintenancesPerYear: string;
};

type LotRow = {
    lotNumber: string;
    executionPlace: string;
    city: string;
    contacts: string;
    mobiles: string;
    fixedPhone: string;
    email: string;
    fax: string;
};

type ProductRow = {
    designationNumber: string;
    brand: string;
    model: string;
    serialNumber: string;
    inventoryNumber: string;
    quantity: string;
    executionPlace: string;
    technicalVisitDates: string[];
};

const emptyMarket: MarketForm = {
    organism: "",
    marketNumber: "",
    marketTitle: "",
    city: "",
    contacts: "",
    mobiles: "",
    marketCopyUrl: "",
    fixedPhone: "",
    email: "",
    fax: "",
    warrantyStartDate: "",
    warrantyEndDate: "",
    maintenancesPerYear: ""
};

function makeLot(): LotRow {
    return {
        lotNumber: "",
        executionPlace: "",
        city: "",
        contacts: "",
        mobiles: "",
        fixedPhone: "",
        email: "",
        fax: ""
    };
}

function makeProduct(): ProductRow {
    return {
        designationNumber: "",
        brand: "",
        model: "",
        serialNumber: "",
        inventoryNumber: "",
        quantity: "1",
        executionPlace: "",
        technicalVisitDates: [""]
    };
}

function cleanText(value: unknown) {
    return String(value || "").trim();
}

function isMarketOnlyRecord(item: any) {
    const meta = item?.marketMeta && typeof item.marketMeta === "object" ? item.marketMeta : {};
    const serialNumber = cleanText(item?.serialNumber).toUpperCase();
    const inventoryNumber = cleanText(item?.inventoryNumber || item?.code).toUpperCase();
    return item?.recordKind === "MARKET_ONLY"
        || meta.recordKind === "MARKET_ONLY"
        || serialNumber.startsWith("AO-MARCHE-")
        || inventoryNumber.startsWith("AO-MARCHE-")
        || (cleanText(item?.brand).toLowerCase() === "marché" && cleanText(item?.model).toLowerCase() === "maintenance");
}

function formatDisplayDate(raw: unknown) {
    const parsed = new Date(String(raw || ""));
    if (Number.isNaN(parsed.getTime())) return cleanText(raw) || "-";
    return parsed.toLocaleDateString("fr-FR");
}

export default function AppelsOffreMarchesPage() {
    const [activePanel, setActivePanel] = useState<"markets" | "products">("markets");
    const [market, setMarket] = useState<MarketForm>(emptyMarket);
    const [lots, setLots] = useState<LotRow[]>([makeLot()]);
    const [products, setProducts] = useState<ProductRow[]>([makeProduct()]);
    const [marketStepReady, setMarketStepReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [feedback, setFeedback] = useState("");

    const executionPlaces = useMemo(
        () => lots.map((lot) => lot.executionPlace.trim()).filter(Boolean),
        [lots]
    );

    const updateMarket = (key: keyof MarketForm, value: string) => {
        setMarketStepReady(false);
        setMarket((prev) => ({ ...prev, [key]: value }));
    };

    const updateMarketList = (key: "contacts" | "mobiles", index: number, value: string) => {
        const values = market[key].length > 0 ? market[key].split("\n") : [""];
        values[index] = value;
        updateMarket(key, values.join("\n"));
    };

    const addMarketListItem = (key: "contacts" | "mobiles") => {
        const values = market[key].length > 0 ? market[key].split("\n") : [""];
        updateMarket(key, [...values, ""].join("\n"));
    };

    const removeMarketListItem = (key: "contacts" | "mobiles", index: number) => {
        const values = market[key].length > 0 ? market[key].split("\n") : [""];
        const nextValues = values.length === 1 ? [""] : values.filter((_, valueIndex) => valueIndex !== index);
        updateMarket(key, nextValues.join("\n"));
    };

    const updateLotList = (lotIndex: number, key: "contacts" | "mobiles", valueIndex: number, value: string) => {
        const values = lots[lotIndex]?.[key].length > 0 ? lots[lotIndex][key].split("\n") : [""];
        values[valueIndex] = value;
        updateLot(lotIndex, key, values.join("\n"));
    };

    const addLotListItem = (lotIndex: number, key: "contacts" | "mobiles") => {
        const values = lots[lotIndex]?.[key].length > 0 ? lots[lotIndex][key].split("\n") : [""];
        updateLot(lotIndex, key, [...values, ""].join("\n"));
    };

    const removeLotListItem = (lotIndex: number, key: "contacts" | "mobiles", valueIndex: number) => {
        const values = lots[lotIndex]?.[key].length > 0 ? lots[lotIndex][key].split("\n") : [""];
        const nextValues = values.length === 1 ? [""] : values.filter((_, indexToRemove) => indexToRemove !== valueIndex);
        updateLot(lotIndex, key, nextValues.join("\n"));
    };

    const uploadMarketCopy = async (file: File | null) => {
        if (!file) return;
        setUploading(true);
        setFeedback("");
        try {
            const payload = new FormData();
            payload.append("file", file);
            const response = await fetch("/api/uploads", { method: "POST", body: payload });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || "Téléversement impossible.");
            updateMarket("marketCopyUrl", String(data.url || data.rawUrl || ""));
            setFeedback("Copie du marché ajoutée.");
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant le téléversement.");
        } finally {
            setUploading(false);
        }
    };

    const updateLot = (index: number, key: keyof LotRow, value: string) => {
        setMarketStepReady(false);
        setLots((prev) => prev.map((lot, lotIndex) => (lotIndex === index ? { ...lot, [key]: value } : lot)));
    };

    const updateProduct = (index: number, key: keyof ProductRow, value: string) => {
        setProducts((prev) => prev.map((product, productIndex) => (productIndex === index ? { ...product, [key]: value } : product)));
    };

    const updateProductVisitDate = (productIndex: number, dateIndex: number, value: string) => {
        setProducts((prev) => prev.map((product, index) => {
            if (index !== productIndex) return product;
            const dates = product.technicalVisitDates.length > 0 ? product.technicalVisitDates : [""];
            const nextDates = [...dates];
            nextDates[dateIndex] = value;
            return { ...product, technicalVisitDates: nextDates };
        }));
    };

    const addProductVisitDate = (productIndex: number) => {
        setProducts((prev) => prev.map((product, index) => (
            index === productIndex
                ? { ...product, technicalVisitDates: [...(product.technicalVisitDates.length > 0 ? product.technicalVisitDates : [""]), ""] }
                : product
        )));
    };

    const removeProductVisitDate = (productIndex: number, dateIndex: number) => {
        setProducts((prev) => prev.map((product, index) => {
            if (index !== productIndex) return product;
            const dates = product.technicalVisitDates.length > 0 ? product.technicalVisitDates : [""];
            const nextDates = dates.length === 1 ? [""] : dates.filter((_, indexToRemove) => indexToRemove !== dateIndex);
            return { ...product, technicalVisitDates: nextDates };
        }));
    };

    const addLot = () => setLots((prev) => [...prev, makeLot()]);
    const addProduct = () => setProducts((prev) => [...prev, makeProduct()]);

    const removeLot = (index: number) => {
        setLots((prev) => (prev.length === 1 ? prev : prev.filter((_, lotIndex) => lotIndex !== index)));
    };

    const removeProduct = (index: number) => {
        setProducts((prev) => (prev.length === 1 ? prev : prev.filter((_, productIndex) => productIndex !== index)));
    };

    const buildMarketPayload = () => ({
        organism: market.organism,
        marketNumber: market.marketNumber,
        marketCopyUrl: market.marketCopyUrl,
        marketTitle: market.marketTitle,
        city: market.city,
        contacts: market.contacts.split("\n").map((value) => value.trim()).filter(Boolean),
        mobiles: market.mobiles.split("\n").map((value) => value.trim()).filter(Boolean),
        fixedPhone: market.fixedPhone,
        email: market.email,
        fax: market.fax,
        warrantyStartDate: market.warrantyStartDate,
        warrantyEndDate: market.warrantyEndDate,
        maintenancesPerYear: market.maintenancesPerYear,
        lots
    });

    const validateMarketStep = () => {
        if (!cleanText(market.organism) || !cleanText(market.marketNumber) || !cleanText(market.marketTitle)) {
            return "Le maître d'ouvrage, le numéro de marché et l'intitulé du marché sont obligatoires.";
        }

        const hasUsableLot = lots.some((lot) => cleanText(lot.lotNumber) && cleanText(lot.executionPlace) && cleanText(lot.city));
        if (!hasUsableLot) {
            return "Ajoutez au moins un lot avec son numéro, son lieu d'exécution et sa ville.";
        }

        return "";
    };

    const submitMarket = () => {
        const error = validateMarketStep();
        if (error) {
            setFeedback(error);
            return;
        }

        setMarketStepReady(true);
        setActivePanel("products");
        setFeedback("Marché renseigné. Complétez maintenant les produits dédiés à ce marché pour finaliser l'enregistrement.");
    };

    const submitProducts = async () => {
        const marketError = validateMarketStep();
        if (marketError) {
            setActivePanel("markets");
            setFeedback(marketError);
            return;
        }

        setSaving(true);
        setFeedback("");
        try {
            const response = await fetch("/api/appels-offre/equipements", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...buildMarketPayload(),
                    rows: products
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data?.error || "Enregistrement impossible.");
            setProducts([makeProduct()]);
            setMarket(emptyMarket);
            setLots([makeLot()]);
            setMarketStepReady(false);
            setActivePanel("markets");
            setFeedback("Marché et produits enregistrés. Les informations complètes sont disponibles dans le détail du marché depuis l'historique des marchés.");
        } catch (error: any) {
            setFeedback(error?.message || "Erreur pendant l'enregistrement.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={styles.hero}>
            <div className={styles.tabs}>
                <button
                    type="button"
                    className={`${styles.tab} ${activePanel === "markets" ? styles.tabActive : ""}`}
                    onClick={() => setActivePanel("markets")}
                >
                    Marchés
                </button>
                <button
                    type="button"
                    className={`${styles.tab} ${activePanel === "products" ? styles.tabActive : ""}`}
                    onClick={submitMarket}
                >
                    Produits
                </button>
            </div>

            {activePanel === "markets" ? (
                <div className={styles.section}>
                    <h2 className={styles.heroTitle}>Marché</h2>
                    <div className={styles.grid3} style={{ marginTop: "1rem" }}>
                        <Field label="Maître d'ouvrage" value={market.organism} onChange={(value) => updateMarket("organism", value)} />
                        <Field label="Marché numéro / Contrat de maintenance" value={market.marketNumber} onChange={(value) => updateMarket("marketNumber", value)} />
                        <Field label="Intitulé du marché" value={market.marketTitle} onChange={(value) => updateMarket("marketTitle", value)} />
                        <Field label="Ville" value={market.city} onChange={(value) => updateMarket("city", value)} />
                        <DynamicListField label="Contacts" values={market.contacts.length > 0 ? market.contacts.split("\n") : [""]} onAdd={() => addMarketListItem("contacts")} onRemove={(index) => removeMarketListItem("contacts", index)} onChange={(index, value) => updateMarketList("contacts", index, value)} />
                        <DynamicListField label="Portables" values={market.mobiles.length > 0 ? market.mobiles.split("\n") : [""]} onAdd={() => addMarketListItem("mobiles")} onRemove={(index) => removeMarketListItem("mobiles", index)} onChange={(index, value) => updateMarketList("mobiles", index, value)} />
                        <Field label="Fixe" value={market.fixedPhone} onChange={(value) => updateMarket("fixedPhone", value)} />
                        <Field label="Email" value={market.email} onChange={(value) => updateMarket("email", value)} type="email" />
                        <Field label="Fax" value={market.fax} onChange={(value) => updateMarket("fax", value)} />
                        <Field label="Date de début de garantie" value={market.warrantyStartDate} onChange={(value) => updateMarket("warrantyStartDate", value)} type="date" />
                        <Field label="Date de fin de garantie" value={market.warrantyEndDate} onChange={(value) => updateMarket("warrantyEndDate", value)} type="date" />
                        <Field label="Nombre de maintenances par an" value={market.maintenancesPerYear} onChange={(value) => updateMarket("maintenancesPerYear", value)} type="number" />
                        <div className={styles.field}>
                            <label className={styles.label}>Copie du marché</label>
                            <label className="btn btn-outline" style={{ justifyContent: "center" }}>
                                <input type="file" style={{ display: "none" }} onChange={(event) => uploadMarketCopy(event.target.files?.[0] || null)} />
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {uploading ? "Téléversement..." : "Ajouter un document"}
                            </label>
                            {market.marketCopyUrl ? <a className={styles.meta} href={market.marketCopyUrl} target="_blank" rel="noreferrer">Document ajouté</a> : null}
                        </div>
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
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lots.map((lot, index) => (
                                    <tr key={`lot-${index}`}>
                                        <td><TableInput value={lot.lotNumber} onChange={(value) => updateLot(index, "lotNumber", value)} /></td>
                                        <td><TableInput value={lot.executionPlace} onChange={(value) => updateLot(index, "executionPlace", value)} /></td>
                                        <td><TableInput value={lot.city} onChange={(value) => updateLot(index, "city", value)} /></td>
                                        <td>
                                            <TableListField
                                                values={lot.contacts.length > 0 ? lot.contacts.split("\n") : [""]}
                                                label="contact"
                                                onAdd={() => addLotListItem(index, "contacts")}
                                                onRemove={(valueIndex) => removeLotListItem(index, "contacts", valueIndex)}
                                                onChange={(valueIndex, value) => updateLotList(index, "contacts", valueIndex, value)}
                                            />
                                        </td>
                                        <td>
                                            <TableListField
                                                values={lot.mobiles.length > 0 ? lot.mobiles.split("\n") : [""]}
                                                label="portable"
                                                onAdd={() => addLotListItem(index, "mobiles")}
                                                onRemove={(valueIndex) => removeLotListItem(index, "mobiles", valueIndex)}
                                                onChange={(valueIndex, value) => updateLotList(index, "mobiles", valueIndex, value)}
                                            />
                                        </td>
                                        <td><TableInput value={lot.fixedPhone} onChange={(value) => updateLot(index, "fixedPhone", value)} /></td>
                                        <td><TableInput value={lot.email} onChange={(value) => updateLot(index, "email", value)} type="email" /></td>
                                        <td><TableInput value={lot.fax} onChange={(value) => updateLot(index, "fax", value)} /></td>
                                        <td>
                                            <button type="button" className="btn btn-outline" onClick={() => removeLot(index)} disabled={lots.length === 1}>
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" className="btn btn-outline" onClick={addLot}>
                            <Plus size={16} />
                            Ajouter un lot
                        </button>
                        <button type="button" className="btn btn-primary" onClick={submitMarket} disabled={saving}>
                            <ArrowRight size={16} />
                            Valider le marché et passer aux produits
                        </button>
                    </div>

                    <div className={styles.nextStep} style={{ display: "none" }}>
                        <div>
                            <div className={styles.panelTitle}>Étape suivante</div>
                            <p className={styles.panelText}>
                                Le marché sera enregistré uniquement après la saisie des produits associés.
                            </p>
                        </div>
                        <button type="button" className="btn btn-primary" onClick={submitMarket}>
                            Passer aux produits
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            ) : (
                <div className={styles.section}>
                    <h2 className={styles.heroTitle}>Produits</h2>
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
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product, index) => (
                                    <tr key={`product-${index}`}>
                                        <td><TableInput value={product.designationNumber} onChange={(value) => updateProduct(index, "designationNumber", value)} /></td>
                                        <td><TableInput value={product.brand} onChange={(value) => updateProduct(index, "brand", value)} /></td>
                                        <td><TableInput value={product.model} onChange={(value) => updateProduct(index, "model", value)} /></td>
                                        <td><TableInput value={product.serialNumber} onChange={(value) => updateProduct(index, "serialNumber", value)} /></td>
                                        <td><TableInput value={product.inventoryNumber} onChange={(value) => updateProduct(index, "inventoryNumber", value)} /></td>
                                        <td><TableInput value={product.quantity} onChange={(value) => updateProduct(index, "quantity", value)} type="number" /></td>
                                        <td>
                                            <select className={styles.select} value={product.executionPlace} onChange={(event) => updateProduct(index, "executionPlace", event.target.value)}>
                                                <option value="">Sélectionner</option>
                                                {executionPlaces.map((place) => (
                                                    <option key={place} value={place}>{place}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <VisitDatesField
                                                values={product.technicalVisitDates.length > 0 ? product.technicalVisitDates : [""]}
                                                onChange={(dateIndex, value) => updateProductVisitDate(index, dateIndex, value)}
                                                onAdd={() => addProductVisitDate(index)}
                                                onRemove={(dateIndex) => removeProductVisitDate(index, dateIndex)}
                                            />
                                        </td>
                                        <td>
                                            <button type="button" className="btn btn-outline" onClick={() => removeProduct(index)} disabled={products.length === 1}>
                                                <Trash2 size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className={styles.actions}>
                        <button type="button" className="btn btn-outline" onClick={addProduct} title="Ajouter une ligne de produit" aria-label="Ajouter une ligne de produit">
                            <Plus size={16} />
                        </button>
                        <button type="button" className="btn btn-primary" onClick={submitProducts} disabled={saving || !marketStepReady} title="Enregistrer le marché avec ses produits" aria-label="Enregistrer le marché avec ses produits">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                        </button>
                    </div>
                </div>
            )}

            {feedback ? <div className={styles.feedback}>{feedback}</div> : null}
        </section>
    );
}

function Field({
    label,
    value,
    onChange,
    placeholder = "",
    type = "text"
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <div className={styles.field}>
            <label className={styles.label}>{label}</label>
            <input className={styles.input} type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

function DynamicListField({
    label,
    values,
    onAdd,
    onRemove,
    onChange
}: {
    label: string;
    values: string[];
    onAdd: () => void;
    onRemove: (index: number) => void;
    onChange: (index: number, value: string) => void;
}) {
    return (
        <div className={styles.field}>
            <label className={styles.label}>{label}</label>
            <div style={{ display: "grid", gap: "0.45rem" }}>
                {values.map((value, index) => (
                    <div key={`${label}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.35rem", alignItems: "center" }}>
                        <input className={styles.input} value={value} onChange={(event) => onChange(index, event.target.value)} />
                        <button type="button" className="btn btn-outline" onClick={onAdd} aria-label={`Ajouter ${label.toLowerCase()}`}>
                            <Plus size={15} />
                        </button>
                        <button type="button" className="btn btn-outline" onClick={() => onRemove(index)} disabled={values.length === 1 && !value.trim()} aria-label={`Supprimer ${label.toLowerCase()}`}>
                            <Trash2 size={15} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

function TableInput({
    value,
    onChange,
    placeholder = "",
    type = "text"
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}) {
    return (
        <input
            className={styles.input}
            type={type}
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            style={{ minWidth: "150px" }}
        />
    );
}

function TableListField({
    values,
    label,
    onAdd,
    onRemove,
    onChange
}: {
    values: string[];
    label: string;
    onAdd: () => void;
    onRemove: (index: number) => void;
    onChange: (index: number, value: string) => void;
}) {
    return (
        <div style={{ display: "grid", gap: "0.45rem", minWidth: "230px" }}>
            {values.map((value, index) => (
                <div key={`${label}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.35rem", alignItems: "center" }}>
                    <input
                        className={styles.input}
                        value={value}
                        onChange={(event) => onChange(index, event.target.value)}
                    />
                    <button type="button" className="btn btn-outline" onClick={onAdd} title={`Ajouter un ${label}`} aria-label={`Ajouter un ${label}`}>
                        <Plus size={15} />
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => onRemove(index)} disabled={values.length === 1 && !value.trim()} title={`Supprimer ce ${label}`} aria-label={`Supprimer ce ${label}`}>
                        <Trash2 size={15} />
                    </button>
                </div>
            ))}
        </div>
    );
}

function VisitDatesField({
    values,
    onChange,
    onAdd,
    onRemove
}: {
    values: string[];
    onChange: (index: number, value: string) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
}) {
    return (
        <div style={{ display: "grid", gap: "0.45rem", minWidth: "250px" }}>
            {values.map((value, index) => (
                <div key={`visit-date-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.35rem", alignItems: "center" }}>
                    <input
                        className={styles.input}
                        type="date"
                        value={value}
                        onChange={(event) => onChange(index, event.target.value)}
                    />
                    <button type="button" className="btn btn-outline" onClick={onAdd} aria-label="Ajouter une date de visite technique">
                        <Plus size={15} />
                    </button>
                    <button type="button" className="btn btn-outline" onClick={() => onRemove(index)} disabled={values.length === 1 && !value.trim()} aria-label="Supprimer la date de visite technique">
                        <Trash2 size={15} />
                    </button>
                </div>
            ))}
        </div>
    );
}
