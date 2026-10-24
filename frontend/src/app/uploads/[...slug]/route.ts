import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const runtime = "nodejs";

function sanitizeFilename(name: string) {
    return String(name || "").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function contentTypeFromFilename(filename: string) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") return "application/pdf";
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".gif") return "image/gif";
    if (ext === ".webp") return "image/webp";
    if (ext === ".txt") return "text/plain; charset=utf-8";
    if (ext === ".doc") return "application/msword";
    if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/octet-stream";
}

export async function GET(_: Request, context: any) {
    try {
        const params = await context.params;
        const slug = Array.isArray(params?.slug) ? params.slug : [];
        const merged = slug.join("/");
        const basename = sanitizeFilename(path.basename(merged));

        if (!basename) {
            return NextResponse.json({ error: "Fichier invalide." }, { status: 400 });
        }

        const candidates = [
            path.join(process.cwd(), "public", "uploads", basename),
            path.join(process.cwd(), "frontend", "public", "uploads", basename),
            path.join(process.cwd(), "..", "frontend", "public", "uploads", basename)
        ];

        for (const candidate of candidates) {
            try {
                const data = await readFile(candidate);
                return new NextResponse(data, {
                    status: 200,
                    headers: {
                        "Content-Type": contentTypeFromFilename(basename),
                        "Content-Disposition": `inline; filename="${basename}"`,
                        "Cache-Control": "private, no-store, max-age=0"
                    }
                });
            } catch {
                // Continue to next candidate
            }
        }

        return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Lecture fichier impossible." }, { status: 500 });
    }
}

