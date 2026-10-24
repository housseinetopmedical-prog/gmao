import { jsPDF } from "jspdf";
import { normalizeEquipmentQuantity, type EntryRepairSlipEquipmentItem } from "./ticket-entree";

export type ExitRepairSlipPaymentStatus = "PAID" | "UNPAID";
export type ExitRepairSlipPaymentMethod = "" | "CASH" | "CHECK" | "CARD" | "INSTANT_TRANSFER" | "NORMAL_TRANSFER";

export type ExitRepairSlipDocument = {
    ticketId: number;
    reclamationId: number;
    ticketReference?: string | null;
    generatedAt: string;
    createdAt: string;
    administrativeClosureAt: string;
    closedAt?: string | null;
    customerName: string;
    clientCode?: string;
    specialty?: string;
    contactEmail: string;
    contactPhone: string;
    contactLandlinePhone: string;
    city?: string;
    equipmentName: string;
    serialNumber: string;
    pn: string;
    equipmentItems: EntryRepairSlipEquipmentItem[];
    quantity: string;
    accessories: string;
    failureDescription: string;
    diagnosticPrice: string;
    repairAmount: string;
    paymentStatus: ExitRepairSlipPaymentStatus;
    paymentMethod: ExitRepairSlipPaymentMethod;
    interventionType: string;
    finalStatus: string;
    technicianName: string;
    actionsRealisees: string;
};

function formatDateTime(value: string | null | undefined) {
    const parsed = new Date(String(value || ""));
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function formatInterventionType(value: string) {
    const normalized = String(value || "").toUpperCase();
    if (normalized === "SITE" || normalized === "SUR SITE") return "Sur site";
    if (normalized === "WORKSHOP" || normalized === "EN ATELIER") return "Atelier";
    return value || "-";
}

function formatPaymentMethod(value: ExitRepairSlipPaymentMethod) {
    if (value === "CASH") return "Espèces";
    if (value === "CHECK") return "Chèque";
    if (value === "CARD") return "CB";
    if (value === "INSTANT_TRANSFER") return "Virement instantané";
    if (value === "NORMAL_TRANSFER") return "Virement normal";
    return "-";
}

function formatAmount(value: string | number | null | undefined) {
    const raw = typeof value === "number" ? value : Number(String(value || "").replace(/,/g, "."));
    if (!Number.isFinite(raw) || raw <= 0) return "-";
    return `${raw.toFixed(2)} MAD`;
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const lines = doc.splitTextToSize(String(text || "-"), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
}

function getFittedFieldText(
    doc: jsPDF,
    value: string,
    maxWidth: number,
    maxHeight: number
) {
    const text = String(value || "-");
    const minFontSize = 6.5;
    let fontSize = 9;
    let lineHeight = 3.8;
    let lines = doc.splitTextToSize(text, maxWidth);
    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

    while (fontSize > minFontSize && lines.length > maxLines) {
        fontSize -= 0.5;
        lineHeight = Math.max(3, fontSize * 0.42);
        doc.setFontSize(fontSize);
        lines = doc.splitTextToSize(text, maxWidth);
    }

    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
    }

    return { lines, fontSize, lineHeight };
}

function drawFieldBox(doc: jsPDF, options: { x: number; y: number; w: number; h: number; label: string; value: string }) {
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(options.x, options.y, options.w, options.h, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(options.label, options.x + 3, options.y + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(17, 24, 39);
    const fitted = getFittedFieldText(doc, options.value || "-", options.w - 6, options.h - 8);
    doc.setFontSize(fitted.fontSize);
    doc.text(fitted.lines, options.x + 3, options.y + 10.5);
}

function drawSectionTitle(doc: jsPDF, title: string, y: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(17, 24, 39);
    doc.text(title, 15, y);
    doc.setDrawColor(229, 231, 235);
    doc.line(15, y + 2, 195, y + 2);
}

function drawLongTextBlock(doc: jsPDF, title: string, value: string, y: number) {
    drawSectionTitle(doc, title, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(value || "-", 174);
    const trimmedLines = lines.slice(0, 4);
    const height = Math.max(18, trimmedLines.length * 3.7 + 6);
    doc.setDrawColor(209, 213, 219);
    doc.roundedRect(15, y, 180, height, 2, 2, "S");
    drawWrappedText(doc, trimmedLines.join("\n") || "-", 18, y + 5.5, 174, 3.7);
    return y + height;
}

function drawAccessoriesBlock(doc: jsPDF, value: string, y: number) {
    const accessories = String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10);

    if (accessories.length === 0) return y;

    const height = accessories.length > 5 ? 30 : Math.max(14, accessories.length * 3.8 + 9);
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, y, 180, height, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text("Accessoires vérifiés", 18, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(17, 24, 39);

    accessories.forEach((accessory, index) => {
        const columnX = accessories.length > 5 && index >= 5 ? 105 : 18;
        const rowY = y + 10 + (accessories.length > 5 ? index % 5 : index) * 3.6;
        doc.text(accessory, columnX, rowY);
    });

    return y + height + 5;
}

function cleanText(value: string | null | undefined) {
    const text = String(value || "").trim();
    return text || "-";
}

function formatInterventionCity(value: string | null | undefined) {
    const city = String(value || "").trim();
    return city ? city.toUpperCase() : "RABAT";
}

function resolveEquipmentItems(entry: ExitRepairSlipDocument) {
    const normalized = Array.isArray(entry.equipmentItems)
        ? entry.equipmentItems
            .map((item) => ({
                designation: String(item?.designation || "").trim(),
                serialNumber: String(item?.serialNumber || "").trim(),
                pn: String(item?.pn || "").trim(),
                articleCode: String(item?.articleCode || "").trim(),
                quantity: normalizeEquipmentQuantity(item?.quantity, entry.quantity)
            }))
            .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode)
        : [];

    if (normalized.length > 0) return normalized;

    return [{
        designation: cleanText(entry.equipmentName),
        serialNumber: cleanText(entry.serialNumber),
        pn: cleanText(entry.pn) === "-" ? "" : cleanText(entry.pn),
        articleCode: "",
        quantity: normalizeEquipmentQuantity(entry.quantity)
    }];
}

export function downloadExitRepairSlip(entry: ExitRepairSlipDocument) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const paymentLabel = entry.paymentStatus === "PAID" ? "Payé" : "Non payé";
    const equipmentItems = resolveEquipmentItems(entry);

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(17, 24, 39);
    doc.text(`TOP MEDICAL ${formatInterventionCity(entry.city)}`, 15, 16);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(55, 65, 81);

    let y = 22;
    const companyLines = [
        "SARL au capital de 10 000 000 Dhs",
        "CNSS : 1195610.  R.C Rabat : 27587.  TVA : 519541.",
        "Patente : 25111829.  Identifiant fiscal unique : 3300549",
        "ICE : 001576661000058",
        "2, rue Tissa sur avenue Allal Ben Abdellah. 10000 Rabat Centre",
        "Tél : 05 37 70 06 04 / 05 37 70 48 27 - Fax : 05 37 70 51 06",
        "Site web : www.topmedical.ma   Email : contact@topmedical.ma",
        "Banque : BMCE Centre d'Affaires - 260, avenue Med V, Rabat",
        "Code SWIFT : BMCEMAMC. Code RIB : 011.810.0000.01.210.00.60998.35",
        "Code IBAN : MA64011.810.0000.01.210.00.60998.35",
        "Horaires d'ouverture : 08:30 - 12:30 et 15:00 - 19:00",
        "Ouvert samedi matin"
    ];

    companyLines.forEach((line) => {
        doc.text(line, 15, y);
        y += 4.1;
    });

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(17, 24, 39);
    doc.text(`Ticket clôturé #${entry.ticketReference || entry.reclamationId}`, 15, y);

    y += 4;
    drawFieldBox(doc, { x: 15, y, w: 86, h: 12, label: "Date de traitement", value: formatDateTime(entry.generatedAt) });

    y += 16;
    drawSectionTitle(doc, "Client", y);
    y += 4;
    drawFieldBox(doc, { x: 15, y, w: 86, h: 14, label: "Nom client", value: cleanText(entry.customerName) });
    drawFieldBox(doc, { x: 109, y, w: 86, h: 14, label: "Portable(s)", value: cleanText(entry.contactPhone) });
    y += 16;
    if (String(entry.clientCode || entry.specialty || "").trim()) {
        drawFieldBox(doc, { x: 15, y, w: 86, h: 14, label: "Code client", value: cleanText(entry.clientCode) });
        drawFieldBox(doc, { x: 109, y, w: 86, h: 14, label: "Spécialité", value: cleanText(entry.specialty) });
        y += 16;
    }
    drawFieldBox(doc, { x: 15, y, w: 86, h: 14, label: "Fixe", value: cleanText(entry.contactLandlinePhone) });
    drawFieldBox(doc, { x: 109, y, w: 86, h: 14, label: "E-mail", value: cleanText(entry.contactEmail) });
    y += 16;
    drawFieldBox(doc, { x: 15, y, w: 56, h: 14, label: "Paiement diagnostic", value: paymentLabel });
    drawFieldBox(doc, {
        x: 77,
        y,
        w: 56,
        h: 14,
        label: "Mode de paiement",
        value: entry.paymentStatus === "PAID" ? formatPaymentMethod(entry.paymentMethod) : "-"
    });
    drawFieldBox(doc, { x: 139, y, w: 56, h: 14, label: "Montant réparation", value: formatAmount(entry.repairAmount) });

    y += 18;
    drawSectionTitle(doc, "Matériel", y);
    y += 4;

    equipmentItems.forEach((item) => {
        drawFieldBox(doc, { x: 15, y, w: 86, h: 14, label: "Désignation", value: item.designation || "-" });
        drawFieldBox(doc, { x: 105, y, w: 42, h: 14, label: "SN", value: item.serialNumber || "-" });
        drawFieldBox(doc, { x: 151, y, w: 44, h: 14, label: "PN", value: item.pn || "-" });
        y += 16;
        if (String(item.articleCode || "").trim()) {
            drawFieldBox(doc, { x: 15, y, w: 180, h: 14, label: "Code article", value: item.articleCode || "-" });
            y += 16;
        }
    });

    if (String(entry.accessories || "").trim()) {
        y = drawAccessoriesBlock(doc, entry.accessories, y);
    }
    y += 5;
    y = drawLongTextBlock(doc, "Description de la panne", cleanText(entry.failureDescription), y);

    doc.save(`ticket-cloture-${entry.ticketReference || entry.reclamationId}.pdf`);
}
