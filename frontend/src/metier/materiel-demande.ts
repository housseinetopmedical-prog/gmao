import { Prisma } from "@prisma/client";
import prisma from "@/metier/base-donnees";

type ReclamationLike = {
    id?: number | null;
    serialNumber?: string | null;
    deviceModel?: string | null;
    customerName?: string | null;
    checklist?: string | null;
};

function cleanText(value: unknown) {
    const text = String(value || "").trim();
    return text.toUpperCase() === "UNKNOWN" ? "" : text;
}

export function getBrandFromChecklist(rawChecklist: string | null | undefined): string {
    if (!rawChecklist || typeof rawChecklist !== "string") return "";
    try {
        const parsed = JSON.parse(rawChecklist);
        if (!parsed || typeof parsed !== "object") return "";
        const metadata = (parsed as Record<string, unknown>).metadata;
        if (!metadata || typeof metadata !== "object") return "";
        const brand = (metadata as Record<string, unknown>).brand;
        if (typeof brand !== "string") return "";
        return brand.trim();
    } catch {
        return "";
    }
}

function buildFallbackSerial(reclamation: ReclamationLike) {
    const rawSerial = cleanText(reclamation.serialNumber);
    if (rawSerial) return rawSerial;
    const dossierId = Number(reclamation.id || 0) || Date.now();
    return `DOSSIER-${dossierId}`;
}

export async function ensureEquipmentForReclamation(reclamation: ReclamationLike) {
    const serialNumber = buildFallbackSerial(reclamation);
    const requestedBrand = cleanText(getBrandFromChecklist(reclamation.checklist));
    const equipmentName = cleanText(reclamation.deviceModel) || `Équipement ${serialNumber}`;
    const customerName = cleanText(reclamation.customerName) || null;

    let equipment = await prisma.equipment.findFirst({
        where: { serialNumber }
    });

    if (!equipment) {
        try {
            equipment = await prisma.equipment.create({
                data: {
                    name: equipmentName,
                    type: "",
                    brand: requestedBrand || "",
                    model: equipmentName,
                    serialNumber,
                    location: "Non renseigné",
                    client: customerName
                }
            });
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                equipment = await prisma.equipment.findFirst({
                    where: { serialNumber }
                });
            } else {
                throw error;
            }
        }
    }

    if (!equipment) {
        throw new Error("Impossible de préparer l'équipement lié au dossier.");
    }

    const nextBrand =
        requestedBrand && (!cleanText(equipment.brand) || cleanText(equipment.brand).toUpperCase() === "UNKNOWN")
            ? requestedBrand
            : equipment.brand;
    const nextClient = !cleanText(equipment.client) && customerName ? customerName : equipment.client;
    const nextModel =
        (!cleanText(equipment.model) || cleanText(equipment.model).toUpperCase() === "UNKNOWN") && equipmentName
            ? equipmentName
            : equipment.model;
    const nextName = !cleanText(equipment.name) ? equipmentName : equipment.name;
    const nextLocation = cleanText(equipment.location) ? equipment.location : "Non renseigné";
    const nextType = !cleanText((equipment as any).type) ? "" : (equipment as any).type;

    const needsUpdate =
        nextBrand !== equipment.brand
        || nextClient !== equipment.client
        || nextModel !== equipment.model
        || nextName !== equipment.name
        || nextLocation !== equipment.location
        || nextType !== (equipment as any).type;

    if (needsUpdate) {
        equipment = await prisma.equipment.update({
            where: { id: equipment.id },
            data: {
                brand: nextBrand,
                client: nextClient,
                model: nextModel,
                name: nextName,
                location: nextLocation,
                type: nextType
            }
        });
    }

    return equipment;
}


