"use client";

import { memo, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard,
    Ticket,
    LogOut,
    Package,
    AlertTriangle,
    FileText,
    MessageSquare,
    Clock,
    ClipboardCheck,
    ClipboardList,
    Gauge,
    UserPlus,
    ReceiptText,
    CalendarDays
} from "lucide-react";
import { clsx } from "clsx";
import MedicalDeviceLogoIcon from "./LogoDispositifMedical";

import styles from "./MenuLateral.module.css";

// Un élément de menu contient juste une icône, un nom et un lien.
type MenuItem = {
    icon: any;
    label: string;
    href: string;
};

// Menus de navigation par rôle.
// Chaque liste doit suivre exactement les pages visibles dans l'interface.
const TECHNICIEN_MENU: MenuItem[] = [
    { icon: Gauge, label: "Espace technicien", href: "/technicien/tableau-de-bord" },
    { icon: Ticket, label: "Tickets actifs", href: "/technicien/mes-tickets" },
    { icon: ClipboardList, label: "Marchés", href: "/technicien/marches" },
    { icon: CalendarDays, label: "Calendrier", href: "/technicien/calendrier" },
    { icon: MessageSquare, label: "Messagerie", href: "/technicien/messagerie" },
    { icon: FileText, label: "Historique", href: "/technicien/historique" }
];

const ADV_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace ADV", href: "/adv/tableau-de-bord" },
    { icon: UserPlus, label: "Nouveau client", href: "/adv/clients" },
    { icon: AlertTriangle, label: "Tickets à compléter", href: "/adv/tickets" },
    { icon: Clock, label: "Tickets traités", href: "/adv/tickets-clotures" },
    { icon: Ticket, label: "Messagerie", href: "/messagerie" }
];

const MAGASINIER_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace magasinier", href: "/magasinier/tableau-de-bord" },
    { icon: ClipboardCheck, label: "Tickets", href: "/ticket/infos-DP" },
    { icon: Ticket, label: "Messagerie", href: "/messagerie" }
];

const CLIENT_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace client", href: "/client" },
    { icon: FileText, label: "Demandes archivées", href: "/client/historique" }
];

const RESPONSABLE_TECHNIQUE_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace responsable technique", href: "/responsable-technique/tableau-de-bord" },
    { icon: ClipboardCheck, label: "Tickets actifs", href: "/responsable-technique/affectation" },
    { icon: MessageSquare, label: "Messagerie", href: "/responsable-technique/messagerie" },
    { icon: FileText, label: "Tickets traités", href: "/responsable-technique/historique" },
    { icon: MessageSquare, label: "Messagerie vers fournisseur", href: "/responsable-technique/messagerie-fournisseur" }
];

const RESPONSABLE_FACTURATION_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace facturation", href: "/facturation/Tableau-de-bord" },
    { icon: ReceiptText, label: "Ticket créé", href: "/facturation/Ticket-entree" },
    { icon: AlertTriangle, label: "Tickets actifs", href: "/facturation/tickets-actifs" },
    { icon: FileText, label: "Historique des tickets", href: "/facturation/historique" },
    { icon: Ticket, label: "Messagerie", href: "/facturation/Messagerie" }
];

const IMPORT_MENU: MenuItem[] = [
    { icon: Package, label: "Espace import", href: "/import" },
    { icon: ClipboardCheck, label: "Demandes à traiter", href: "/import/demandes-a-traiter" },
    { icon: MessageSquare, label: "Messagerie", href: "/import/messagerie" },
    { icon: Clock, label: "Historique", href: "/import/historique-receptions" }
];

const RESPONSABLE_APPELS_OFFRE_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace AO", href: "/appels-offre" },
    { icon: ClipboardList, label: "Marchés", href: "/appels-offre/marches" },
    { icon: FileText, label: "Historique des marchés", href: "/appels-offre/historique-marches" },
    { icon: CalendarDays, label: "Calendrier", href: "/appels-offre/calendrier" },
    { icon: MessageSquare, label: "Messagerie", href: "/appels-offre/messagerie" }
];

const ADMIN_MENU: MenuItem[] = [
    { icon: LayoutDashboard, label: "Espace admin", href: "/admin/tableau-de-bord" },
    { icon: UserPlus, label: "Postes et clients", href: "/admin/acteurs" },
    { icon: Ticket, label: "Tickets actifs", href: "/admin/tickets" },
    { icon: ClipboardList, label: "Marchés", href: "/admin/marches" },
    { icon: FileText, label: "Historique des marchés", href: "/admin/historique-marches" },
    { icon: CalendarDays, label: "Calendrier", href: "/admin/calendrier" },
    { icon: Package, label: "Import", href: "/admin/import" },
    { icon: ClipboardCheck, label: "Infos DP", href: "/admin/infos-dp" },
    { icon: MessageSquare, label: "Messagerie", href: "/admin/messagerie" },
    { icon: MessageSquare, label: "Messagerie vers fournisseur", href: "/admin/messagerie-fournisseur" },
    { icon: Clock, label: "Tickets traités", href: "/admin/tickets-clotures" },
];

// Cette fonction choisit la bonne liste de menu selon le rôle connecté.
function getMenuItems(role: string): MenuItem[] {
    if (role === "ADMIN") return ADMIN_MENU;
    if (role === "TECHNICIAN") return TECHNICIEN_MENU;
    if (role === "ADV") return ADV_MENU;
    if (role === "MAGASINIER") return MAGASINIER_MENU;
    if (role === "CLIENT") return CLIENT_MENU;
    if (role === "RESPONSABLE_TECHNIQUE") return RESPONSABLE_TECHNIQUE_MENU;
    if (role === "RESPONSABLE_FACTURATION") return RESPONSABLE_FACTURATION_MENU;
    if (role === "IMPORT") return IMPORT_MENU;
    if (role === "RESPONSABLE_APPELS_OFFRE") return RESPONSABLE_APPELS_OFFRE_MENU;
    return [];
}

export const Sidebar = memo(function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [userRole, setUserRole] = useState<string>("CLIENT");
    const menuItems = useMemo(() => getMenuItems(userRole), [userRole]);

    useEffect(() => {
        // On lit le rôle depuis le stockage local pour afficher le bon menu.
        try {
            const user = JSON.parse(localStorage.getItem("user") || "{}");
            if (user.role) {
                setUserRole(user.role);
            }
        } catch {
            setUserRole("CLIENT");
        }
    }, []);

    // Déconnexion simple : on efface la session locale puis on revient à la connexion.
    const handleLogout = async () => {
        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // La deconnexion locale reste prioritaire si le reseau echoue.
        }
        localStorage.removeItem("user");
        document.cookie = "session_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push("/login");
        router.refresh();
    };

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div className={styles.logoContainer}>
                    <MedicalDeviceLogoIcon size={54} />
                </div>
            </div>

            <nav className={styles.sidebarNav}>
                {/* On affiche ici tous les liens autorisés pour l'utilisateur. */}
                {menuItems.map((item) => (
                    <Link key={`${item.href}-${item.label}`} href={item.href} prefetch={false} className={clsx(styles.navItem, pathname === item.href && styles.navItemActive)}>
                        <item.icon size={20} />
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className={styles.sidebarFooter}>
                <button type="button" className={clsx(styles.navItem, styles.logoutBtn)} onClick={handleLogout}>
                    <LogOut size={20} />
                    <span>Déconnexion</span>
                </button>
            </div>
        </div>
    );
});

/* Résumé simple :
   Ce fichier construit le menu latéral de la plateforme.
   Il affiche des liens différents selon le rôle
   et gère aussi la déconnexion. */
