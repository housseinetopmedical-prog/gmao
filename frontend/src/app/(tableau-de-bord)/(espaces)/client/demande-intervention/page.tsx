"use client";

/*
Commentaire simple du fichier :
- Espace : client.
- Partie : demande intervention.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import dynamic from "next/dynamic";

const ClientDemandeInterventionForm = dynamic(() => import("@/composants/client/FormulaireDemandeClient"), {
    loading: () => <div style={{ padding: "2rem", color: "var(--text-secondary)" }}>Chargement du formulaire...</div>,
    ssr: false,
});

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ClientDemandeInterventionPage() {
    return <ClientDemandeInterventionForm />;
}
/*
Resume simple :
- Ce fichier sert a la partie "demande intervention" de l espace "client".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
