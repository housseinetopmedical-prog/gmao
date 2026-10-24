"use client";

/*
Commentaire simple du fichier :
- Espace : responsable-technique.
- Partie : responsable technique.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ResponsableTechniqueIndexPage() {
    const router = useRouter();

    // Cette partie lance une action automatique quand la page s ouvre ou quand une valeur change.
    useEffect(() => {
        router.replace("/responsable-technique/tableau-de-bord");
    }, [router]);

    return null;
}
/*
Resume simple :
- Ce fichier sert a la partie "responsable technique" de l espace "responsable-technique".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
