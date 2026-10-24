/*
Commentaire simple du fichier :
- Espace : responsable-technique.
- Partie : layout.
- Un layout sert a entourer plusieurs pages du meme espace avec une structure commune.
- Le but de ce commentaire est seulement d expliquer le role du fichier sans changer son fonctionnement.
*/
// Cette partie importe les outils, composants et fonctions utiles pour cette page.
import styles from "@/app/(tableau-de-bord)/(espaces)/adv/adv.module.css";

// Cette fonction principale prepare le comportement de la page et les informations a afficher.
export default function ResponsableTechniqueLayout({ children }: { children: React.ReactNode }) {
    // Cette partie affiche l interface visible a l ecran.
    return (
        <div className={styles.shell}>
            <section className={styles.content}>{children}</section>
        </div>
    );
}
/*
Resume simple :
- Ce fichier sert a la partie "layout" de l espace "responsable-technique".
- Il garde la meme interface et le meme workflow de la plateforme.
- Les commentaires ajoutes ici sont la pour aider a comprendre le code plus facilement.
*/
