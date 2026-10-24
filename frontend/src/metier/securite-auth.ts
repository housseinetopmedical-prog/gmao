import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const AUTH_SESSION_COOKIE = "topmedical_session";

const PASSWORD_PREFIX = "scrypt$";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type SignedSessionUser = {
    id: number;
    role: string;
    email?: string | null;
    name?: string | null;
};

type CookieOptions = {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
};

function base64UrlEncode(value: Buffer | string) {
    return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
    return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
    const secret = process.env.AUTH_SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (secret) return secret;

    if (process.env.NODE_ENV === "production") {
        throw new Error("AUTH_SESSION_SECRET doit etre defini en production.");
    }

    return "topmedical-dev-session-secret-change-me";
}

function sign(value: string) {
    return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function hashPassword(password: string) {
    const salt = randomBytes(16).toString("base64url");
    const hash = scryptSync(String(password || "").trim(), salt, 64).toString("base64url");
    return `${PASSWORD_PREFIX}${salt}$${hash}`;
}

export function isHashedPassword(storedPassword: string) {
    return String(storedPassword || "").startsWith(PASSWORD_PREFIX);
}

export function verifyPassword(password: string, storedPassword: string) {
    const stored = String(storedPassword || "");
    if (!isHashedPassword(stored)) {
        return timingSafeStringEqual(stored, password);
    }

    const [, salt, expectedHash] = stored.split("$");
    if (!salt || !expectedHash) return false;

    const actualHash = scryptSync(password, salt, 64).toString("base64url");
    return timingSafeStringEqual(actualHash, expectedHash);
}

function timingSafeStringEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignedSession(user: SignedSessionUser) {
    const payload = {
        id: Number(user.id),
        role: String(user.role || ""),
        email: user.email || null,
        name: user.name || null,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySignedSession(rawSession: string | null | undefined): SignedSessionUser | null {
    const raw = String(rawSession || "");
    const [encodedPayload, signature] = raw.split(".");
    if (!encodedPayload || !signature || !timingSafeStringEqual(sign(encodedPayload), signature)) {
        return null;
    }

    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const exp = Number(payload?.exp || 0);
        const id = Number(payload?.id || 0);
        const role = String(payload?.role || "");

        if (!id || !role || !exp || exp < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return {
            id,
            role,
            email: payload?.email || null,
            name: payload?.name || null
        };
    } catch {
        return null;
    }
}

export function createSessionCookie(value: string): [string, string, CookieOptions] {
    return [
        AUTH_SESSION_COOKIE,
        value,
        {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: SESSION_MAX_AGE_SECONDS
        }
    ];
}

export function createExpiredSessionCookie(): [string, string, CookieOptions] {
    return [
        AUTH_SESSION_COOKIE,
        "",
        {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 0
        }
    ];
}
