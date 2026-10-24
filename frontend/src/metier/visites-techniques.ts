export type TechnicalVisitDateEntry = {
    raw: string;
    date: Date;
    label: string;
};

export function startOfLocalDay(reference: Date = new Date()) {
    return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

export function splitTechnicalVisitDateValues(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(splitTechnicalVisitDateValues);

    const text = String(value ?? "").trim();
    if (!text) return [];

    const compactFrenchDates = text.match(/\d{2}\/\d{2}\/\d{4}/g);
    if (compactFrenchDates && compactFrenchDates.join("") === text.replace(/\s+/g, "")) {
        return compactFrenchDates;
    }

    const isoDates = text.match(/\d{4}-\d{2}-\d{2}/g);
    if (isoDates && isoDates.length > 1) return isoDates;

    return text
        .split(/[,\n;]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
}

export function parseTechnicalVisitDate(value: unknown): Date | null {
    const text = String(value ?? "").trim();
    if (!text) return null;

    const frenchDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frenchDate) {
        const parsed = new Date(Number(frenchDate[3]), Number(frenchDate[2]) - 1, Number(frenchDate[1]));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) {
        const parsed = new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatTechnicalVisitDate(value: unknown) {
    const parsed = parseTechnicalVisitDate(value);
    if (!parsed) return String(value ?? "").trim();
    return parsed.toLocaleDateString("fr-FR");
}

export function getTechnicalVisitDateEntries(value: unknown): TechnicalVisitDateEntry[] {
    return splitTechnicalVisitDateValues(value)
        .map((raw) => {
            const date = parseTechnicalVisitDate(raw);
            if (!date) return null;
            return {
                raw,
                date,
                label: formatTechnicalVisitDate(raw)
            };
        })
        .filter((entry): entry is TechnicalVisitDateEntry => Boolean(entry));
}

export function getUpcomingTechnicalVisitDates(value: unknown, reference: Date = new Date()) {
    const today = startOfLocalDay(reference);
    return getTechnicalVisitDateEntries(value).filter((entry) => startOfLocalDay(entry.date) >= today);
}

export function getPastTechnicalVisitDates(value: unknown, reference: Date = new Date()) {
    const today = startOfLocalDay(reference);
    return getTechnicalVisitDateEntries(value).filter((entry) => startOfLocalDay(entry.date) < today);
}
