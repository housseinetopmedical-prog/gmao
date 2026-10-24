import { NextResponse } from "next/server";
import prisma from "@/metier/base-donnees";
import { sendResetCodeEmail } from "@/metier/emails";
import { clearPasswordResetCode, issuePasswordResetCode } from "@/metier/stockage-reinitialisation-mdp";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: "E-mail requis." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Aucun utilisateur trouv\u00e9 avec cet e-mail." }, { status: 404 });
    }

    const issued = issuePasswordResetCode(email);
    try {
      await sendResetCodeEmail({
        to: email,
        code: issued.code,
        expiresInMinutes: issued.expiresInMinutes
      });

      return NextResponse.json({
        message: "Code envoy\u00e9 par e-mail. V\u00e9rifiez votre bo\u00eete Gmail."
      });
    } catch (mailError: any) {
      // Ne conserve pas un code si l'envoi Gmail a \u00e9chou\u00e9.
      clearPasswordResetCode(email);
      return NextResponse.json(
        {
          error:
            mailError?.message ||
            "Envoi Gmail indisponible. V\u00e9rifiez la configuration Gmail (GMAIL_USER / GMAIL_APP_PASSWORD)."
        },
        { status: 503 }
      );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Impossible d'envoyer le code." }, { status: 500 });
  }
}


