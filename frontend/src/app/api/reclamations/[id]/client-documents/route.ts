import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { isClientAttachmentExpired, parseChecklistPayload, shouldApplyRepairedTicketDocumentRetention, stringifyChecklistPayload } from "@/metier/workflow-client";
import { deleteClientAttachmentFiles, getExpiredClientAttachments } from "@/metier/nettoyage-pieces-jointes-client";

type IncomingAttachment = {
    name?: string;
    url?: string;
    type?: string;
    kind?: "DOCUMENT" | "MEDIA";
};

function normalizeAttachments(raw: unknown) {
    if (!Array.isArray(raw)) return [];
    const nowIso = new Date().toISOString();

    return raw
        .filter((item): item is IncomingAttachment => Boolean(item && typeof item === "object"))
        .map((item) => {
            const dataUrl = typeof item.url === "string"
                ? item.url.trim()
                : typeof (item as any).dataUrl === "string"
                    ? String((item as any).dataUrl).trim()
                    : "";
            const type = typeof item.type === "string" ? item.type : undefined;
            const name = String(item.name || "Piece jointe");
            const isMedia = item.kind === "MEDIA"
                || String(type || "").toLowerCase().startsWith("image/")
                || String(type || "").toLowerCase().startsWith("video/")
                || /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(name)
                || /\.(png|jpe?g|gif|webp|mp4|webm|mov)$/i.test(dataUrl);

            return {
                name,
                dataUrl,
                type,
                kind: isMedia ? "MEDIA" as const : "DOCUMENT" as const,
                sentAt: typeof (item as any).sentAt === "string" && String((item as any).sentAt).trim().length > 0 ? String((item as any).sentAt).trim() : nowIso
            };
        })
        .filter((item) => item.dataUrl.length > 0);
}

function canonicalAttachmentName(raw: string) {
    let value = String(raw || "").trim().toLowerCase();
    if (!value) return "";

    const noQuery = value.split("?")[0].split("#")[0];
    const basename = noQuery.split("/").pop() || "";
    value = decodeURIComponent(basename);

    for (let i = 0; i < 3; i += 1) {
        const next = value.replace(/^\d{10,}-[a-z0-9]+-/i, "");
        if (next === value) break;
        value = next;
    }

    return value.replace(/\(\d+\)(?=\.[a-z0-9]+$)/i, "");
}

export async function POST(req: Request, context: any) {
    const params = await context.params;
    try {
        const reclamationId = Number(params.id);
        if (!Number.isFinite(reclamationId)) {
            return NextResponse.json({ error: "ID reclamation invalide" }, { status: 400 });
        }

        const body = await req.json();
        const attachments = normalizeAttachments(body.attachments);
        const updateMessage = typeof body.updateMessage === "string" ? body.updateMessage.trim() : "";
        const requestedUserId = Number(body.userId);

        if (attachments.length === 0 && !updateMessage) {
            return NextResponse.json({ error: "Aucune mise à jour valide à enregistrer." }, { status: 400 });
        }

        const reclamation = await prisma.reclamation.findUnique({
            where: { id: reclamationId },
            include: { ticket: true }
        });

        if (!reclamation) {
            return NextResponse.json({ error: "Reclamation introuvable" }, { status: 404 });
        }

        if (String(reclamation.status || "") === "NOT_TAKEN_IN_CHARGE" || String(reclamation.ticket?.status || "") === "CLOSED") {
            return NextResponse.json(
                { error: "La demande est clôturée. Mise à jour non autorisée." },
                { status: 400 }
            );
        }

        const checklist = parseChecklistPayload(reclamation.checklist);
        const existingAttachments = Array.isArray(checklist.metadata?.attachments) ? checklist.metadata!.attachments : [];
        const fallbackSentAt = String(reclamation.updatedAt || reclamation.createdAt || "").trim() || null;
        const applyRetention = shouldApplyRepairedTicketDocumentRetention(reclamation);
        const expiredAttachments = applyRetention ? getExpiredClientAttachments(existingAttachments, fallbackSentAt) : [];
        const activeExistingAttachments = applyRetention
            ? existingAttachments.filter((attachment) => !isClientAttachmentExpired(attachment, fallbackSentAt))
            : existingAttachments;
        const merged = [...activeExistingAttachments, ...attachments];

        const dedupByUrl = new Map<string, any>();
        merged.forEach((item) => {
            const exactUrl = String(item.dataUrl || "").trim().toLowerCase();
            const key = exactUrl ? `url:${exactUrl}` : canonicalAttachmentName(String(item.name || ""));
            if (!key) return;
            if (!dedupByUrl.has(key)) {
                dedupByUrl.set(key, item);
            }
        });

        const finalAttachments = Array.from(dedupByUrl.values());
        const mergedChecklist = {
            sosAnswers: checklist.sosAnswers || {},
            metadata: {
                ...(checklist.metadata || {}),
                attachments: finalAttachments
            }
        };

        const firstAttachmentUrl = finalAttachments[0]?.dataUrl || reclamation.attachmentUrl || null;

        const updated = await prisma.reclamation.update({
            where: { id: reclamationId },
            data: {
                checklist: stringifyChecklistPayload(mergedChecklist),
                attachmentUrl: firstAttachmentUrl
            },
            include: {
                ticket: {
                    include: {
                        assignedTo: { select: { id: true, name: true } },
                        adv: { select: { id: true, name: true } }
                    }
                }
            }
        });
        await deleteClientAttachmentFiles(expiredAttachments);

        if (reclamation.ticketId && reclamation.ticket) {
            const historyUserId =
                Number.isFinite(requestedUserId) && requestedUserId > 0
                    ? requestedUserId
                    : reclamation.ticket.creatorId;
            const historyPayload = {
                message: updateMessage || `Documents complementaires client ajoutes: ${attachments.length}`,
                attachments: attachments.map((item) => ({
                    name: item.name,
                    url: item.dataUrl,
                    type: item.type,
                    kind: item.kind
                }))
            };

            await prisma.sav_history.create({
                data: {
                    ticketId: reclamation.ticketId,
                    equipmentId: reclamation.ticket.equipmentId,
                    userId: historyUserId,
                    action: "CLIENT_UPDATE",
                    note: JSON.stringify(historyPayload)
                }
            });
        }

        return NextResponse.json({
            success: true,
            reclamation: updated
        });
    } catch (error: any) {
        console.error("Client additional documents error:", error);
        return NextResponse.json({ error: error.message || "Erreur interne" }, { status: 500 });
    }
}


