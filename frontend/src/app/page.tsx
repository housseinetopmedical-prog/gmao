import { redirect } from "next/navigation";

// Cette page ne montre rien.
// Elle envoie directement l'utilisateur vers la connexion.
export default function HomePage() {
    redirect("/login");
}

/* Résumé simple :
   Quand quelqu'un arrive sur la racine du site,
   on le redirige vers la page de connexion. */
