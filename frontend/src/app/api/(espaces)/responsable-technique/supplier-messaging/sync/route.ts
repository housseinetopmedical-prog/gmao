import { NextResponse } from "next/server";
import { getRequestUserContext } from "@/metier/utilisateur-requete";
import { syncSupplierReplies } from "@/metier/messagerie-fournisseur";

export async function POST(req: Request) {
    try {
        const { role, userId } = getRequestUserContext(req);
        const currentRole = String(role || "");
        if (!["RESPONSABLE_TECHNIQUE", "ADMIN"].includes(currentRole)) {
            return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
        }
        if (!userId) {
            return NextResponse.json({ error: "Utilisateur invalide." }, { status: 400 });
        }

        const body = await req.json();
        const orderId = body?.orderId !== undefined && body?.orderId !== null && body?.orderId !== "" ? Number(body.orderId) : null;
        const threadId = String(body?.threadId || "").trim();
        if ((orderId === null || !Number.isFinite(orderId) || orderId <= 0) && !threadId) {
            return NextResponse.json({ error: "Conversation invalide." }, { status: 400 });
        }

        const createdMessages = await syncSupplierReplies({ orderId, threadId, userId: Number(userId) });
        return NextResponse.json({ createdMessages });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
    }
}

