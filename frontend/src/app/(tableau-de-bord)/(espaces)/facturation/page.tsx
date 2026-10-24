"use client";

/*
Commentaire simple du fichier :
- Espace : facturation.
- Partie : facturation.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function FacturationIndexPage() {
    const router = useRouter();

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        router.replace("/facturation/Tableau-de-bord");
    }, [router]);

    return <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>Chargement de l'espace facturation...</div>;
}
/*
Resume simple :
- Ce fichier sert a la partie "facturation" de l espace "facturation".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
