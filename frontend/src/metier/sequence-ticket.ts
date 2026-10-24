import prisma from "@/metier/base-donnees";
import { resetAutoIncrementForKnownTable } from "@/metier/sql-securise";

export async function resetTicketAutoIncrementIfEmpty() {
    const firstTicket = await prisma.ticket.findFirst({
        select: { id: true },
        orderBy: { id: "asc" }
    });

    if (!firstTicket) {
        await resetAutoIncrementForKnownTable("tickets");
    }
}

