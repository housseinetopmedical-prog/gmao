import prisma from "@/metier/base-donnees";

export function formatTicketAnnualReference(year: number, sequence: number) {
    return `${String(year).padStart(4, "0")}${String(sequence).padStart(4, "0")}`;
}

type TicketReferenceRow = {
    id: number;
    createdAt: Date | string;
};

function getTicketReferenceYear(createdAt: Date | string) {
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const year = date.getFullYear();
    return Number.isFinite(year) ? year : new Date().getFullYear();
}

export function buildTicketAnnualReferenceMap(rows: TicketReferenceRow[]) {
    const countersByYear = new Map<number, number>();
    const references = new Map<number, string>();
    const orderedRows = [...rows].sort((left, right) => {
        const leftTime = new Date(left.createdAt).getTime();
        const rightTime = new Date(right.createdAt).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.id) - Number(right.id);
    });

    orderedRows.forEach((ticket) => {
        const year = getTicketReferenceYear(ticket.createdAt);
        const nextSequence = (countersByYear.get(year) || 0) + 1;
        countersByYear.set(year, nextSequence);
        references.set(Number(ticket.id), formatTicketAnnualReference(year, nextSequence));
    });

    return references;
}

export async function getTicketAnnualReferenceMap(ticketIds?: number[]) {
    const requestedIds = Array.isArray(ticketIds)
        ? new Set(ticketIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
        : null;
    const rows = await prisma.ticket.findMany({
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    const references = buildTicketAnnualReferenceMap(rows);

    if (!requestedIds) return references;

    return new Map(
        Array.from(references.entries()).filter(([id]) => requestedIds.has(id))
    );
}

export function attachTicketAnnualReference<T extends { id?: number | null }>(
    ticket: T,
    references: Map<number, string>
) {
    const id = Number(ticket?.id || 0);
    const ticketReference = id ? references.get(id) || null : null;
    if (!ticketReference) return ticket;
    return {
        ...ticket,
        displayId: Number(ticketReference),
        ticketReference
    };
}

export async function getTicketAnnualReference(ticketId: number) {
    const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, createdAt: true }
    });

    if (!ticket) return null;

    const year = ticket.createdAt.getFullYear();
    const yearStart = new Date(year, 0, 1);
    const nextYearStart = new Date(year + 1, 0, 1);
    const sequence = await prisma.ticket.count({
        where: {
            createdAt: {
                gte: yearStart,
                lt: nextYearStart
            },
            OR: [
                { createdAt: { lt: ticket.createdAt } },
                { createdAt: ticket.createdAt, id: { lte: ticket.id } }
            ]
        }
    });

    return formatTicketAnnualReference(year, sequence);
}
