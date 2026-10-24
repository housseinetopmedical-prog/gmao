/*
Commentaire simple du fichier :
- Espace : responsable-technique.
- Partie : historique.
- Cette page est l entree ou l ecran principal de cette partie de la plateforme.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import ClosedTicketsTable from "@/composants/tickets/TableauTicketsClotures";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ResponsableTechniqueHistoriquePage() {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <ClosedTicketsTable
            loadingLabel="Chargement de l'historique responsable technique..."
            emptyLabel="Aucun ticket clôturé pour le moment."
        />
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "historique" de l espace "responsable-technique".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
