import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function resolveUploadFilePath(rawPath: string) {
    const requested = String(rawPath || "").trim();
    const basename = sanitizeFilename(path.basename(requested));
    if (!basename) return null;

    const candidates = [
        path.join(process.cwd(), "public", "uploads", basename),
        path.join(process.cwd(), "frontend", "public", "uploads", basename),
        path.join(process.cwd(), "..", "frontend", "public", "uploads", basename)
    ];

    return candidates;
}

function contentTypeFromFilename(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".gif") return "image/gif";
    if (ext === ".webp") return "image/webp";
    if (ext === ".heic") return "image/heic";
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".mov") return "video/quicktime";
    if (ext === ".webm") return "video/webm";
    if (ext === ".avi") return "video/x-msvideo";
    if (ext === ".mkv") return "video/x-matroska";
    if (ext === ".txt") return "text/plain; charset=utf-8";
    if (ext === ".doc") return "application/msword";
    if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (ext === ".xls") return "application/vnd.ms-excel";
    if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (ext === ".ppt") return "application/vnd.ms-powerpoint";
    if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (ext === ".rtf") return "application/rtf";
    return "application/octet-stream";
}

function isAllowedUpload(file: File) {
    const filename = String(file?.name || "").toLowerCase();
    const mime = String(file?.type || "").toLowerCase();
    const ext = path.extname(filename);

    const allowedExtensions = new Set([
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".rtf",
        ".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic",
        ".mp4", ".mov", ".webm", ".avi", ".mkv"
    ]);

    const allowedExactMime = new Set([
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "application/rtf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/heic",
        "video/mp4",
        "video/quicktime",
        "video/webm",
        "video/x-msvideo",
        "video/x-matroska"
    ]);

    if (mime.startsWith("image/") || mime.startsWith("video/")) return true;
    if (allowedExactMime.has(mime)) return true;
    if (allowedExtensions.has(ext)) return true;

    return false;
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const rawPath = searchParams.get("path") || searchParams.get("file") || searchParams.get("url");
        if (!rawPath) {
            return NextResponse.json({ error: "Parametre path requis." }, { status: 400 });
        }

        const candidates = resolveUploadFilePath(rawPath);
        if (!candidates || candidates.length === 0) {
            return NextResponse.json({ error: "Chemin fichier invalide." }, { status: 400 });
        }

        for (const candidate of candidates) {
            try {
                const data = await readFile(candidate);
                const filename = path.basename(candidate);
                return new NextResponse(data, {
                    status: 200,
                    headers: {
                        "Content-Type": contentTypeFromFilename(filename),
                        "Content-Disposition": `inline; filename=\"${filename}\"`,
                        "Cache-Control": "private, no-store, max-age=0"
                    }
                });
            } catch {
                // Try next candidate path.
            }
        }

        return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Lecture fichier impossible" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
            return NextResponse.json({ error: "Aucun fichier recu" }, { status: 400 });
        }

        if (!isAllowedUpload(file)) {
            return NextResponse.json(
                {
                    error:
                        "Type de fichier non autorisé. Formats acceptés: PDF, Office (doc/docx/xls/xlsx/ppt/pptx), TXT/RTF, images et vidéos."
                },
                { status: 400 }
            );
        }

        const uploadDir = path.join(process.cwd(), "public", "uploads");
        await mkdir(uploadDir, { recursive: true });

        const ext = path.extname(file.name || "").toLowerCase();
        const safeName = sanitizeFilename(path.basename(file.name || "fichier", ext));
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}${ext}`;
        const filepath = path.join(uploadDir, filename);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        await writeFile(filepath, buffer);
        const rawPath = `/uploads/${filename}`;
        const apiPath = `/api/uploads?path=${encodeURIComponent(rawPath)}`;

        return NextResponse.json({
            success: true,
            url: apiPath,
            rawUrl: rawPath,
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Téléversement impossible" }, { status: 500 });
    }
}

