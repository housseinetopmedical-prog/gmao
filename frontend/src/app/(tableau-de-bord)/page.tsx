"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Certains tableaux de bord sont chargés de façon dynamique.
// Cela évite de charger des blocs inutiles trop tôt.
const MagasinierDashboard = dynamic(() => import("@/composants/tableaux-de-bord/TableauMagasinier"), {
    loading: () => <DashboardLoader />,
    ssr: false
});
const ResponsableFacturationDashboard = dynamic(() => import("@/composants/tableaux-de-bord/TableauFacturation"), {
    loading: () => <DashboardLoader />,
    ssr: false
});

// Cette table relie chaque rôle à sa vraie page d'accueil.
const roleHomePath: Record<string, string> = {
    ADMIN: "/admin/tableau-de-bord",
    TECHNICIAN: "/technicien/tableau-de-bord",
    CLIENT: "/client",
    ADV: "/adv/tableau-de-bord",
    MAGASINIER: "/magasinier/tableau-de-bord",
    RESPONSABLE_TECHNIQUE: "/responsable-technique/tableau-de-bord",
    RESPONSABLE_FACTURATION: "/facturation/Tableau-de-bord",
    IMPORT: "/import",
    RESPONSABLE_APPELS_OFFRE: "/appels-offre"
};

// On vérifie encore la session avant de choisir où envoyer l'utilisateur.
function hasActiveSessionCookie() {
    return document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .some((entry) => entry.startsWith("session_active="));
}

// Petit écran de chargement utilisé pendant les redirections.
function DashboardLoader() {
    return (
        <div className="dashboard-loader" aria-label="Chargement du tableau de bord">
            <div className="dashboard-loader__spinner" />
            <style jsx>{`
                .dashboard-loader {
                    height: 50vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .dashboard-loader__spinner {
                    width: 32px;
                    height: 32px;
                    border-radius: 999px;
                    border: 3px solid rgba(148, 163, 184, 0.25);
                    border-top-color: var(--primary-blue, #dc2626);
                    animation: dashboard-spin 0.8s linear infinite;
                }

                @keyframes dashboard-spin {
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

export default function DashboardPage() {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const savedUser = localStorage.getItem("user");

        // Sans session valide, on renvoie vers la connexion.
        if (!savedUser || !hasActiveSessionCookie()) {
            localStorage.removeItem("user");
            document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            router.replace("/login");
            setLoading(false);
            return;
        }

        try {
            setUser(JSON.parse(savedUser));
        } catch {
            localStorage.removeItem("user");
            document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
            router.replace("/login");
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        if (!user?.role) {
            return;
        }

        // Dès qu'on connaît le rôle, on envoie l'utilisateur vers son espace.
        const targetPath = roleHomePath[user.role];
        if (targetPath) {
            router.replace(targetPath);
        }
    }, [user?.role, router]);

    if (loading || !user) {
        return <DashboardLoader />;
    }

    if (roleHomePath[user.role]) {
        return <DashboardLoader />;
    }

    switch (user.role) {
        case "MAGASINIER":
            return <MagasinierDashboard />;
        case "RESPONSABLE_FACTURATION":
            return <ResponsableFacturationDashboard />;
        default:
            return <MagasinierDashboard />;
    }
}

/* Résumé simple :
   Cette page sert surtout de porte d'entrée.
   Elle lit le rôle connecté puis redirige automatiquement
   vers le bon tableau de bord. */
