/*
Commentaire simple du fichier :
- Espace : admin.
- Partie : tickets clotures.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import ClosedTicketsTable from "@/composants/tickets/TableauTicketsClotures";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AdminClosedTicketsPage() {
    return <ClosedTicketsTable loadingLabel="Chargement des tickets traités..." emptyLabel="Aucun ticket traité." />;
}
/*
Resume simple :
- Ce fichier sert a la partie "tickets clotures" de l espace "admin".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
