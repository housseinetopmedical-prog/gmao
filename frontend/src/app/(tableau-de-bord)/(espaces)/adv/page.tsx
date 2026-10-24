/*
Commentaire simple du fichier :
- Espace : adv.
- Partie : adv.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import { redirect } from "next/navigation";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdvRootPage() {
    redirect("/adv/tableau-de-bord");
}
/*
Resume simple :
- Ce fichier sert a la partie "adv" de l espace "adv".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
