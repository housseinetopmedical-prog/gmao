export type AppelsOffreVisitKind = "PREVENTIVE" | "CORRECTIVE";

export type AppelsOffreVisitMetadata = {
    source: "APPEL_OFFRE";
    visitKind: AppelsOffreVisitKind;
    plannedAt?: string | null;
    plannedDates?: string[];
    cadence?: string | null;
    callDate?: string | null;
    interventionDate?: string | null;
    materialReturnDate?: string | null;
    materialRecoveryDate?: string | null;
    comment?: string | null;
    createdById?: number | null;
    createdByLabel?: string | null;
    assignedManagerId?: number | null;
    assignedManagerName?: string | null;
    assignedTechnicianId?: number | null;
    assignedTechnicianName?: string | null;
};

export function parseAppelsOffreVisitNotes(raw: unknown): AppelsOffreVisitMetadata | null {
    const text = String(raw || "").trim();
    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object") return null;
        if ((parsed as { source?: string }).source !== "APPEL_OFFRE") return null;

        const metadata = parsed as Record<string, unknown>;
        const visitKind = String(metadata.visitKind || "").toUpperCase();
        if (visitKind !== "PREVENTIVE" && visitKind !== "CORRECTIVE") return null;

        return {
            source: "APPEL_OFFRE",
            visitKind,
            plannedAt: normalizeOptionalString(metadata.plannedAt),
            plannedDates: Array.isArray(metadata.plannedDates)
                ? metadata.plannedDates.map((item) => String(item)).filter(Boolean)
                : undefined,
            cadence: normalizeOptionalString(metadata.cadence),
            callDate: normalizeOptionalString(metadata.callDate),
            interventionDate: normalizeOptionalString(metadata.interventionDate),
            materialReturnDate: normalizeOptionalString(metadata.materialReturnDate),
            materialRecoveryDate: normalizeOptionalString(metadata.materialRecoveryDate),
            comment: normalizeOptionalString(metadata.comment),
            createdById: normalizeOptionalNumber(metadata.createdById),
            createdByLabel: normalizeOptionalString(metadata.createdByLabel),
            assignedManagerId: normalizeOptionalNumber(metadata.assignedManagerId),
            assignedManagerName: normalizeOptionalString(metadata.assignedManagerName),
            assignedTechnicianId: normalizeOptionalNumber(metadata.assignedTechnicianId),
            assignedTechnicianName: normalizeOptionalString(metadata.assignedTechnicianName)
        };
    } catch {
        return null;
    }
}

export function getAppelsOffreVisitKindLabel(kind: unknown) {
    return String(kind || "").toUpperCase() === "CORRECTIVE" ? "Visite corrective" : "Visite préventive";
}

export function isUpcomingWithinDays(scheduledDate: unknown, days: number) {
    const timestamp = new Date(String(scheduledDate || "")).getTime();
    if (!Number.isFinite(timestamp)) return false;
    const now = Date.now();
    const limit = now + days * 24 * 60 * 60 * 1000;
    return timestamp >= now && timestamp <= limit;
}

export function isAppelsOffreVisitAlertActive(scheduledDate: unknown, referenceDate: Date = new Date()) {
    const visitDate = new Date(String(scheduledDate || ""));
    if (Number.isNaN(visitDate.getTime())) return false;

    const reference = new Date(referenceDate);
    if (Number.isNaN(reference.getTime())) return false;

    const isSameMonth = visitDate.getMonth() === reference.getMonth() && visitDate.getFullYear() === reference.getFullYear();
    if (!isSameMonth) return false;

    const endOfVisitDate = new Date(visitDate);
    endOfVisitDate.setHours(23, 59, 59, 999);

    return reference.getTime() <= endOfVisitDate.getTime();
}

export function getActiveAppelsOffreVisitAlerts<T extends { scheduledDate?: unknown }>(visits: T[], referenceDate: Date = new Date()) {
    if (!Array.isArray(visits)) return [];

    return visits
        .filter((visit) => isAppelsOffreVisitAlertActive(visit?.scheduledDate, referenceDate))
        .sort((a, b) => new Date(String(a?.scheduledDate || "")).getTime() - new Date(String(b?.scheduledDate || "")).getTime());
}

export function getActorFilteredAppelsOffreVisits(params: {
    visits: any[];
    actorMode: "TECHNICIAN" | "RESPONSABLE_TECHNIQUE";
    userId: number | null;
}) {
    const { visits, actorMode, userId } = params;
    if (!Array.isArray(visits)) return [];

    return visits.filter((visit) => {
        const metadata = visit?.metadata;
        if (!metadata) return false;
        if (!userId) return true;

        if (actorMode === "TECHNICIAN") {
            const assignedId = Number(metadata.assignedTechnicianId || visit.technicianId || 0) || null;
            return assignedId === userId;
        }

        const managerId = Number(metadata.assignedManagerId || 0) || null;
        return managerId ? managerId === userId : true;
    });
}

function normalizeOptionalString(raw: unknown) {
    const value = String(raw || "").trim();
    return value || null;
}

function normalizeOptionalNumber(raw: unknown) {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
}