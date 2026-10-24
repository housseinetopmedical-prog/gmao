import { jsPDF } from "jspdf";

export type EntryRepairSlipPaymentStatus = "PAID" | "UNPAID";
export type EntryRepairSlipPaymentMethod = "" | "CASH" | "CHECK" | "CARD" | "INSTANT_TRANSFER" | "NORMAL_TRANSFER";

export type EntryRepairSlipEquipmentItem = {
    designation: string;
    serialNumber: string;
    pn: string;
    articleCode?: string;
    quantity: string;
};

export type EntryRepairSlipForm = {
    clientFirstName: string;
    clientLastName: string;
    clientCode?: string;
    city: string;
    phone: string;
    mobilePhones: string[];
    landlinePhone: string;
    email: string;
    sageCode?: string;
    specialty?: string;
    designation: string;
    serialNumber: string;
    pn: string;
    equipmentItems: EntryRepairSlipEquipmentItem[];
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    quantity: string;
    accessories: string;
    failureDescription: string;
    diagnosticPrice: string;
    paymentStatus: EntryRepairSlipPaymentStatus;
    paymentMethod: EntryRepairSlipPaymentMethod;
};

export type EntryRepairSlipDocument = {
    reclamationId: number;
    ticketReference?: string | null;
    submittedAt: string;
    form: EntryRepairSlipForm;
};

function formatInterventionCity(value: string | null | undefined) {
    const city = String(value || "").trim();
    return city ? city.toUpperCase() : "RABAT";
}

function formatDateTime(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("fr-FR");
}

function formatPaymentMethod(value: EntryRepairSlipPaymentMethod) {
    if (value === "CASH") return "Espèces";
    if (value === "CHECK") return "Chèque";
    if (value === "CARD") return "CB";
    if (value === "INSTANT_TRANSFER") return "Virement instantané";
    if (value === "NORMAL_TRANSFER") return "Virement normal";
    return "-";
}

function normalizePhones(phones: string[]) {
    return phones.map((item) => String(item || "").trim()).filter(Boolean);
}

export function normalizeEquipmentQuantity(value: unknown, fallback: unknown = "1") {
    const raw = String(value ?? fallback ?? "").trim();
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return "1";
    return String(Math.trunc(parsed));
}

function resolveEquipmentItems(form: EntryRepairSlipForm) {
    const normalized = Array.isArray(form.equipmentItems)
        ? form.equipmentItems
            .map((item) => ({
                designation: String(item?.designation || "").trim(),
                serialNumber: String(item?.serialNumber || "").trim(),
                pn: String(item?.pn || "").trim(),
                articleCode: String(item?.articleCode || "").trim(),
                quantity: normalizeEquipmentQuantity(item?.quantity, form.quantity)
            }))
            .filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode)
        : [];

    if (normalized.length > 0) return normalized;

    return [{
        designation: String(form.designation || "").trim(),
        serialNumber: String(form.serialNumber || "").trim(),
        pn: String(form.pn || "").trim(),
        articleCode: "",
        quantity: normalizeEquipmentQuantity(form.quantity)
    }].filter((item) => item.designation || item.serialNumber || item.pn || item.articleCode);
}

function drawWrappedText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const lines = doc.splitTextToSize(String(text || "-"), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
}

function getFieldBoxLines(doc: jsPDF, value: string, width: number, fontSize: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(value || "-", width - 6);
}

function getFieldBoxHeight(doc: jsPDF, options: { w: number; value: string; valueFontSize?: number; lineHeight?: number; minHeight?: number }) {
    const valueFontSize = options.valueFontSize ?? 9.5;
    const lineHeight = options.lineHeight ?? 4;
    const minHeight = options.minHeight ?? 17;
    const lines = getFieldBoxLines(doc, options.value, options.w, valueFontSize);
    return Math.max(minHeight, 10.5 + Math.max(1, lines.length) * lineHeight + 3.5);
}

function drawFieldBox(doc: jsPDF, options: { x: number; y: number; w: number; h: number; label: string; value: string; valueFontSize?: number; lineHeight?: number }) {
    const valueFontSize = options.valueFontSize ?? 9.5;
    const lineHeight = options.lineHeight ?? 4;
    doc.setDrawColor(209, 213, 219);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(options.x, options.y, options.w, options.h, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(options.label, options.x + 3, options.y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(valueFontSize);
    doc.setTextColor(17, 24, 39);
    const lines = getFieldBoxLines(doc, options.value, options.w, valueFontSize);
    doc.text(lines, options.x + 3, options.y + 10.5);
}

function hasPdfValue(value: unknown) {
    return String(value ?? "").trim().length > 0;
}

function drawFieldBoxIfValue(doc: jsPDF, options: { x: number; y: number; w: number; h: number; label: string; value: string }) {
    if (!hasPdfValue(options.value)) return false;
    drawFieldBox(doc, options);
    return true;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(17, 24, 39);
    doc.text(title, 15, y);
    doc.setDrawColor(229, 231, 235);
    doc.line(15, y + 2, 195, y + 2);
}

function drawCompactFieldBox(doc: jsPDF, options: { x: number; y: number; w: number; label: string; value: string }) {
    drawFieldBox(doc, {
        ...options,
        h: getFieldBoxHeight(doc, {
            w: options.w,
            value: options.value,
            valueFontSize: 8.5,
            lineHeight: 3.6,
            minHeight: 16
        }),
        valueFontSize: 8.5,
        lineHeight: 3.6
    });
}

function drawCompactFieldRow(doc: jsPDF, y: number, fields: Array<{ x: number; w: number; label: string; value: string }>) {
    const height = fields.reduce((maxHeight, field) => {
        const fieldHeight = getFieldBoxHeight(doc, {
            w: field.w,
            value: field.value,
            valueFontSize: 8.5,
            lineHeight: 3.6,
            minHeight: 16
        });
        return Math.max(maxHeight, fieldHeight);
    }, 16);

    fields.forEach((field) => {
        drawFieldBox(doc, {
            ...field,
            y,
            h: height,
            valueFontSize: 8.5,
            lineHeight: 3.6
        });
    });

    return height;
}

export function downloadEntryRepairSlip(entry: EntryRepairSlipDocument) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const clientName = `${entry.form.clientFirstName} ${entry.form.clientLastName}`.trim();
    const paymentLabel = entry.form.paymentStatus === "PAID" ? "Payé" : "Non payé";
    const mobilePhones = normalizePhones(entry.form.mobilePhones);
    const mobilePhonesLabel = mobilePhones.length > 0 ? mobilePhones.join(" / ") : entry.form.phone || "";
    const equipmentItems = resolveEquipmentItems(entry.form);
    const equipmentRows = equipmentItems.map((item, index) => ({
        designation: String(item.designation || "").trim() || `Matériel ${index + 1}`,
        serialNumber: String(item.serialNumber || "").trim(),
        pn: String(item.pn || "").trim(),
        articleCode: String(item.articleCode || "").trim()
    }));

    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(17, 24, 39);
    doc.text(`TOP MEDICAL ${formatInterventionCity(entry.form.city)}`, 15, 16);

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
    doc.text(`Ticket créé #${entry.ticketReference || entry.reclamationId}`, 15, y);

    y += 4;
    drawFieldBox(doc, { x: 15, y, w: 86, h: 14, label: "Date de création", value: formatDateTime(entry.submittedAt) });

    y += 20;
    drawSectionTitle(doc, "Client", y);
    y += 5;
    drawFieldBox(doc, { x: 15, y, w: 86, h: 17, label: "Nom et prénom", value: clientName || "-" });
    if (hasPdfValue(mobilePhonesLabel)) {
        drawFieldBox(doc, { x: 109, y, w: 86, h: 17, label: "Portable(s)", value: mobilePhonesLabel });
    }
    y += 20;

    const hasClientCode = hasPdfValue(entry.form.clientCode);
    const hasSpecialty = hasPdfValue(entry.form.specialty);
    if (hasClientCode || hasSpecialty) {
        if (hasClientCode) {
            drawFieldBox(doc, { x: 15, y, w: hasSpecialty ? 86 : 180, h: 17, label: "Code client", value: entry.form.clientCode || "" });
        }
        if (hasSpecialty) {
            drawFieldBox(doc, { x: hasClientCode ? 109 : 15, y, w: hasClientCode ? 86 : 180, h: 17, label: "Spécialité", value: entry.form.specialty || "" });
        }
        y += 20;
    }

    const hasLandline = hasPdfValue(entry.form.landlinePhone);
    const hasEmail = hasPdfValue(entry.form.email);
    if (hasLandline || hasEmail) {
        if (hasLandline) {
            drawFieldBox(doc, { x: 15, y, w: hasEmail ? 86 : 180, h: 17, label: "Fixe", value: entry.form.landlinePhone });
        }
        if (hasEmail) {
            drawFieldBox(doc, { x: hasLandline ? 109 : 15, y, w: hasLandline ? 86 : 180, h: 17, label: "E-mail", value: entry.form.email });
        }
        y += 20;
    }

    drawFieldBox(doc, { x: 15, y, w: 86, h: 17, label: "Paiement diagnostic", value: paymentLabel });
    if (entry.form.paymentStatus === "PAID" && hasPdfValue(entry.form.paymentMethod)) {
        drawFieldBox(doc, {
            x: 109,
            y,
            w: 86,
            h: 17,
            label: "Mode de paiement",
            value: formatPaymentMethod(entry.form.paymentMethod)
        });
    }

    y += 21;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(55, 65, 81);
    y = drawWrappedText(
        doc,
        "Dans le cas où l'appareil est hors garantie, la recherche de panne est facturée 300 DH TTC à verser au dépôt de l'appareil à réparer.",
        15,
        y,
        180,
        3.6
    ) + 4;
    drawSectionTitle(doc, equipmentRows.length > 1 ? "Matériels" : "Matériel", y);
    y += 5;

    equipmentRows.forEach((row) => {
        const hasSerialNumber = hasPdfValue(row.serialNumber);
        const hasPn = hasPdfValue(row.pn);
        const hasArticleCode = hasPdfValue(row.articleCode);
        let rowHeight = 16;

        if (hasSerialNumber && hasPn && hasArticleCode) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 68, label: "Désignation", value: row.designation },
                { x: 87, w: 42, label: "SN", value: row.serialNumber },
                { x: 133, w: 28, label: "PN", value: row.pn },
                { x: 165, w: 30, label: "Code article", value: row.articleCode }
            ]);
        } else if (hasSerialNumber && hasArticleCode) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 82, label: "Désignation", value: row.designation },
                { x: 101, w: 46, label: "SN", value: row.serialNumber },
                { x: 151, w: 44, label: "Code article", value: row.articleCode }
            ]);
        } else if (hasSerialNumber) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 112, label: "Désignation", value: row.designation },
                { x: 131, w: 64, label: "SN", value: row.serialNumber }
            ]);
        } else if (hasPn && hasArticleCode) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 82, label: "Désignation", value: row.designation },
                { x: 101, w: 42, label: "PN", value: row.pn },
                { x: 147, w: 48, label: "Code article", value: row.articleCode }
            ]);
        } else if (hasPn) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 112, label: "Désignation", value: row.designation },
                { x: 131, w: 64, label: "PN", value: row.pn }
            ]);
        } else if (hasArticleCode) {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 112, label: "Désignation", value: row.designation },
                { x: 131, w: 64, label: "Code article", value: row.articleCode }
            ]);
        } else {
            rowHeight = drawCompactFieldRow(doc, y, [
                { x: 15, w: 180, label: "Désignation", value: row.designation }
            ]);
        }

        y += rowHeight + 3;
    });

    if (hasPdfValue(entry.form.accessories)) {
        const accessoryLines = String(entry.form.accessories || "")
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 10);
        if (accessoryLines.length > 5) {
            const accessoriesHeight = 30;
            doc.setDrawColor(209, 213, 219);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(15, y, 180, accessoriesHeight, 2, 2, "FD");
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128);
            doc.text("Accessoires", 18, y + 5);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(17, 24, 39);
            accessoryLines.forEach((line, index) => {
                const columnX = index < 5 ? 18 : 105;
                const rowY = y + 10 + (index % 5) * 3.4;
                doc.text(line, columnX, rowY);
            });
            y += accessoriesHeight + 5;
        } else {
            const accessoriesHeight = getFieldBoxHeight(doc, {
                w: 180,
                value: entry.form.accessories,
                minHeight: 17
            });
            drawFieldBox(doc, { x: 15, y, w: 180, h: accessoriesHeight, label: "Accessoires", value: entry.form.accessories });
            y += accessoriesHeight + 6;
        }
    } else {
        y += 3;
    }

    if (hasPdfValue(entry.form.failureDescription)) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        let failureLines = doc.splitTextToSize(entry.form.failureDescription, 172);
        let failureHeight = Math.max(20, failureLines.length * 4 + 8);
        if (y + failureHeight + 20 > 280) {
            doc.setFontSize(8);
            failureLines = doc.splitTextToSize(entry.form.failureDescription, 172);
            failureHeight = Math.max(18, failureLines.length * 3.5 + 8);
        }
        if (y + failureHeight + 12 > 280) {
            doc.setFontSize(7);
            failureLines = doc.splitTextToSize(entry.form.failureDescription, 172);
            failureHeight = Math.max(14, Math.min(280 - y - 8, failureLines.length * 3 + 7));
        }
        drawSectionTitle(doc, "Description de la panne", y);
        y += 5;
        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(15, y, 180, failureHeight, 2, 2, "S");
        doc.setTextColor(17, 24, 39);
        const failureLineHeight = doc.getFontSize() <= 7 ? 3 : doc.getFontSize() === 8 ? 3.5 : 4;
        const maxFailureLines = Math.max(1, Math.floor((failureHeight - 7) / failureLineHeight));
        doc.text(failureLines.slice(0, maxFailureLines), 18, y + 6);
    }

    doc.save(`ticket-cree-${entry.ticketReference || entry.reclamationId}.pdf`);
}
