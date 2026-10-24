import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/metier/base-donnees";

function clean(raw: unknown) {
    return String(raw || "").trim();
}

function parseMarketMeta(raw: unknown) {
    try {
        const parsed = JSON.parse(String(raw || ""));
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        const text = String(raw || "");
        const readText = (key: string) => {
            const match = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
            return match ? match[1] : "";
        };
        const readArray = (key: string) => {
            const match = text.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`));
            if (!match) return [];
            return Array.from(match[1].matchAll(/"([^"]*)"/g)).map((item) => item[1]).filter(Boolean);
        };
        return {
            marketTitle: readText("marketTitle"),
            city: readText("city"),
            contacts: readArray("contacts"),
            mobiles: readArray("mobiles"),
            fixedPhone: readText("fixedPhone"),
            email: readText("email"),
            fax: readText("fax"),
            warrantyStartDate: readText("warrantyStartDate"),
            warrantyEndDate: readText("warrantyEndDate"),
            maintenancesPerYear: readText("maintenancesPerYear")
        };
    }
}

function serializeMarketMeta(meta: Record<string, unknown>) {
    return JSON.stringify(meta);
}

function parseStoredMeta(raw: unknown) {
    const text = String(raw || "").trim();
    if (!text.startsWith("{")) return {};
    const parsed = parseMarketMeta(text);
    return (parsed as any).storageKind === "AO_MARKET_META" ? parsed : {};
}

function makeStoredDocument(meta: Record<string, unknown>) {
    return JSON.stringify({ storageKind: "AO_MARKET_META", ...meta });
}

function firstFilled(...values: unknown[]) {
    for (const value of values) {
        if (Array.isArray(value) && value.length > 0) return value;
        if (String(value || "").trim()) return value;
    }
    return "";
}

function makeMarketOnlyIdentifier(organism: string, marketNumber: string) {
    const source = `${organism}-${marketNumber}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toUpperCase();
    return `AO-MARCHE-${source || Date.now()}`;
}

function formatEquipment(item: any, storedMeta: Record<string, unknown> = {}) {
    const meta = { ...parseMarketMeta(item.invoiceUrl), ...storedMeta };
    const serialNumber = String(item.serialNumber || "").trim().toUpperCase();
    const inventoryNumber = String(meta.inventoryNumber || item.code || "").trim().toUpperCase();
    const recordKind = String((meta as any).recordKind || "").trim()
        || (serialNumber.startsWith("AO-MARCHE-") || inventoryNumber.startsWith("AO-MARCHE-") ? "MARKET_ONLY" : "PRODUCT");
    return {
        ...item,
        marketMeta: meta,
        recordKind,
        hospital: String(meta.hospital || "").trim(),
        city: String(meta.city || "").trim(),
        articleCode: String(meta.articleCode || "").trim(),
        contractType: String(meta.contractType || "").trim(),
        contractStartDate: String(meta.contractStartDate || "").trim(),
        contractEndDate: String(meta.contractEndDate || "").trim(),
        inventoryNumber: String(meta.inventoryNumber || item.code || "").trim(),
        lot: String(item.agence || "").trim(),
        marketNumber: String(item.blNumber || "").trim(),
        organism: String(item.client || "").trim(),
        owner: String(item.client || "").trim(),
        sector: String(item.service || "").trim(),
        quantity: String((meta as any).quantity || "").trim(),
        executionPlace: String((meta as any).executionPlace || meta.hospital || item.location || "").trim(),
        technicalVisitDates: Array.isArray((meta as any).technicalVisitDates) ? (meta as any).technicalVisitDates : []
    };
}

export async function GET() {
    try {
        const equipments = await prisma.equipment.findMany({
            where: { type: "APPEL_OFFRE" },
            orderBy: { createdAt: "desc" }
        });
        const marketRows = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT equipmentId, documentUrl, city, hospital, lot, contractStartDate, contractEndDate
            FROM marches
            WHERE equipmentId IS NOT NULL
        `);
        const metaByEquipment = new Map<number, Record<string, unknown>>();
        marketRows.forEach((row) => {
            const storedMeta = parseStoredMeta(row.documentUrl);
            const meta = {
                ...storedMeta,
                city: (storedMeta as any).city || row.city || "",
                hospital: (storedMeta as any).hospital || row.hospital || "",
                lot: (storedMeta as any).lot || row.lot || "",
                contractStartDate: (storedMeta as any).contractStartDate || row.contractStartDate || "",
                contractEndDate: (storedMeta as any).contractEndDate || row.contractEndDate || ""
            };
            metaByEquipment.set(Number(row.equipmentId), meta);
        });

        return NextResponse.json(equipments.map((item) => formatEquipment(item, metaByEquipment.get(item.id))));
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Chargement impossible." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const organism = clean(body.organism);
        const marketNumber = clean(body.marketNumber);
        const marketCopyUrl = clean(body.marketCopyUrl);
        const marketTitle = clean(body.marketTitle);
        const headerCity = clean(body.city);
        const warrantyStartDate = clean(body.warrantyStartDate);
        const warrantyEndDate = clean(body.warrantyEndDate);
        const lots: any[] = Array.isArray(body.lots) ? body.lots : [];
        const isMarketOnly = Boolean(body.marketOnly);
        const rows: any[] = isMarketOnly ? [] : (Array.isArray(body.rows) ? body.rows : [body]);

        if (!organism || !marketNumber) {
            return NextResponse.json({ error: "Le maître d'ouvrage et le numéro de marché sont obligatoires." }, { status: 400 });
        }

        const existingRows = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT documentUrl, city, hospital, lot, contractStartDate, contractEndDate
            FROM marches
            WHERE organism = ${organism}
              AND marketNumber = ${marketNumber}
            ORDER BY createdAt DESC, id DESC
        `);
        const existingMeta = existingRows.reduce<Record<string, unknown>>((merged, row) => {
            const stored = parseStoredMeta(row.documentUrl);
            const fallbackDocumentUrl = String(row.documentUrl || "").trim().startsWith("{") ? "" : String(row.documentUrl || "");
            return {
                ...merged,
                ...stored,
                city: firstFilled((stored as any).city, merged.city, row.city),
                hospital: firstFilled((stored as any).hospital, merged.hospital, row.hospital),
                lot: firstFilled((stored as any).lot, merged.lot, row.lot),
                contractStartDate: firstFilled((stored as any).contractStartDate, merged.contractStartDate, row.contractStartDate),
                contractEndDate: firstFilled((stored as any).contractEndDate, merged.contractEndDate, row.contractEndDate),
                documentUrl: firstFilled((stored as any).documentUrl, merged.documentUrl, fallbackDocumentUrl),
                marketCopyUrl: firstFilled((stored as any).marketCopyUrl, merged.marketCopyUrl, fallbackDocumentUrl)
            };
        }, {});

        const contacts = Array.isArray(body.contacts) && body.contacts.length > 0 ? body.contacts : ((existingMeta as any).contacts || []);
        const mobiles = Array.isArray(body.mobiles) && body.mobiles.length > 0 ? body.mobiles : ((existingMeta as any).mobiles || []);
        const effectiveLots = lots.length > 0 ? lots : (Array.isArray((existingMeta as any).lotDetails) ? (existingMeta as any).lotDetails : []);
        const effectiveMarketCopyUrl = marketCopyUrl || String((existingMeta as any).marketCopyUrl || (existingMeta as any).documentUrl || "");
        const baseMarketMeta = {
            city: firstFilled(headerCity, (existingMeta as any).city),
            marketTitle: firstFilled(marketTitle, (existingMeta as any).marketTitle),
            contacts,
            mobiles,
            fixedPhone: firstFilled(clean(body.fixedPhone), (existingMeta as any).fixedPhone),
            email: firstFilled(clean(body.email), (existingMeta as any).email),
            fax: firstFilled(clean(body.fax), (existingMeta as any).fax),
            warrantyStartDate: firstFilled(warrantyStartDate, (existingMeta as any).warrantyStartDate, (existingMeta as any).contractStartDate),
            warrantyEndDate: firstFilled(warrantyEndDate, (existingMeta as any).warrantyEndDate, (existingMeta as any).contractEndDate),
            maintenancesPerYear: firstFilled(clean(body.maintenancesPerYear), (existingMeta as any).maintenancesPerYear),
            lotDetails: effectiveLots,
            marketCopyUrl: effectiveMarketCopyUrl
        };

        const marketOnlyRow = () => {
            const firstLot = effectiveLots[0] || {};
            const identifier = makeMarketOnlyIdentifier(organism, marketNumber);
            const city = clean(firstLot.city || baseMarketMeta.city);
            const executionPlace = clean(firstLot.executionPlace || firstLot.lotNumber || baseMarketMeta.city || organism);
            const lot = clean(firstLot.lotNumber || firstLot.executionPlace || "Marché");
            const fullMeta = {
                ...baseMarketMeta,
                recordKind: "MARKET_ONLY",
                city,
                hospital: executionPlace,
                contractType: "MAINTENANCE",
                contractStartDate: warrantyStartDate,
                contractEndDate: warrantyEndDate,
                inventoryNumber: identifier,
                executionPlace,
                quantity: "",
                technicalVisitDates: []
            };

            return {
                recordKind: "MARKET_ONLY",
                equipmentData: {
                    name: String(baseMarketMeta.marketTitle || "Marché enregistré"),
                    type: "APPEL_OFFRE" as const,
                    brand: "Marché",
                    model: "Maintenance",
                    serialNumber: identifier,
                    code: identifier,
                    location: executionPlace || organism,
                    service: "Maintenance",
                    client: organism,
                    blNumber: marketNumber,
                    blDocumentUrl: effectiveMarketCopyUrl || null,
                    agence: lot,
                    purchaseDate: baseMarketMeta.warrantyStartDate ? new Date(String(baseMarketMeta.warrantyStartDate)) : null,
                    lastMaintenance: baseMarketMeta.warrantyEndDate ? new Date(String(baseMarketMeta.warrantyEndDate)) : null,
                    warrantyMonths: null,
                    invoiceUrl: serializeMarketMeta({
                        recordKind: "MARKET_ONLY",
                        marketTitle: baseMarketMeta.marketTitle,
                        city,
                        contractStartDate: baseMarketMeta.warrantyStartDate,
                        contractEndDate: baseMarketMeta.warrantyEndDate,
                        inventoryNumber: identifier
                    }),
                    status: "OPERATIONAL" as const,
                    criticality: "LOW" as const
                },
                historyData: {
                    organism,
                    marketNumber,
                    lot,
                    designation: String(baseMarketMeta.marketTitle || "Marché enregistré"),
                    brand: "Marché",
                    model: "Maintenance",
                    serialNumber: identifier,
                    inventoryNumber: identifier,
                    articleCode: "",
                    hospital: executionPlace || organism,
                    city,
                    sector: "Maintenance",
                    contractType: "Maintenance",
                    contractStartDate: baseMarketMeta.warrantyStartDate ? new Date(String(baseMarketMeta.warrantyStartDate)) : null,
                    contractEndDate: baseMarketMeta.warrantyEndDate ? new Date(String(baseMarketMeta.warrantyEndDate)) : null,
                    documentUrl: makeStoredDocument({ ...fullMeta, documentUrl: effectiveMarketCopyUrl || "" })
                }
            };
        };

        const normalizedRows = isMarketOnly ? [marketOnlyRow()] : rows.map((row: any) => {
            const designation = clean(row.designation || row.designationNumber);
            const brand = clean(row.brand);
            const model = clean(row.model);
            const serialNumber = clean(row.serialNumber);
            const inventoryNumber = clean(row.inventoryNumber);
            const defaultLot = effectiveLots.length === 1 ? effectiveLots[0] : {};
            const executionPlace = clean(row.executionPlace || row.hospital || defaultLot.executionPlace || defaultLot.lotNumber || headerCity);
            const selectedLot = effectiveLots.find((lotItem: any) => clean(lotItem.executionPlace) === executionPlace) || defaultLot || {};
            const city = clean(row.city || selectedLot.city || baseMarketMeta.city);
            const hospital = clean(row.hospital || executionPlace);
            const sector = clean(row.sector || "PRIVE").toUpperCase();
            const lot = clean(row.lot || selectedLot.lotNumber || executionPlace);
            const articleCode = clean(row.articleCode);
            const contractType = clean(row.contractType || "MAINTENANCE").toUpperCase();
            const contractStartDate = clean(row.contractStartDate || baseMarketMeta.warrantyStartDate);
            const contractEndDate = clean(row.contractEndDate || baseMarketMeta.warrantyEndDate);
            const quantity = clean(row.quantity || "1");
            const technicalVisitDates = Array.isArray(row.technicalVisitDates)
                ? row.technicalVisitDates.map((value: unknown) => clean(value)).filter(Boolean)
                : String(row.technicalVisitDates || "")
                    .split(/[,\n;]+/g)
                    .map((value) => value.trim())
                    .filter(Boolean);

            if (!designation || !brand || !model || !serialNumber || !inventoryNumber || !city || !hospital || !sector || !lot || !contractType || !contractStartDate || !contractEndDate) {
                throw new Error("Toutes les lignes doivent contenir les informations du marché et du produit.");
            }
            const fullMeta = {
                ...baseMarketMeta,
                recordKind: "PRODUCT",
                city,
                hospital,
                articleCode,
                contractType,
                contractStartDate,
                contractEndDate,
                inventoryNumber,
                executionPlace,
                quantity,
                technicalVisitDates
            };

            return {
                equipmentData: {
                    name: designation,
                    type: "APPEL_OFFRE" as const,
                    brand,
                    model,
                    serialNumber,
                    code: inventoryNumber,
                    location: hospital,
                    service: sector === "PUBLIC" ? "Public" : "Privé",
                    client: organism,
                    blNumber: marketNumber,
                    blDocumentUrl: effectiveMarketCopyUrl || null,
                    agence: lot,
                    purchaseDate: new Date(contractStartDate),
                    lastMaintenance: new Date(contractEndDate),
                    warrantyMonths: contractType === "GARANTIE" ? 1 : 2,
                    invoiceUrl: serializeMarketMeta({
                        recordKind: "PRODUCT",
                        marketTitle: baseMarketMeta.marketTitle,
                        city,
                        hospital,
                        articleCode,
                        contractType,
                        contractStartDate,
                        contractEndDate,
                        inventoryNumber,
                        executionPlace,
                        quantity,
                        technicalVisitDates
                    }),
                    status: "OPERATIONAL" as const,
                    criticality: "LOW" as const
                },
                recordKind: "PRODUCT",
                historyData: {
                    organism,
                    marketNumber,
                    lot,
                    designation,
                    brand,
                    model,
                    serialNumber,
                    inventoryNumber,
                    articleCode,
                    hospital,
                    city,
                    sector: sector === "PUBLIC" ? "Public" : "Privé",
                    contractType,
                    contractStartDate: new Date(contractStartDate),
                    contractEndDate: new Date(contractEndDate),
                    documentUrl: makeStoredDocument({ ...fullMeta, documentUrl: effectiveMarketCopyUrl || "" })
                }
            };
        });

        const created = await prisma.$transaction(async (tx) => {
            const savedEquipments = [];

            for (const row of normalizedRows) {
                const savedEquipment = row.recordKind === "MARKET_ONLY"
                    ? await tx.equipment.upsert({
                        where: { serialNumber: row.equipmentData.serialNumber },
                        update: row.equipmentData,
                        create: row.equipmentData
                    })
                    : await tx.equipment.create({ data: row.equipmentData });
                savedEquipments.push(savedEquipment);

                await tx.$executeRaw(Prisma.sql`
                    INSERT INTO historique_marches (
                        equipmentId,
                        organism,
                        marketNumber,
                        lot,
                        designation,
                        brand,
                        model,
                        serialNumber,
                        inventoryNumber,
                        articleCode,
                        hospital,
                        city,
                        sector,
                        contractType,
                        contractStartDate,
                        contractEndDate,
                        documentUrl,
                        createdAt,
                        updatedAt
                    ) VALUES (
                        ${savedEquipment.id},
                        ${row.historyData.organism},
                        ${row.historyData.marketNumber},
                        ${row.historyData.lot},
                        ${row.historyData.designation},
                        ${row.historyData.brand},
                        ${row.historyData.model},
                        ${row.historyData.serialNumber},
                        ${row.historyData.inventoryNumber},
                        ${row.historyData.articleCode},
                        ${row.historyData.hospital},
                        ${row.historyData.city},
                        ${row.historyData.sector},
                        ${row.historyData.contractType},
                        ${row.historyData.contractStartDate},
                        ${row.historyData.contractEndDate},
                        ${row.historyData.documentUrl},
                        NOW(3),
                        NOW(3)
                    )
                `);

                await tx.$executeRaw(Prisma.sql`
                    INSERT INTO marches (
                        equipmentId,
                        organism,
                        marketNumber,
                        lot,
                        designation,
                        brand,
                        model,
                        serialNumber,
                        inventoryNumber,
                        articleCode,
                        hospital,
                        city,
                        sector,
                        contractType,
                        contractStartDate,
                        contractEndDate,
                        documentUrl,
                        createdAt,
                        updatedAt
                    ) VALUES (
                        ${savedEquipment.id},
                        ${row.historyData.organism},
                        ${row.historyData.marketNumber},
                        ${row.historyData.lot},
                        ${row.historyData.designation},
                        ${row.historyData.brand},
                        ${row.historyData.model},
                        ${row.historyData.serialNumber},
                        ${row.historyData.inventoryNumber},
                        ${row.historyData.articleCode},
                        ${row.historyData.hospital},
                        ${row.historyData.city},
                        ${row.historyData.sector},
                        ${row.historyData.contractType},
                        ${row.historyData.contractStartDate},
                        ${row.historyData.contractEndDate},
                        ${row.historyData.documentUrl},
                        NOW(3),
                        NOW(3)
                    )
                `);
            }

            return savedEquipments;
        });

        return NextResponse.json(created.map((item) => formatEquipment(item)), { status: 201 });
    } catch (error: any) {
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "SN ou numéro d'inventaire déjà utilisé." }, { status: 409 });
        }
        return NextResponse.json({ error: error?.message || "Création impossible." }, { status: 500 });
    }
}


