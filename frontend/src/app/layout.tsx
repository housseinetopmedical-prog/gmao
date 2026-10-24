import type { Metadata } from "next";
import "@/styles/globals.css";

// Ce fichier est la structure racine de toute l'application.
// Il charge le style global et prépare les informations générales du site.

export const metadata: Metadata = {
    title: "Top Médical SAV",
    description: "Plateforme de gestion du service après-vente biomédical",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="fr" suppressHydrationWarning>
            <head>
                {/* Ce script lit le thème enregistré avant l'affichage de la page. */}
                <script src="/theme-init.js" />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}

/* Résumé simple :
   Ce fichier est le point de départ visuel de la plateforme.
   Il charge les styles globaux, fixe les informations générales du site
   et applique le thème avant d'afficher le contenu. */
