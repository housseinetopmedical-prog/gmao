import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/metier/base-donnees";
import { createSessionCookie, createSignedSession, hashPassword, isHashedPassword, verifyPassword } from "@/metier/securite-auth";

const DATABASE_UNAVAILABLE_MESSAGE =
    "Connexion impossible a la base de donnees. Verifiez que MySQL est demarre, puis reessayez.";

function normalizeIdentifier(value: unknown) {
    return String(value || "").trim();
}

function normalizePassword(value: unknown) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();
}

function isDatabaseUnavailableError(error: unknown) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
        return true;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001") {
        return true;
    }

    const message = error instanceof Error ? error.message : String(error);

    return /Can't reach database server|ECONNREFUSED|P1001/i.test(message);
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const identifier = normalizeIdentifier(body?.email || body?.identifier);
        const normalizedEmail = identifier.toLowerCase();
        const password = normalizePassword(body?.password);

        if (!identifier || !password) {
            return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
        }

        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: normalizedEmail },
                    { name: identifier }
                ]
            },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                password: true,
                role: true
            }
        });

        if (!user) {
            return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
        }

        const storedPassword = normalizePassword(user.password);

        if (!verifyPassword(password, storedPassword)) {
            return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
        }

        if (!isHashedPassword(storedPassword)) {
            await prisma.user.update({
                where: { id: user.id },
                data: { password: hashPassword(password) }
            });
        }

        const response = NextResponse.json({
            id: user.id,
            name: user.name,
            email: user.email,
            role: String(user.role),
            phone: user.phone
        });
        response.cookies.set(...createSessionCookie(createSignedSession({
            id: user.id,
            name: user.name,
            email: user.email,
            role: String(user.role)
        })));
        return response;
    } catch (error: unknown) {
        console.error("Login route error:", error);

        if (isDatabaseUnavailableError(error)) {
            return NextResponse.json({ error: DATABASE_UNAVAILABLE_MESSAGE }, { status: 503 });
        }

        return NextResponse.json({ error: "Erreur interne de connexion" }, { status: 500 });
    }
}


