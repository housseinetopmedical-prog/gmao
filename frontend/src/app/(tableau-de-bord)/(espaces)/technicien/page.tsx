/*
Commentaire simple du fichier :
- Espace : technicien.
- Partie : technicien.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { redirect } from "next/navigation";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function TechnicienRootPage() {
    redirect("/technicien/tableau-de-bord");
}
/*
Resume simple :
- Ce fichier sert a la partie "technicien" de l espace "technicien".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
