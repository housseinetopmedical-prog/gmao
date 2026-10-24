import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";

type EquipmentStatusValue = "OPERATIONAL" | "DOWN_AT_CLIENT" | "IN_WORKSHOP" | "ON_LOAN" | "REPLACED" | "RETIRED" | "MAINTENANCE_REQUIRED";

function normalizeEquipmentStatus(raw: unknown): EquipmentStatusValue {
    const value = String(raw || "").trim().toUpperCase();
    if (["OPERATIONAL", "DOWN_AT_CLIENT", "IN_WORKSHOP", "ON_LOAN", "REPLACED", "RETIRED", "MAINTENANCE_REQUIRED"].includes(value)) {
        return value as EquipmentStatusValue;
    }
    return "OPERATIONAL";
}

export async function GET() {
    try {
        const equipments = await prisma.equipment.findMany({
            orderBy: { name: "asc" },
            include: {
                _count: { select: { tickets: true } },
            },
        });
        // Ajouter pannesCount comme champ plat
        const result = equipments.map((eq: any) => ({
            ...eq,
            pannesCount: eq._count?.tickets ?? 0,
        }));
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { 
            code, name, type, brand, model, serialNumber, 
            client, location, service, status, criticality, 
            purchaseDate, blDate, warrantyMonths, codeSage 
        } = body;

        const normalizedName = String(name || "").trim();
        const normalizedBrand = String(brand || "").trim();
        const normalizedModel = String(model || "").trim();
        const normalizedSerialNumber = String(serialNumber || "").trim();

        if (!normalizedName || !normalizedBrand || !normalizedModel || !normalizedSerialNumber) {
            return NextResponse.json({ error: "Nom, marque, modèle et numéro de série sont obligatoires." }, { status: 400 });
        }

        const equipment = await prisma.equipment.create({
            data: {
                code: String(code || codeSage || "").trim() || null,
                name: normalizedName,
                type: String(type || "BIOMEDICAL").trim() || "BIOMEDICAL",
                brand: normalizedBrand,
                model: normalizedModel,
                serialNumber: normalizedSerialNumber,
                client: String(client || "").trim() || null,
                location: String(location || client || "À planifier").trim() || "À planifier",
                service,
                status: normalizeEquipmentStatus(status),
                criticality: criticality || "LOW",
                purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
                blDate: blDate ? new Date(blDate) : null,
                warrantyMonths: parseInt(warrantyMonths) || null,
            },
        });

        return NextResponse.json(equipment);
    } catch (error: any) {
        console.error("Erreur creation equipment:", error);
        if (error?.code === "P2002") {
            return NextResponse.json({ error: "Un équipement avec ce numéro de série existe déjà." }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


