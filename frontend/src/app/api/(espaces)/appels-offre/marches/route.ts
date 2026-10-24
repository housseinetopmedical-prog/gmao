import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

function parseStoredDocument(raw: unknown) {
    const text = String(raw || "").trim();
    if (!text.startsWith("{")) return { documentUrl: text, meta: {} };
    try {
        const parsed = JSON.parse(text);
        if (parsed?.storageKind === "AO_MARKET_META") {
            return { documentUrl: String(parsed.documentUrl || ""), meta: parsed };
        }
    } catch {
        // Ancienne valeur non JSON ou tronquée.
    }
    return { documentUrl: text, meta: {} };
}

function formatMarketRow(item: any) {
    const stored = parseStoredDocument(item.documentUrl);
    return {
        id: item.id,
        equipmentId: item.equipmentId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        organism: item.organism,
        client: item.organism,
        marketNumber: item.marketNumber,
        blNumber: item.marketNumber,
        lot: item.lot,
        agence: item.lot,
        name: item.designation,
        brand: item.brand,
        model: item.model,
        serialNumber: item.serialNumber,
        inventoryNumber: item.inventoryNumber,
        code: item.inventoryNumber,
        articleCode: item.articleCode,
        hospital: item.hospital,
        location: item.hospital,
        city: item.city,
        sector: item.sector,
        service: item.sector,
        contractType: item.contractType,
        contractStartDate: item.contractStartDate,
        contractEndDate: item.contractEndDate,
        blDocumentUrl: stored.documentUrl,
        marketMeta: stored.meta
    };
}

export async function GET() {
    try {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT
                id,
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
            FROM marches
            ORDER BY createdAt DESC, id DESC
        `;

        return NextResponse.json(rows.map(formatMarketRow));
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Chargement des marches impossible." }, { status: 500 });
    }
}
