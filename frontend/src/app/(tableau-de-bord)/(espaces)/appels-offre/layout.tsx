/*
Commentaire simple du fichier :
- Espace : appels-offre.
- Partie : layout.
- Un layout sert a entourer plusieurs pages du meme espace avec une structure commune.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function AppelsOffreLayout({ children }: { children: React.ReactNode }) {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className="page-container" style={{ padding: 0 }}>{children}</div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "layout" de l espace "appels-offre".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
