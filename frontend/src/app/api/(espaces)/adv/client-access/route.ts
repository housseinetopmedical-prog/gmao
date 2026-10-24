import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { sendClientAccountCreatedEmail } from "@/metier/emails";

import { hashPassword } from "@/metier/securite-auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function normalizePhoneList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0);
}

export async function GET() {
    try {
        const clients = await prisma.user.findMany({
            where: { role: "CLIENT" },
            select: {
                id: true,
                name: true,
                email: true,
                password: true,
                phone: true,
                createdAt: true
            },
            orderBy: { createdAt: "desc" }
        });

        return NextResponse.json(clients.map((client) => ({
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            createdAt: client.createdAt,
            passwordConfigured: true,
            visiblePassword: String(client.password || "").startsWith("scrypt$") ? "" : client.password
        })));
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur lecture clients." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const advUserId = Number(body?.advUserId || 0);
        const reclamationId = Number(body?.reclamationId || 0);
        const inputEmail = normalizeEmail(body?.email);
        const password = String(body?.password || "");
        const firstName = String(body?.firstName || "").trim();
        const lastName = String(body?.lastName || "").trim();
        let clientName = `${firstName} ${lastName}`.trim();
        const mobilePhones = normalizePhoneList(body?.mobilePhones);
        const fallbackMobile = String(body?.mobilePhone || "").trim();
        const landlinePhone = String(body?.landlinePhone || "").trim();
        const resolvedMobilePhones = mobilePhones.length > 0 ? mobilePhones : fallbackMobile ? [fallbackMobile] : [];
        let clientPhone = [
            ...resolvedMobilePhones.map((phone, index) => `Portable${resolvedMobilePhones.length > 1 ? ` ${index + 1}` : ""}: ${phone}`),
            landlinePhone ? `Fixe: ${landlinePhone}` : ""
        ]
            .filter(Boolean)
            .join(" | ");

        if (!advUserId) {
            return NextResponse.json({ error: "Utilisateur ADV requis." }, { status: 400 });
        }
        if (!lastName) {
            return NextResponse.json({ error: "Nom requis." }, { status: 400 });
        }
        if (resolvedMobilePhones.length === 0) {
            return NextResponse.json({ error: "Portable requis." }, { status: 400 });
        }
        if (!password || password.length < 6) {
            return NextResponse.json({ error: "Le mot de passe doit contenir au moins 6 caracteres." }, { status: 400 });
        }

        const advUser = await prisma.user.findUnique({
            where: { id: advUserId },
            select: { id: true, role: true }
        });

        if (!advUser || !["ADV", "ADMIN"].includes(String(advUser.role || ""))) {
            return NextResponse.json({ error: "Seul ADV ou ADMIN peut creer un acces client." }, { status: 403 });
        }

        let resolvedEmail = inputEmail;
        if (reclamationId > 0) {
            const reclamation = await prisma.reclamation.findUnique({
                where: { id: reclamationId },
                select: {
                    customerName: true,
                    contactEmail: true,
                    phone: true
                }
            });

            if (reclamation) {
                if (!clientName) clientName = String(reclamation.customerName || "").trim();
                if (!clientPhone) clientPhone = String(reclamation.phone || "").trim();
                if (!resolvedEmail) resolvedEmail = normalizeEmail(reclamation.contactEmail);
            }
        }

        if (!resolvedEmail || !EMAIL_REGEX.test(resolvedEmail)) {
            return NextResponse.json({ error: "E-mail client invalide." }, { status: 400 });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email: resolvedEmail },
            select: { id: true, role: true, name: true, phone: true }
        });

        if (existingUser && String(existingUser.role) !== "CLIENT") {
            return NextResponse.json(
                { error: "Cet e-mail appartient deja a un utilisateur interne (non client)." },
                { status: 409 }
            );
        }

        const resolvedName = clientName || existingUser?.name || "Client";
        const resolvedPhone = clientPhone || existingUser?.phone || null;
        const protectedPassword = hashPassword(password);

        const savedUser = existingUser
            ? await prisma.user.update({
                  where: { id: existingUser.id },
                  data: {
                      name: resolvedName,
                      phone: resolvedPhone,
                      password: protectedPassword,
                      role: "CLIENT"
                  },
                  select: { id: true, name: true, email: true, role: true, phone: true }
              })
            : await prisma.user.create({
                  data: {
                      name: resolvedName,
                      email: resolvedEmail,
                      phone: resolvedPhone,
                      password: protectedPassword,
                      role: "CLIENT"
                  },
                  select: { id: true, name: true, email: true, role: true, phone: true }
              });

        const isCreated = !existingUser;
        const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const loginUrl = `${origin.replace(/\/$/, "")}/login`;
        const clientMessage = [
            `Bonjour ${savedUser.name}, votre compte client Top Médical SAV a été créé.`,
            `Lien: ${loginUrl}`,
            `E-mail: ${savedUser.email}`,
            `Mot de passe: ${password}`
        ].join("\n");
        const historyMessage = [
            `Compte client Top Médical SAV créé pour ${savedUser.name}.`,
            `Lien: ${loginUrl}`,
            `E-mail: ${savedUser.email}`,
            "Mot de passe: transmis au client uniquement."
        ].join("\n");

        let emailSent = false;
        let emailError: string | null = null;
        try {
            await sendClientAccountCreatedEmail({
                to: savedUser.email,
                name: savedUser.name,
                email: savedUser.email,
                password,
                loginUrl
            });
            emailSent = true;
        } catch (error: any) {
            emailError = error?.message || "E-mail non envoyé.";
        }

        if (reclamationId > 0) {
            const linked = await prisma.reclamation.findUnique({
                where: { id: reclamationId },
                select: {
                    ticket: { select: { id: true, equipmentId: true } }
                }
            });

            if (linked?.ticket?.id) {
                await prisma.sav_history.create({
                    data: {
                        ticketId: linked.ticket.id,
                        equipmentId: linked.ticket.equipmentId,
                        userId: advUserId,
                        action: "CLIENT_ACCOUNT_CREATED",
                        note: historyMessage
                    }
                }).catch(() => {});
            }
        }

        return NextResponse.json({
            success: true,
            created: isCreated,
            message: isCreated
                ? "Accès client créé et enregistré en base de données."
                : "Accès client mis à jour (mot de passe inclus) en base de données.",
            loginUrl,
            clientMessage,
            emailSent,
            emailError,
            user: savedUser
        });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || "Erreur creation acces client." }, { status: 500 });
    }
}


