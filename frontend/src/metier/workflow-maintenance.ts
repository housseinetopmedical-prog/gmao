export type MaintenanceCoverage = "UNDER_WARRANTY" | "MAINTENANCE_CONTRACT";

export type PreventivePlanning = "HEBDOMADAIRE" | "MENSUEL" | "TRIMESTRIEL" | "SEMESTRIEL" | "ANNUEL";

export type ParsedMaintenanceNotes = {
    coverage: MaintenanceCoverage | null;
    planning: PreventivePlanning | null;
    instructions: string;
};

export const MAINTENANCE_COVERAGE_LABELS: Record<MaintenanceCoverage, string> = {
    UNDER_WARRANTY: "Sous garantie",
    MAINTENANCE_CONTRACT: "Contrat de maintenance"
};

export const PREVENTIVE_PLANNING_LABELS: Record<PreventivePlanning, string> = {
    HEBDOMADAIRE: "Hebdomadaire",
    MENSUEL: "Mensuel",
    TRIMESTRIEL: "Trimestriel",
    SEMESTRIEL: "Semestriel",
    ANNUEL: "Annuel"
};

function normalizeCoverage(raw: unknown): MaintenanceCoverage | null {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "UNDER_WARRANTY") return "UNDER_WARRANTY";
    if (value === "MAINTENANCE_CONTRACT") return "MAINTENANCE_CONTRACT";
    return null;
}

function normalizePlanning(raw: unknown): PreventivePlanning | null {
    const value = String(raw || "").trim().toUpperCase();
    if (value === "HEBDOMADAIRE") return "HEBDOMADAIRE";
    if (value === "MENSUEL") return "MENSUEL";
    if (value === "TRIMESTRIEL") return "TRIMESTRIEL";
    if (value === "SEMESTRIEL") return "SEMESTRIEL";
    if (value === "ANNUEL") return "ANNUEL";
    return null;
}

export function buildMaintenanceNotes(params: {
    coverage?: unknown;
    planning?: unknown;
    instructions?: unknown;
}): string {
    const coverage = normalizeCoverage(params.coverage);
    const planning = normalizePlanning(params.planning);
    const instructions = String(params.instructions || "").trim();

    const lines = [
        coverage ? `Couverture: ${MAINTENANCE_COVERAGE_LABELS[coverage]}` : "",
        planning ? `Planning préventif: ${PREVENTIVE_PLANNING_LABELS[planning]}` : "",
        instructions ? `Instructions: ${instructions}` : ""
    ].filter(Boolean);

    return lines.join("\n");
}

export function parseMaintenanceNotes(raw: unknown): ParsedMaintenanceNotes {
    const text = String(raw || "").trim();
    if (!text) {
        return {
            coverage: null,
            planning: null,
            instructions: ""
        };
    }

    const lines = text.split(/\r?\n/);
    let coverage: MaintenanceCoverage | null = null;
    let planning: PreventivePlanning | null = null;
    const instructions: string[] = [];

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith("Couverture:")) {
            const value = trimmed.slice("Couverture:".length).trim().toLowerCase();
            coverage = value.includes("contrat") ? "MAINTENANCE_CONTRACT" : value.includes("garantie") ? "UNDER_WARRANTY" : coverage;
            return;
        }

        if (trimmed.startsWith("Planning préventif:")) {
            const value = trimmed.slice("Planning préventif:".length).trim().toLowerCase();
            if (value.includes("hebdo")) planning = "HEBDOMADAIRE";
            else if (value.includes("mens")) planning = "MENSUEL";
            else if (value.includes("trim")) planning = "TRIMESTRIEL";
            else if (value.includes("semes")) planning = "SEMESTRIEL";
            else if (value.includes("ann")) planning = "ANNUEL";
            return;
        }

        if (trimmed.startsWith("Instructions:")) {
            instructions.push(trimmed.slice("Instructions:".length).trim());
            return;
        }

        instructions.push(trimmed);
    });

    return {
        coverage,
        planning,
        instructions: instructions.join("\n").trim()
    };
}

export function getMaintenanceAlertWindowDays(scheduledDate: unknown): number | null {
    const timestamp = new Date(String(scheduledDate || "")).getTime();
    if (!Number.isFinite(timestamp)) return null;

    const diffMs = timestamp - Date.now();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays;
}