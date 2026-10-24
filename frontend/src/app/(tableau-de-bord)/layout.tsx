"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/composants/commun/MenuLateral";
import { usePathname, useRouter } from "next/navigation";

// Cette table dit quels chemins chaque rôle a le droit d'ouvrir.
// Elle sert à éviter qu'un utilisateur entre dans un espace qui n'est pas le sien.
const roleAllowedPaths: Record<string, string[]> = {
    ADMIN: ["/"],
    TECHNICIAN: ["/technicien"],
    ADV: ["/adv", "/tickets", "/messagerie", "/client/demande-intervention"],
    MAGASINIER: ["/", "/magasinier", "/ticket", "/messagerie"],
    CLIENT: ["/client", "/client/demande-intervention", "/client/suivi", "/client/historique"],
    RESPONSABLE_TECHNIQUE: ["/responsable-technique", "/messagerie"],
    RESPONSABLE_FACTURATION: ["/facturation"],
    IMPORT: ["/import"],
    RESPONSABLE_APPELS_OFFRE: ["/appels-offre"]
};

// Cette table indique la page d'accueil principale de chaque rôle.
const roleHomePath: Record<string, string> = {
    ADMIN: "/admin/tableau-de-bord",
    TECHNICIAN: "/technicien/tableau-de-bord",
    ADV: "/adv/tableau-de-bord",
    CLIENT: "/client",
    RESPONSABLE_TECHNIQUE: "/responsable-technique/tableau-de-bord",
    RESPONSABLE_FACTURATION: "/facturation/Tableau-de-bord",
    IMPORT: "/import",
    RESPONSABLE_APPELS_OFFRE: "/appels-offre",
    MAGASINIER: "/magasinier/tableau-de-bord"
};

// Ces textes sont les noms affichés dans l'en-tête selon le rôle connecté.
const roleLabels: Record<string, string> = {
    ADMIN: "Espace admin",
    TECHNICIAN: "Espace technicien",
    ADV: "Espace ADV",
    MAGASINIER: "Espace magasinier",
    RESPONSABLE_TECHNIQUE: "Espace responsable technique",
    RESPONSABLE_FACTURATION: "Espace responsable facturation",
    IMPORT: "Espace import",
    RESPONSABLE_APPELS_OFFRE: "Espace AO",
    CLIENT: "Espace client"
};

// On vérifie ici si la session navigateur existe encore.
function hasActiveSessionCookie() {
    return document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .some((entry) => entry.startsWith("session_active="));
}

// Cette fonction vérifie si l'URL courante est autorisée pour le rôle actuel.
function isAllowedPath(role: string, path: string) {
    if (role === "ADMIN") return true;
    const allowedPaths = roleAllowedPaths[role] || [];
    return allowedPaths.some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`));
}

export default function DashboardLayout({
    children
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        // Ici on force un thème clair pour garder une interface stable dans le tableau de bord.
        localStorage.removeItem("theme");
        document.documentElement.setAttribute("data-theme", "light");

        const savedUser = localStorage.getItem("user");

        // Si la session n'existe plus, on vide les infos locales et on renvoie vers la connexion.
        if (!savedUser || !hasActiveSessionCookie()) {
            localStorage.removeItem("user");
            document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            router.push("/login");
            setIsLoading(false);
            return;
        }

        let parsedUser: any = null;
        try {
            parsedUser = JSON.parse(savedUser);
        } catch {
            localStorage.removeItem("user");
            document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            router.push("/login");
            setIsLoading(false);
            return;
        }
        setUser(parsedUser);

        // Si l'utilisateur ouvre une page qui n'est pas faite pour son rôle,
        // on le renvoie vers sa page d'accueil normale.
        if (!isAllowedPath(parsedUser.role, pathname)) {
            if (roleHomePath[parsedUser.role]) router.replace(roleHomePath[parsedUser.role]);
            else {
                localStorage.removeItem("user");
                document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
                router.replace("/login");
            }
        } else {
            setIsAuthorized(true);
        }

        setIsLoading(false);
    }, [router, pathname]);

    if (isLoading) {
        return (
            <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
                {/* Petit indicateur simple pendant la vérification de session. */}
                <div className="dashboard-auth-spinner" aria-label="Chargement" />
                <style jsx>{`
                    .dashboard-auth-spinner {
                        width: 48px;
                        height: 48px;
                        border-radius: 999px;
                        border: 4px solid rgba(148, 163, 184, 0.25);
                        border-top-color: var(--primary-blue);
                        animation: spin 0.8s linear infinite;
                    }

                    @keyframes spin {
                        from {
                            transform: rotate(0deg);
                        }
                        to {
                            transform: rotate(360deg);
                        }
                    }
                `}</style>
            </div>
        );
    }

    if (!isAuthorized) return null;

    const roleLabel = roleLabels[user?.role] || roleLabels.CLIENT;

    return (
        <div className="dashboard-root">
            {/* Menu latéral commun à tous les espaces internes. */}
            <Sidebar />
            <main className="main-content">
                <header className="main-header">
                    <div className="header-actions" style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginLeft: "auto" }}>
                        <div className="user-profile">
                            <div className="user-info">
                                <span className="user-name">{user?.name || "Utilisateur"}</span>
                                <span className="user-role">{roleLabel}</span>
                            </div>
                            <div className="user-avatar">{user?.name?.substring(0, 2).toUpperCase() || "US"}</div>
                        </div>
                    </div>
                </header>
                <div className="page-container">{children}</div>
            </main>
        </div>
    );
}

/* Résumé simple :
   Ce fichier protège les espaces internes.
   Il vérifie la session, contrôle l'accès selon le rôle,
   affiche le menu latéral et prépare l'en-tête commun. */
