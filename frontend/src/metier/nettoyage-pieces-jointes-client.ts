import { unlink } from "fs/promises";
import path from "path";
import type { ClientAttachment } from "@/metier/workflow-client";
import { isClientAttachmentExpired } from "@/metier/workflow-client";

function sanitizeFilename(name: string) {
    return String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extractUploadBasename(rawUrl: string | null | undefined) {
    const raw = String(rawUrl || "").trim();
    if (!raw) return "";

    try {
        if (raw.startsWith("/api/uploads")) {
            const parsed = new URL(raw, "http://local");
            const nestedPath = parsed.searchParams.get("path") || parsed.searchParams.get("file") || parsed.searchParams.get("url") || "";
            return sanitizeFilename(path.basename(decodeURIComponent(nestedPath)));
        }

        const noQuery = raw.split("?")[0].split("#")[0];
        return sanitizeFilename(path.basename(decodeURIComponent(noQuery)));
    } catch {
        return sanitizeFilename(path.basename(raw.split("?")[0].split("#")[0]));
    }
}

function resolveUploadCandidates(rawUrl: string | null | undefined) {
    const basename = extractUploadBasename(rawUrl);
    if (!basename) return [];

    return [
        path.join(process.cwd(), "public", "uploads", basename),
        path.join(process.cwd(), "frontend", "public", "uploads", basename),
        path.join(process.cwd(), "..", "frontend", "public", "uploads", basename)
    ];
}

export function getExpiredClientAttachments(
    attachments: ClientAttachment[] | null | undefined,
    fallbackSentAt?: string | null,
    referenceDate: Date = new Date()
) {
    if (!Array.isArray(attachments)) return [];
    return attachments.filter((attachment) => isClientAttachmentExpired(attachment, fallbackSentAt, referenceDate));
}

export async function deleteClientAttachmentFiles(attachments: ClientAttachment[] | null | undefined) {
    const paths = new Set<string>();

    (attachments || []).forEach((attachment) => {
        resolveUploadCandidates(attachment.dataUrl).forEach((candidate) => paths.add(candidate));
    });

    await Promise.all(
        Array.from(paths).map(async (candidate) => {
            try {
                await unlink(candidate);
            } catch {
                // Fichier déjà absent ou chemin non utilisé dans cet environnement.
            }
        })
    );
}


