import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { parseChecklistPayload, stringifyChecklistPayload } from "@/metier/workflow-client";

export async function POST(req: Request, context: any) {
    try {
        const params = await context.params;
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "Ticket invalide." }, { status: 400 });
        }

        const body = await req.json().catch(() => ({}));
        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            select: { checklist: true }
        });
        if (!reclamation) {
            return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
        }

        const checklist = parseChecklistPayload(reclamation.checklist);
        const metadata = checklist.metadata || {};
        const currentSlip = (metadata as any).entryRepairSlip || {};
        const equipmentItems = Array.isArray(body?.equipmentItems)
            ? body.equipmentItems
                .map((item: any) => ({
                    designation: String(item?.designation || "").trim(),
                    serialNumber: String(item?.serialNumber || "").trim(),
                    pn: String(item?.pn || "").trim() || null,
                    articleCode: String(item?.articleCode || "").trim() || null,
                    quantity: Number(item?.quantity || 1) || 1
                }))
                .filter((item: any) => item.designation || item.serialNumber || item.pn || item.articleCode)
            : undefined;
        const createdTicketInfo = {
            ...((metadata as any).facturationCreatedTicket || {}),
            clientCode: String(body?.clientCode || "").trim(),
            specialty: String(body?.specialty || "").trim(),
            city: String(body?.city || "").trim(),
            designation: String(body?.designation || "").trim(),
            serialNumber: String(body?.serialNumber || "").trim(),
            pn: String(body?.pn || "").trim(),
            equipmentItems,
            quantity: String(body?.quantity || "").trim(),
            priority: String(body?.priority || "").trim(),
            accessories: String(body?.accessories || "").trim(),
            diagnosticPrice: String(body?.diagnosticPrice || "300").trim(),
            diagnosticPaymentStatus: String(body?.paymentStatus || "UNPAID").trim().toUpperCase() === "PAID" ? "PAID" : "UNPAID",
            diagnosticPaymentMethod: String(body?.paymentMethod || "").trim(),
            failureDescription: String(body?.failureDescription || "").trim(),
            updatedAt: new Date().toISOString()
        };

        await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                checklist: stringifyChecklistPayload({
                    ...checklist,
                    metadata: {
                        ...metadata,
                        clientCode: createdTicketInfo.clientCode,
                        specialty: createdTicketInfo.specialty || (metadata as any).specialty || "",
                        accessories: createdTicketInfo.accessories || (metadata as any).accessories || "",
                        entryRepairSlip: {
                            ...currentSlip,
                            clientCode: createdTicketInfo.clientCode,
                            specialty: createdTicketInfo.specialty || currentSlip.specialty || "",
                            city: createdTicketInfo.city || currentSlip.city || "",
                            designation: createdTicketInfo.designation || currentSlip.designation || "",
                            serialNumber: createdTicketInfo.serialNumber || currentSlip.serialNumber || "",
                            pn: createdTicketInfo.pn || currentSlip.pn || null,
                            equipmentItems: equipmentItems && equipmentItems.length > 0 ? equipmentItems : currentSlip.equipmentItems,
                            quantity: createdTicketInfo.quantity || currentSlip.quantity || 1,
                            priority: createdTicketInfo.priority || currentSlip.priority || "",
                            accessories: createdTicketInfo.accessories || currentSlip.accessories || null,
                            diagnosticPrice: createdTicketInfo.diagnosticPrice,
                            diagnosticPaymentStatus: createdTicketInfo.diagnosticPaymentStatus,
                            diagnosticPaymentMethod: createdTicketInfo.diagnosticPaymentMethod,
                            failureDescription: createdTicketInfo.failureDescription || currentSlip.failureDescription || ""
                        },
                        facturationCreatedTicket: createdTicketInfo
                    }
                })
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur pendant l'enregistrement du ticket créé." }, { status: 500 });
    }
}
