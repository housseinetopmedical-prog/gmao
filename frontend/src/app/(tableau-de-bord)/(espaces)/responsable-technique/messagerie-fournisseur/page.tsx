"use client";

/*
Commentaire simple du fichier :
- Espace : responsable-technique.
- Partie : messagerie fournisseur.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import dynamic from "next/dynamic";

const SupplierMessagingWorkspace = dynamic(() => import("@/composants/espace-tickets/MessagerieFournisseur"), {
    loading: () => <div style={{ padding: "1.5rem", color: "var(--text-secondary)" }}>Chargement de la messagerie fournisseur...</div>,
    ssr: false
});

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ResponsableTechniqueSupplierMessagingPage() {
    return <SupplierMessagingWorkspace theme="admin" />;
}
/*
Resume simple :
- Ce fichier sert a la partie "messagerie fournisseur" de l espace "responsable-technique".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
