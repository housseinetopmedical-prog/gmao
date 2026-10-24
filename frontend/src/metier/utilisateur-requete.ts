import { AUTH_SESSION_COOKIE, verifySignedSession } from "@/metier/securite-auth";

export type AppRole = "ADMIN" | "MAGASINIER" | "ADV" | "TECHNICIAN" | "CLIENT" | "ACHATS" | "IMPORT" | "RESPONSABLE_TECHNIQUE" | "RESPONSABLE_FACTURATION" | "RESPONSABLE_APPELS_OFFRE";

function normalizeRole(raw: string | null): AppRole | null {
    const value = String(raw || "").trim().toUpperCase();
    if (
        value === "ADMIN" ||
        value === "MAGASINIER" ||
        value === "ADV" ||
        value === "TECHNICIAN" ||
        value === "CLIENT" ||
        value === "ACHATS" ||
        value === "RESPONSABLE_TECHNIQUE" ||
        value === "RESPONSABLE_FACTURATION" ||
        value === "RESPONSABLE_APPELS_OFFRE" ||
        value === "IMPORT"
    ) {
        return value;
    }
    return null;
}

export function getRequestUserContext(req: Request) {
    const signedSession = verifySignedSession(readCookie(req.headers.get("cookie"), AUTH_SESSION_COOKIE));
    const sessionRole = normalizeRole(signedSession?.role || null);
    if (signedSession && sessionRole) {
        return {
            role: sessionRole,
            userId: signedSession.id
        };
    }

    if (process.env.NODE_ENV !== "production") {
        const role = normalizeRole(req.headers.get("x-user-role"));
        const rawUserId = Number(req.headers.get("x-user-id") || 0);
        const userId = Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : null;

        return {
            role,
            userId
        };
    }

    return {
        role: null,
        userId: null
    };
}

function readCookie(rawCookie: string | null, name: string) {
    return String(rawCookie || "")
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`))
        ?.slice(name.length + 1) || null;
}

export function canReadStoreReview(role: AppRole | null): boolean {
    return role === "ADMIN" || role === "MAGASINIER" || role === "ADV" || role === "RESPONSABLE_TECHNIQUE";
}
