import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { verifyPasswordResetCode } from "@/metier/stockage-reinitialisation-mdp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();

    if (!email || !code) {
      return NextResponse.json({ error: "E-mail et code requis." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 });
    }

    const verification = verifyPasswordResetCode(email, code);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    return NextResponse.json({ message: "Code valide. Vous pouvez definir un nouveau mot de passe." });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Verification impossible." }, { status: 500 });
  }
}


