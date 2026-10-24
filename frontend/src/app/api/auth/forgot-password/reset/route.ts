import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { consumePasswordResetCode } from "@/metier/stockage-reinitialisation-mdp";
import { hashPassword } from "@/metier/securite-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();
    const newPassword = String(body?.newPassword || "");

    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: "E-mail, code et nouveau mot de passe requis." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins 6 caracteres." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    const consumeResult = consumePasswordResetCode(email, code);
    if (!consumeResult.ok) {
      return NextResponse.json({ error: consumeResult.error }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashPassword(newPassword) }
    });

    return NextResponse.json({ message: "Mot de passe reinitialise avec succes." });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Reinitialisation impossible." }, { status: 500 });
  }
}


