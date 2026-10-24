import prisma from "@/metier/base-donnees";
import { resetAutoIncrementForKnownTable } from "@/metier/sql-securise";

export async function resetReclamationAutoIncrementIfEmpty() {
    const firstReclamation = await prisma.reclamation.findFirst({
        select: { id: true },
        orderBy: { id: "asc" }
    });

    if (!firstReclamation) {
        await resetAutoIncrementForKnownTable("demandes_intervention");
    }
}

